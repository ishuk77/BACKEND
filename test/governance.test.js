const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'governance-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'governance-test-jwt-secret';

const { start, db } = require('../src/server');
const { registerActiveAccount } = require('./helpers/account-security');
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

async function createAccount(firstName, phone, identity) {
    const account = await registerActiveAccount(request, {
        prenom: firstName, name: 'Gouvernance', phone, identityNumber: identity,
        browserSessionId: `governance-${phone.replace(/\D/g, '')}`
    });
    return account.data;
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('membership uses invitations and staff functions require an absolute-majority election', async () => {
    const presidentAccount = await createAccount('Awa', '+22996660001', 'GOV-PRESIDENT');
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [presidentAccount.account.id]);
    const group = await request('POST', '/api/groups', {
        token: presidentAccount.accessToken,
        body: { name: 'Groupe gouvernance', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123456' }
    });
    assert.equal(group.status, 201);
    assert.equal(group.data.member.role_origin, 'bootstrap');

    const rawMember = await request('POST', '/api/members', {
        token: group.data.accessToken,
        body: { prenom: 'Interdit', name: 'Profil', phone: '+22996660009', idNumber: 'NO-RAW' }
    });
    assert.equal(rawMember.status, 410);

    const candidateAccount = await createAccount('Kofi', '+22996660002', 'GOV-CANDIDATE');
    const invitation = await request('POST', `/api/platform/groups/${group.data.groupId}/invitations`, {
        token: presidentAccount.accessToken,
        body: { account_id: candidateAccount.account.id }
    });
    assert.equal(invitation.status, 201);
    const accepted = await request('PUT', `/api/platform/invitations/${invitation.data.id}`, {
        token: candidateAccount.accessToken, body: { status: 'accepted' }
    });
    assert.equal(accepted.status, 200);

    const candidateDashboard = await request('POST', `/api/platform/groups/${group.data.groupId}/dashboard`, {
        token: candidateAccount.accessToken, body: {}
    });
    assert.equal(candidateDashboard.status, 200);
    assert.equal(candidateDashboard.data.member.role, 'membre');

    const directPromotion = await request('PUT', `/api/members/${candidateDashboard.data.memberId}`, {
        token: group.data.accessToken, body: { role: 'comptable' }
    });
    assert.equal(directPromotion.status, 403);

    const election = await request('POST', `/api/groups/${group.data.groupId}/elections`, {
        token: group.data.accessToken,
        body: { role: 'vice_president', title: 'Élection de la vice-présidence', candidate_member_ids: [candidateDashboard.data.memberId] }
    });
    assert.equal(election.status, 201);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/elections/${election.data.id}/votes`, {
        token: candidateDashboard.data.accessToken, body: { candidate_member_id: candidateDashboard.data.memberId }
    })).status, 201);
    assert.equal((await request('POST', `/api/groups/${group.data.groupId}/elections/${election.data.id}/votes`, {
        token: candidateDashboard.data.accessToken, body: { candidate_member_id: candidateDashboard.data.memberId }
    })).status, 409);

    const beforeThreshold = await request('POST', `/api/groups/${group.data.groupId}/elections/${election.data.id}/close`, {
        token: group.data.accessToken, body: {}
    });
    assert.equal(beforeThreshold.status, 200);
    assert.equal(beforeThreshold.data.status, 'closed_unfilled');
    assert.equal(beforeThreshold.data.required_votes, 2);

    const retry = await request('POST', `/api/groups/${group.data.groupId}/elections`, {
        token: group.data.accessToken,
        body: { role: 'vice_president', title: 'Nouvelle élection de la vice-présidence', candidate_member_ids: [candidateDashboard.data.memberId] }
    });
    assert.equal(retry.status, 201);
    for (const token of [group.data.accessToken, candidateDashboard.data.accessToken]) {
        assert.equal((await request('POST', `/api/groups/${group.data.groupId}/elections/${retry.data.id}/votes`, {
            token, body: { candidate_member_id: candidateDashboard.data.memberId }
        })).status, 201);
    }
    const closed = await request('POST', `/api/groups/${group.data.groupId}/elections/${retry.data.id}/close`, {
        token: group.data.accessToken, body: {}
    });
    assert.equal(closed.data.status, 'closed_elected');
    assert.equal(closed.data.required_votes, 2);
    const elected = await request('GET', `/api/members/${candidateDashboard.data.memberId}`, { token: group.data.accessToken });
    assert.equal(elected.data.role, 'vice_president');
    assert.equal(elected.data.role_origin, 'election');
});
