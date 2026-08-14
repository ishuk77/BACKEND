const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'core-workflows-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'core-workflows-test-jwt-secret';

const { start, db } = require('../src/server');

let server;
let port;

function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = {};
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = payload.length;
        }
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
            let response = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { response += chunk; });
            res.on('end', () => {
                let data;
                try { data = response ? JSON.parse(response) : {}; } catch (_) { data = { raw: response }; }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function run(sql, values = []) {
    return new Promise((resolve, reject) => db.run(sql, values, err => err ? reject(err) : resolve()));
}

function rawRequest(method, route, { body, token, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(body || '');
        const req = http.request({
            hostname: '127.0.0.1', port, path: route, method,
            headers: { ...headers, 'Content-Length': payload.length, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        }, res => {
            let response = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { response += chunk; });
            res.on('end', () => {
                let data;
                try { data = response ? JSON.parse(response) : {}; } catch (_) { data = { raw: response }; }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

test.before(async () => {
    server = await start(0);
    port = server.address().port;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('dashboard, staff, chat, fraud review, Momo, and platform contracts work on isolated data', async () => {
    const platform = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Audit', phone: '+22990000001', idNumber: 'ADMIN-AUDIT' }
    });
    assert.equal(platform.status, 201);

    const creatorSession = 'core-workflows-browser-session-22991111112';
    const creatorPhone = '+22991111112';
    const creatorDelivery = await request('POST', '/api/platform/phone-verifications/request', {
        body: { phone: creatorPhone, browserSessionId: creatorSession }
    });
    const creatorVerification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone: creatorPhone, browserSessionId: creatorSession, code: creatorDelivery.data.sandboxCode }
    });
    const creator = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Président', name: 'Audit', phone: creatorPhone, identityNumber: 'ID-AUDIT-PRESIDENT',
            pin: '1234', pinConfirmation: '1234', browserSessionId: creatorSession,
            phoneVerificationToken: creatorVerification.data.verificationToken
        }
    });
    assert.equal(creator.status, 201);
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [creator.data.account.id]);
    const group = await request('POST', '/api/groups', {
        token: creator.data.accessToken,
        body: {
            group: {
                name: 'Groupe audit',
                country: 'Bénin',
                province: 'Littoral',
                city: 'Cotonou',
                currency: 'XOF',
                momo_provider: 'MTN',
                phone: '90123456'
            }
        }
    });
    assert.equal(group.status, 201);
    const presidentToken = group.data.accessToken;
    const presidentId = group.data.memberId;

    const memberSession = 'core-workflows-browser-session-22992222223';
    const memberPhone = '+22992222223';
    const memberDelivery = await request('POST', '/api/platform/phone-verifications/request', {
        body: { phone: memberPhone, browserSessionId: memberSession }
    });
    const memberVerification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone: memberPhone, browserSessionId: memberSession, code: memberDelivery.data.sandboxCode }
    });
    const memberAccount = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Membre', name: 'Audit', phone: memberPhone, identityNumber: 'MEM-AUDIT',
            pin: '1234', pinConfirmation: '1234', browserSessionId: memberSession,
            phoneVerificationToken: memberVerification.data.verificationToken
        }
    });
    assert.equal(memberAccount.status, 201);
    const invitation = await request('POST', `/api/platform/groups/${group.data.groupId}/invitations`, {
        token: creator.data.accessToken, body: { account_id: memberAccount.data.account.id }
    });
    assert.equal(invitation.status, 201);
    assert.equal((await request('PUT', `/api/platform/invitations/${invitation.data.id}`, {
        token: memberAccount.data.accessToken, body: { status: 'accepted' }
    })).status, 200);
    const memberDashboard = await request('POST', `/api/platform/groups/${group.data.groupId}/dashboard`, {
        token: memberAccount.data.accessToken, body: {}
    });
    assert.equal(memberDashboard.status, 200);
    const memberToken = memberDashboard.data.accessToken;
    const memberId = memberDashboard.data.memberId;

    assert.equal((await request('PUT', `/api/members/${memberId}/profile`, {
        token: memberToken,
        body: { prenom: 'Membre', name: 'Mis à jour', phone: '+22992222224', availability: 'busy' }
    })).status, 200);
    assert.equal((await request('GET', `/api/members/${memberId}`, { token: memberToken })).data.availability, 'busy');
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [memberAccount.data.account.id]);
    assert.equal((await request('POST', `/api/members/${memberId}/fund-from-platform-wallet`, {
        token: memberToken, body: { amount: 30 }
    })).status, 201);
    assert.equal((await request('POST', `/api/members/${memberId}/contributions`, {
        token: memberToken, body: { amount: 30 }
    })).status, 201);
    assert.equal((await request('POST', `/api/members/${memberId}/credit-request`, {
        token: memberToken, body: { amount: 20, reason: 'Activité génératrice de revenu' }
    })).status, 201);
    const excessiveCredit = await request('POST', `/api/members/${memberId}/credit-request`, {
        token: memberToken, body: { amount: 100, reason: 'Montant trop élevé' }
    });
    assert.equal(excessiveCredit.status, 409);
    assert.equal(excessiveCredit.data.notification_persisted, true);
    const memberNotifications = await request('GET', '/api/platform/notifications', { token: memberAccount.data.accessToken });
    assert.ok(memberNotifications.data.notifications.some(notification => notification.kind === 'credit_request_rejected' && /3× vos contributions/.test(notification.message)));

    assert.equal((await request('PUT', `/api/groups/${group.data.groupId}`, {
        token: presidentToken, body: { cycle_length: 3 }
    })).status, 200);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/close`, {
        token: presidentToken, body: {}
    })).status, 201);
    assert.equal((await request('GET', '/api/stats', { token: presidentToken })).status, 200);
    assert.equal((await request('GET', `/api/history?member_id=${memberId}`, { token: memberToken })).status, 200);

    assert.equal((await request('POST', '/api/chat', {
        token: memberToken, body: { group_id: group.data.groupId, recipient: 'all', message: 'Bonjour au groupe' }
    })).status, 201);
    const chat = await request('GET', `/api/chat/${group.data.groupId}`, { token: presidentToken });
    assert.equal(chat.status, 200);
    assert.equal(chat.data.at(-1).message, 'Bonjour au groupe');
    const messageId = chat.data.at(-1).id;
    assert.equal((await request('POST', `/api/chat/${group.data.groupId}/messages/${messageId}/reactions`, {
        token: presidentToken, body: { emoji: '👍' }
    })).status, 201);
    const reactedChat = await request('GET', `/api/chat/${group.data.groupId}`, { token: memberToken });
    assert.equal(reactedChat.data.at(-1).reactions[0].emoji, '👍');

    const attachment = await rawRequest('POST', '/api/collaboration/attachments', {
        token: memberToken,
        body: 'Note locale',
        headers: { 'Content-Type': 'text/plain', 'X-File-Name': '../note.txt' }
    });
    assert.equal(attachment.status, 201);
    assert.equal((await request('POST', '/api/chat', {
        token: memberToken,
        body: { group_id: group.data.groupId, recipient: 'all', message: '', attachment_id: attachment.data.id }
    })).status, 201);
    assert.equal((await rawRequest('GET', `/api/collaboration/attachments/${attachment.data.id}/download`, {
        token: presidentToken
    })).status, 200);

    const meeting = await request('POST', '/api/meetings', {
        token: presidentToken,
        body: {
            group_id: group.data.groupId, title: 'Réunion test', meeting_type: 'conference',
            starts_at: '2030-01-01T10:00:00.000Z', ends_at: '2030-01-01T11:00:00.000Z',
            recipient_ids: [presidentId, memberId]
        }
    });
    assert.equal(meeting.status, 201);
    assert.equal((await request('PUT', `/api/meetings/${meeting.data.id}/invitation`, {
        token: memberToken, body: { response: 'accepted' }
    })).status, 200);
    assert.equal((await request('GET', `/api/meetings/${group.data.groupId}`, { token: memberToken })).data[0].my_response, 'accepted');

    const groups = await request('GET', '/api/groups', { token: platform.data.accessToken });
    assert.equal(groups.status, 200);
    assert.equal(groups.data[0].member_count, 2);

    const momo = await request('POST', '/api/momo', {
        token: platform.data.accessToken,
        body: { country: 'Bénin', provider: 'MTN', phone: '90123457' }
    });
    assert.equal(momo.status, 201);
    assert.equal((await request('GET', '/api/momo', { token: platform.data.accessToken })).data.length, 1);
    assert.equal((await request('DELETE', `/api/momo/${momo.data.id}`, { token: platform.data.accessToken })).status, 200);

    assert.equal((await request('POST', `/api/platform-conversations/${group.data.groupId}`, {
        token: platform.data.accessToken, body: { message: 'Message privé de contrôle' }
    })).status, 201);
    const privateMessages = await request('GET', `/api/platform-conversations/${group.data.groupId}`, { token: presidentToken });
    assert.equal(privateMessages.status, 200);
    assert.equal(privateMessages.data.messages[0].message, 'Message privé de contrôle');

    assert.equal((await request('PUT', `/api/members/${memberId}/pin`, {
        token: platform.data.accessToken, body: { pin: '2468' }
    })).status, 200);
    assert.equal((await request('POST', '/api/auth/login', {
        body: { phone: '+22992222224', pin: '2468' }
    })).status, 200);

    assert.equal((await request('POST', `/api/members/${memberId}/fraud-reports`, {
        token: memberToken, body: { details: 'Signalement fonctionnel isolé' }
    })).status, 201);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/review-requests`, {
        token: presidentToken, body: { message: 'Demande de révision fonctionnelle' }
    })).status, 201);
    assert.equal((await request('GET', '/api/review-requests', { token: platform.data.accessToken })).status, 200);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/reactivate`, {
        token: platform.data.accessToken, body: {}
    })).status, 200);
    const platformStats = await request('GET', '/api/stats/platform', { token: platform.data.accessToken });
    assert.equal(platformStats.status, 200);
    assert.equal(platformStats.data.activeAlerts, 0);
    assert.equal((await request('GET', '/api/alerts', { token: platform.data.accessToken })).status, 200);
    assert.equal(presidentId, group.data.member.id);
});
