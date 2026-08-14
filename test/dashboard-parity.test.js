const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'dashboard-parity-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'dashboard-parity-test-jwt-secret';
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
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }); } catch (_) { resolve({ status: res.statusCode, data: {} }); }
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

async function registerAccount(phone, identity, pin = '1234') {
    const browserSessionId = `dashboard-parity-session-${phone.replace(/\D/g, '')}`;
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    return request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Nouveau', name: 'Compte', phone, identityNumber: identity, pin, pinConfirmation: pin,
            browserSessionId, phoneVerificationToken: verification.data.verificationToken
        }
    });
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('invited accounts use the portal group-dashboard contract', async () => {
    const president = await registerAccount('+22995551001', 'PARITY-PRESIDENT');
    assert.equal(president.status, 201);
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [president.data.account.id]);
    const group = await request('POST', '/api/groups', {
        token: president.data.accessToken,
        body: { name: 'AVEC parité', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123456' }
    });
    assert.equal(group.status, 201);

    const invitedAccount = await registerAccount('+22995551002', 'PARITY-INVITED', '2468');
    assert.equal(invitedAccount.status, 201);
    const invitation = await request('POST', `/api/platform/groups/${group.data.groupId}/invitations`, {
        token: president.data.accessToken, body: { account_id: invitedAccount.data.account.id }
    });
    assert.equal(invitation.status, 201);
    assert.equal((await request('PUT', `/api/platform/invitations/${invitation.data.id}`, {
        token: invitedAccount.data.accessToken, body: { status: 'accepted' }
    })).status, 200);
    const portalSession = await request('POST', '/api/platform/auth/login', { body: { phone: '+22995551002', pin: '2468' } });
    assert.equal(portalSession.status, 200);

    const memberships = await request('GET', '/api/platform/my-groups', { token: portalSession.data.accessToken });
    assert.deepEqual(memberships.data.groups.map(item => ({ id: item.id, role: item.role })), [{ id: group.data.groupId, role: 'membre' }]);

    const selectedDashboard = await request('POST', `/api/platform/groups/${group.data.groupId}/dashboard`, {
        token: portalSession.data.accessToken, body: {}
    });
    assert.equal(selectedDashboard.status, 200);
    assert.deepEqual(selectedDashboard.data.dashboard, {
        path: 'group.html', groupId: group.data.groupId, memberId: selectedDashboard.data.memberId
    });
    assert.equal(selectedDashboard.data.member.role, 'membre');

    const presidentDashboard = await request('POST', `/api/platform/groups/${group.data.groupId}/dashboard`, {
        token: president.data.accessToken, body: {}
    });
    assert.equal(presidentDashboard.status, 200);
    assert.equal(presidentDashboard.data.member.role, 'president');
    assert.equal((await request('GET', `/api/members/${selectedDashboard.data.memberId}`, {
        token: selectedDashboard.data.accessToken
    })).status, 200);
});
