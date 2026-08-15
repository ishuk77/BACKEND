const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'product-split-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'product-split-test-jwt-secret';
const { start, db } = require('../src/server');

let server;
let port;

function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
            let output = '';
            res.on('data', chunk => { output += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function run(sql, values = []) {
    return new Promise((resolve, reject) => db.run(sql, values, err => err ? reject(err) : resolve()));
}

function get(sql, values = []) {
    return new Promise((resolve, reject) => db.get(sql, values, (err, row) => err ? reject(err) : resolve(row)));
}

async function register(phone, identity, session) {
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId: session } });
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId: session, code: delivery.data.sandboxCode }
    });
    const response = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Test', name: identity, phone, identityNumber: identity, pin: '1234', pinConfirmation: '1234',
            browserSessionId: session, phoneVerificationToken: verification.data.verificationToken
        }
    });
    assert.equal(response.status, 201);
    return response.data;
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('Epargne lifecycle, location discovery, and sponsor references are enforced', async () => {
    const creator = await register('+22997770001', 'SPLIT-CREATOR', 'split-creator-session');
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [creator.account.id]);
    const group = await request('POST', '/api/groups', {
        token: creator.accessToken,
        body: {
            name: 'Epargne Cotonou', country: 'Bénin', province: 'Littoral', city: 'Cotonou',
            momo_provider: 'MTN', phone: '90123456', group_type: 'Epargne',
            savings_periodicity: 'weekly', savings_period: 2
        }
    });
    assert.equal(group.status, 201);
    assert.equal(group.data.group.group_type, 'Epargne');
    assert.equal(group.data.group.cycle_status, 'planning');

    const found = await request('GET', '/api/platform/groups?country=B%C3%A9nin&region=Littoral&city=Cotonou', { token: creator.accessToken });
    assert.equal(found.status, 200);
    assert.equal(found.data.groups[0].id, group.data.groupId);
    const absent = await request('GET', '/api/platform/groups?city=Porto-Novo', { token: creator.accessToken });
    assert.equal(absent.data.groups.length, 0);

    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/close`, {
        token: group.data.accessToken, body: {}
    })).status, 400);
    assert.equal((await request('PUT', `/api/groups/${group.data.groupId}/cycle/beneficiary-order`, {
        token: group.data.accessToken, body: { member_ids: [group.data.memberId] }
    })).status, 201);
    assert.equal((await request('POST', `/api/members/${group.data.memberId}/credit-request`, {
        token: group.data.accessToken, body: { amount: 1, reason: 'Interdit' }
    })).status, 409);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/close`, {
        token: group.data.accessToken, body: { confirmed: true }
    })).status, 201);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/restore`, {
        token: group.data.accessToken, body: {}
    })).status, 200);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/close`, {
        token: group.data.accessToken, body: { confirmed: true }
    })).status, 201);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/cycle/new`, {
        token: group.data.accessToken, body: {}
    })).status, 201);
    const cycleHistory = await request('GET', `/api/groups/${group.data.groupId}/cycle/history`, { token: group.data.accessToken });
    assert.ok(cycleHistory.data.events.some(event => event.action === 'restored'));
    assert.ok(cycleHistory.data.events.some(event => event.action === 'new_cycle'));

    const invitee = await register('+22997770002', 'SPLIT-INVITEE', 'split-invitee-session');
    const invite = await request('POST', `/api/platform/groups/${group.data.groupId}/invitations`, {
        token: creator.accessToken, body: { account_id: invitee.account.id }
    });
    assert.equal(invite.status, 201);
    const invitations = await request('GET', '/api/platform/invitations', { token: invitee.accessToken });
    assert.equal(invitations.data.invitations[0].sponsor_account_id, creator.account.id);
    assert.match(invitations.data.invitations[0].sponsor_prenom, /Test/);
    assert.equal((await request('PUT', `/api/platform/invitations/${invite.data.id}`, {
        token: invitee.accessToken, body: { status: 'accepted' }
    })).status, 200);
    const sponsoredMember = await get(
        `SELECT sponsor_account_id, parrain FROM members
         WHERE group_id = ? AND phone = ?`,
        [group.data.groupId, '+22997770002']
    );
    assert.equal(sponsoredMember.sponsor_account_id, creator.account.id);
    assert.match(sponsoredMember.parrain, /sans responsabilité financière/);
});
