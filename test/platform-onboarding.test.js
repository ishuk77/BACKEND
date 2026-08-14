const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

const databasePath = path.join(__dirname, '..', 'platform-onboarding-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'platform-onboarding-test-jwt-secret';
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

function get(sql, values = []) {
    return new Promise((resolve, reject) => db.get(sql, values, (err, row) => err ? reject(err) : resolve(row)));
}

async function verifyPhone(phone, browserSessionId) {
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
    assert.equal(delivery.status, 201);
    assert.equal(delivery.data.delivery, 'sandbox');
    assert.match(delivery.data.sandboxCode, /^\d{6}$/);
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    assert.equal(verification.status, 200);
    return verification.data.verificationToken;
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('registration requires identity, confirmed four-digit PIN, and same-session phone verification', async () => {
    const phone = '+22995550001';
    const browserSessionId = 'onboarding-browser-session-22995550001';
    const incomplete = await request('POST', '/api/platform/auth/register', {
        body: { prenom: 'Awa', name: 'Test', phone, pin: '1234', pinConfirmation: '1234', browserSessionId }
    });
    assert.equal(incomplete.status, 400);

    const verificationToken = await verifyPhone(phone, browserSessionId);
    const mismatchedPin = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Awa', name: 'Test', phone, identityNumber: 'BJ-PASSPORT-001',
            pin: '1234', pinConfirmation: '4321', browserSessionId, phoneVerificationToken: verificationToken
        }
    });
    assert.equal(mismatchedPin.status, 400);

    const registered = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Awa', name: 'Test', phone, identityNumber: 'BJ-PASSPORT-001',
            pin: '1234', pinConfirmation: '1234', browserSessionId, phoneVerificationToken: verificationToken
        }
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.account.onboardingComplete, true);
    assert.equal(Object.hasOwn(registered.data.account, 'password'), false);
    const stored = await get('SELECT password, identity_number, phone_verified_at, pin_configured FROM platform_accounts WHERE phone = ?', [phone]);
    assert.notEqual(stored.password, '1234');
    assert.ok(stored.password.startsWith('$2'));
    assert.equal(stored.identity_number, 'BJ-PASSPORT-001');
    assert.ok(stored.phone_verified_at);
    assert.equal(stored.pin_configured, 1);
});

test('a verified creator receives the member dashboard navigation contract', async () => {
    const phone = '+22995550002';
    const browserSessionId = 'onboarding-browser-session-22995550002';
    const phoneVerificationToken = await verifyPhone(phone, browserSessionId);
    const account = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Kofi', name: 'Créateur', phone, identityNumber: 'TG-PASSPORT-002',
            pin: '2468', pinConfirmation: '2468', browserSessionId, phoneVerificationToken
        }
    });
    const groupBody = { name: 'Groupe navigation', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123456' };
    const insufficientWallet = await request('POST', '/api/groups', { token: account.data.accessToken, body: groupBody });
    assert.equal(insufficientWallet.status, 409);
    assert.match(insufficientWallet.data.error, /100\.00 USD/);
    await run('UPDATE platform_accounts SET internal_wallet = 100 WHERE id = ?', [account.data.account.id]);
    const group = await request('POST', '/api/groups', {
        token: account.data.accessToken,
        body: groupBody
    });
    assert.equal(group.status, 201);
    assert.deepEqual(group.data.dashboard, { path: 'group.html', groupId: group.data.groupId, memberId: group.data.memberId });
    assert.ok(group.data.accessToken);
    assert.ok(group.data.refreshToken);
});

test('existing accounts complete missing identity, PIN, and phone verification only through the security profile', async () => {
    const phone = '+22995550003';
    await run(
        'INSERT INTO platform_accounts (identifier, prenom, name, phone, password) VALUES (?, ?, ?, ?, ?)',
        ['AVEC-LEGACY-SECURITY', 'Ancien', 'Membre', phone, bcrypt.hashSync('9876', 10)]
    );
    const login = await request('POST', '/api/platform/auth/login', { body: { phone, pin: '9876' } });
    assert.equal(login.status, 200);
    assert.equal(login.data.account.onboardingComplete, false);
    const before = await request('POST', '/api/groups', {
        token: login.data.accessToken,
        body: { name: 'Refus avant profil', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123457' }
    });
    assert.equal(before.status, 403);

    const browserSessionId = 'onboarding-browser-session-22995550003';
    const phoneVerificationToken = await verifyPhone(phone, browserSessionId);
    const completed = await request('PUT', '/api/platform/profile/security', {
        token: login.data.accessToken,
        body: {
            identityNumber: 'BJ-PASSPORT-003', pin: '1357', pinConfirmation: '1357',
            browserSessionId, phoneVerificationToken
        }
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.account.onboardingComplete, true);
    const updatedLogin = await request('POST', '/api/platform/auth/login', { body: { phone, pin: '1357' } });
    assert.equal(updatedLogin.status, 200);
});
