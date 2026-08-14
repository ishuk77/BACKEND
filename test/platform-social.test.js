const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'platform-social-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'platform-social-test-jwt-secret';
const { start, db } = require('../src/server');
let server; let port;

function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
            let output = ''; res.on('data', chunk => { output += chunk; }); res.on('end', () => {
                try { resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }); } catch (_) { resolve({ status: res.statusCode, data: {} }); }
            });
        });
        req.on('error', reject); if (payload) req.write(payload); req.end();
    });
}
function run(sql, values = []) {
    return new Promise((resolve, reject) => db.run(sql, values, err => err ? reject(err) : resolve()));
}

function rawRequest(method, route, { body = '', token, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(body);
        const requestHeaders = { ...headers, 'Content-Length': payload.length };
        if (token) requestHeaders.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: requestHeaders }, res => {
            let output = ''; res.on('data', chunk => { output += chunk; }); res.on('end', () => {
                try { resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }); } catch (_) { resolve({ status: res.statusCode, data: {} }); }
            });
        });
        req.on('error', reject); req.write(payload); req.end();
    });
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => db.close(resolve)); fs.rmSync(databasePath, { force: true }); });

test('platform account, group admission, social privacy, and moderation contracts', async () => {
    const admin = await request('POST', '/api/platform-admin', { body: { prenom: 'Admin', name: 'Social', phone: '+22990000009', idNumber: 'ADMIN-SOCIAL' } });
    const createAccount = async (prenom, phone) => {
        const browserSessionId = `platform-social-session-${phone.replace(/\D/g, '')}`;
        const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
        const verification = await request('POST', '/api/platform/phone-verifications/verify', {
            body: { phone, browserSessionId, code: delivery.data.sandboxCode }
        });
        return request('POST', '/api/platform/auth/register', {
            body: {
                prenom, name: 'Membre', phone, identityNumber: `ID-${phone.replace(/\D/g, '')}`,
                pin: '1234', pinConfirmation: '1234', browserSessionId,
                phoneVerificationToken: verification.data.verificationToken
            }
        });
    };
    const alice = await createAccount('Alice', '+22991110001');
    const bob = await createAccount('Bob', '+22991110002');
    const charlie = await createAccount('Charlie', '+22991110003');
    const dana = await createAccount('Dana', '+22991110004');
    assert.equal(alice.status, 201); assert.equal(bob.status, 201); assert.equal(charlie.status, 201); assert.equal(dana.status, 201);
    assert.equal((await request('PUT', '/api/platform/profile', {
        token: dana.data.accessToken,
        body: { prenom: 'Dana', name: 'Membre', visibility: 'public', availability: 'online' }
    })).status, 200);
    assert.equal((await request('POST', '/api/platform/contacts', {
        token: alice.data.accessToken,
        body: { phone: '+22991110002' }
    })).status, 201);

    const groupBody = { name: 'AVEC sociale', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123456' };
    assert.equal((await request('POST', '/api/groups', { body: groupBody })).status, 401);
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [alice.data.account.id]);
    const group = await request('POST', '/api/groups', { token: alice.data.accessToken, body: groupBody });
    assert.equal(group.status, 201);

    const join = await request('POST', `/api/platform/groups/${group.data.groupId}/join-requests`, { token: bob.data.accessToken, body: { note: 'Je souhaite participer.' } });
    assert.equal(join.status, 201);
    const pending = await request('GET', `/api/platform/groups/${group.data.groupId}/join-requests`, { token: alice.data.accessToken });
    assert.equal(pending.data.requests.length, 1);
    assert.equal((await request('PUT', `/api/platform/join-requests/${pending.data.requests[0].id}`, { token: alice.data.accessToken, body: { status: 'approved' } })).status, 200);
    const candidates = await request('GET', `/api/platform/groups/${group.data.groupId}/invite-candidates`, { token: alice.data.accessToken });
    assert.equal(candidates.status, 200);
    assert.ok(candidates.data.members.some(member => member.id === dana.data.account.id));
    assert.equal((await request('GET', `/api/platform/groups/${group.data.groupId}/invite-candidates`, { token: bob.data.accessToken })).status, 403);

    const invitation = await request('POST', `/api/platform/groups/${group.data.groupId}/invitations`, { token: alice.data.accessToken, body: { account_id: charlie.data.account.id, role: 'membre' } });
    assert.equal(invitation.status, 201);
    const received = await request('GET', '/api/platform/invitations', { token: charlie.data.accessToken });
    assert.equal(received.data.invitations[0].status, 'pending');
    assert.equal((await request('PUT', `/api/platform/invitations/${received.data.invitations[0].id}`, { token: charlie.data.accessToken, body: { status: 'accepted' } })).status, 200);

    assert.equal((await request('POST', `/api/platform/dms/${bob.data.account.id}`, { token: alice.data.accessToken, body: { message: 'Pas encore amis' } })).status, 403);
    const friendship = await request('POST', '/api/platform/friends/requests', { token: alice.data.accessToken, body: { account_id: bob.data.account.id } });
    assert.equal(friendship.status, 201);
    const bobFriends = await request('GET', '/api/platform/friends', { token: bob.data.accessToken });
    assert.equal((await request('PUT', `/api/platform/friends/${bobFriends.data.friends[0].id}`, { token: bob.data.accessToken, body: { status: 'accepted' } })).status, 200);
    assert.equal((await request('POST', `/api/platform/dms/${bob.data.account.id}`, { token: alice.data.accessToken, body: { message: 'Bonjour, contact.' } })).status, 201);
    assert.equal((await request('GET', `/api/platform/dms/${bob.data.account.id}`, { token: charlie.data.accessToken })).status, 403);
    const attachment = await rawRequest('POST', `/api/platform/dm-attachments/${bob.data.account.id}`, {
        token: alice.data.accessToken, body: 'Document de discussion',
        headers: { 'Content-Type': 'text/plain', 'X-File-Name': '../discussion.txt' }
    });
    assert.equal(attachment.status, 201);
    assert.equal((await request('POST', `/api/platform/dms/${bob.data.account.id}`, {
        token: alice.data.accessToken, body: { message: '', attachment_id: attachment.data.attachment.id }
    })).status, 201);
    const messages = await request('GET', `/api/platform/dms/${alice.data.account.id}`, { token: bob.data.accessToken });
    assert.equal(messages.status, 200, JSON.stringify(messages.data));
    const attachedMessage = messages.data.messages.at(-1);
    assert.equal(attachedMessage.attachment_name, 'discussion.txt');
    assert.equal((await request('POST', `/api/platform/dms/${alice.data.account.id}/messages/${attachedMessage.id}/reactions`, {
        token: bob.data.accessToken, body: { emoji: '🎉' }
    })).status, 201);
    assert.equal((await request('GET', `/api/platform/dms/${bob.data.account.id}`, { token: alice.data.accessToken })).data.messages.at(-1).reactions[0].emoji, '🎉');

    const post = await request('POST', '/api/social/posts', { token: alice.data.accessToken, body: { body: 'Publication réservée aux contacts', visibility: 'friends' } });
    assert.equal(post.status, 201);
    assert.equal((await request('GET', `/api/social/posts/${post.data.id}`, { token: bob.data.accessToken })).status, 200);
    assert.equal((await request('GET', `/api/social/posts/${post.data.id}`, { token: charlie.data.accessToken })).status, 403);
    const comment = await request('POST', `/api/social/posts/${post.data.id}/comments`, { token: bob.data.accessToken, body: { body: 'Très utile.' } });
    assert.equal(comment.status, 201);
    assert.equal((await request('POST', `/api/social/comments/${comment.data.id}/reactions`, { token: alice.data.accessToken, body: { reaction: '❤️' } })).status, 201);
    const postWithComment = await request('GET', `/api/social/posts/${post.data.id}`, { token: alice.data.accessToken });
    assert.equal(postWithComment.data.comments[0].reactions[0].reaction, '❤️');
    assert.equal((await request('DELETE', `/api/social/posts/${post.data.id}`, { token: bob.data.accessToken })).status, 404);
    assert.equal((await request('POST', `/api/social/posts/${post.data.id}/reports`, { token: bob.data.accessToken, body: { reason: 'Test modération' } })).status, 201);
    const reports = await request('GET', '/api/admin/social/reports', { token: admin.data.accessToken });
    assert.equal(reports.status, 200);
    assert.equal((await request('DELETE', `/api/admin/social/posts/${post.data.id}`, { token: admin.data.accessToken })).status, 200);
});
