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
const { activateAccount, emailCodeFor, installEmailDeliveryCapture, registerActiveAccount } = require('./helpers/account-security');
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

async function verifyPhone(phone, browserSessionId, token) {
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { token, body: { phone, browserSessionId } });
    assert.equal(delivery.status, 201);
    assert.equal(delivery.data.delivery, 'sandbox');
    assert.match(delivery.data.sandboxCode, /^\d{6}$/);
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        token, body: { phone, browserSessionId, code: delivery.data.sandboxCode }
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

test('registration requires email and activation before the verified-phone group onboarding', async () => {
    const phone = '+22995550001';
    const browserSessionId = 'onboarding-browser-session-22995550001';
    const incomplete = await request('POST', '/api/platform/auth/register', {
        body: { prenom: 'Awa', name: 'Test', country: 'Bénin', phone, pin: '1234', pinConfirmation: '1234' }
    });
    assert.equal(incomplete.status, 400);

    const mismatchedPin = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Awa', name: 'Test', email: 'awa-onboarding@example.test', country: 'Bénin',
            phone, identityNumber: 'BJ-PASSPORT-001', pin: '1234', pinConfirmation: '4321'
        }
    });
    assert.equal(mismatchedPin.status, 400);

    const registered = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Awa', name: 'Test', email: 'awa-onboarding@example.test', country: 'Bénin',
            phone, identityNumber: 'BJ-PASSPORT-001', pin: '1234', pinConfirmation: '1234'
        }
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.activationRequired, true);
    assert.equal(registered.data.account.emailVerified, false);
    assert.equal(registered.data.account.onboardingComplete, false);
    assert.equal(Object.hasOwn(registered.data.account, 'password'), false);
    const activated = await activateAccount(request, 'awa-onboarding@example.test', browserSessionId);
    const phoneVerificationToken = await verifyPhone(phone, browserSessionId, activated.accessToken);
    const secured = await request('PUT', '/api/platform/profile/security', {
        token: activated.accessToken,
        body: { browserSessionId, phoneVerificationToken }
    });
    assert.equal(secured.status, 200);
    assert.equal(secured.data.account.onboardingComplete, true);
    const stored = await get('SELECT password, identity_number, email_verified_at, phone_verified_at, pin_configured FROM platform_accounts WHERE phone = ?', [phone]);
    assert.notEqual(stored.password, '1234');
    assert.ok(stored.password.startsWith('$2'));
    assert.equal(stored.identity_number, 'BJ-PASSPORT-001');
    assert.ok(stored.email_verified_at);
    assert.ok(stored.phone_verified_at);
    assert.equal(stored.pin_configured, 1);
});

test('registration normalizes duplicate identity, email, and phone without identifying the matching field', async () => {
    const duplicateMessage = 'Un compte existe déjà avec au moins une de ces informations. Connectez-vous ou réinitialisez votre PIN.';
    const first = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Doublon', name: 'Initial', email: 'duplicate-registration@example.test', country: 'Bénin',
            phone: '+22996666101', identityNumber: 'dup-identity-001', pin: '1234', pinConfirmation: '1234'
        }
    });
    assert.equal(first.status, 201);
    const stored = await get('SELECT phone, email, identity_number FROM platform_accounts WHERE email = ?', ['duplicate-registration@example.test']);
    assert.deepEqual(stored, {
        phone: '+22996666101', email: 'duplicate-registration@example.test', identity_number: 'DUP-IDENTITY-001'
    });

    const attempts = [
        {
            email: 'different-phone@example.test', phone: '+229 96 666 101', identityNumber: 'DUP-IDENTITY-002'
        },
        {
            email: 'DUPLICATE-REGISTRATION@example.test', phone: '+22996666102', identityNumber: 'DUP-IDENTITY-003'
        },
        {
            email: 'different-identity@example.test', phone: '+22996666103', identityNumber: 'dup-identity-001'
        }
    ];
    for (const attempt of attempts) {
        const response = await request('POST', '/api/platform/auth/register', {
            body: { prenom: 'Doublon', name: 'Essai', country: 'Bénin', pin: '1234', pinConfirmation: '1234', ...attempt }
        });
        assert.equal(response.status, 409);
        assert.equal(response.data.error, duplicateMessage);
        assert.doesNotMatch(response.data.error, /téléphone|e-mail|identité|passeport/i);
    }
});

test('an authenticated account can complete a missing email with an account-bound OTP', async () => {
    installEmailDeliveryCapture();
    const hash = bcrypt.hashSync('1234', 10);
    await run(
        `INSERT INTO platform_accounts (identifier, prenom, name, phone, password, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        ['AVEC-EMAIL-COMPLETION-A', 'Ancien', 'Sans e-mail', '+22995550020', hash]
    );
    await run(
        `INSERT INTO platform_accounts (identifier, prenom, name, phone, password, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        ['AVEC-EMAIL-COMPLETION-B', 'Autre', 'Compte', '+22995550021', hash]
    );
    const firstLogin = await request('POST', '/api/platform/auth/login', { body: { phone: '+22995550020', pin: '1234' } });
    const secondLogin = await request('POST', '/api/platform/auth/login', { body: { phone: '+22995550021', pin: '1234' } });
    assert.equal(firstLogin.status, 200);
    assert.equal(secondLogin.status, 200);

    const email = 'Completed.Email@Example.test';
    const browserSessionId = 'profile-email-completion-session-001';
    const requested = await request('POST', '/api/platform/profile/email/request', {
        token: firstLogin.data.accessToken, body: { email, browserSessionId }
    });
    assert.equal(requested.status, 202);
    assert.equal(requested.data.requested, true);
    assert.equal(Object.hasOwn(requested.data, 'sandboxCode'), false);
    const code = emailCodeFor(email.toLowerCase());
    assert.match(code || '', /^\d{6}$/);

    const unauthenticatedVerification = await request('POST', '/api/platform/email-verifications/verify', {
        body: { email, browserSessionId, purpose: 'profile_email', code }
    });
    assert.equal(unauthenticatedVerification.status, 401);

    const verified = await request('POST', '/api/platform/email-verifications/verify', {
        token: firstLogin.data.accessToken, body: { email, browserSessionId, purpose: 'profile_email', code }
    });
    assert.equal(verified.status, 200);
    assert.equal(Object.hasOwn(verified.data, 'verificationToken'), true);

    const wrongAccount = await request('PUT', '/api/platform/profile/email', {
        token: secondLogin.data.accessToken,
        body: { email, browserSessionId, emailVerificationToken: verified.data.verificationToken }
    });
    assert.equal(wrongAccount.status, 400);

    const completed = await request('PUT', '/api/platform/profile/email', {
        token: firstLogin.data.accessToken,
        body: { email, browserSessionId, emailVerificationToken: verified.data.verificationToken }
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.account.emailVerified, true);
    const stored = await get('SELECT email, email_verified_at FROM platform_accounts WHERE identifier = ?', ['AVEC-EMAIL-COMPLETION-A']);
    assert.equal(stored.email, 'completed.email@example.test');
    assert.ok(stored.email_verified_at);

    const collision = await request('POST', '/api/platform/profile/email/request', {
        token: secondLogin.data.accessToken, body: { email, browserSessionId: 'profile-email-completion-session-002' }
    });
    assert.equal(collision.status, 409);
    assert.equal(collision.data.error, 'Cet e-mail ne peut pas être utilisé pour ce compte.');
});

test('a verified creator receives the member dashboard navigation contract', async () => {
    const phone = '+22995550002';
    const browserSessionId = 'onboarding-browser-session-22995550002';
    const account = await registerActiveAccount(request, {
        prenom: 'Kofi', name: 'Créateur', phone, identityNumber: 'TG-PASSPORT-002',
        pin: '2468', browserSessionId
    });
    const groupBody = { name: 'Groupe navigation', country: 'Bénin', province: 'Littoral', city: 'Cotonou', momo_provider: 'MTN', phone: '90123456' };
    const insufficientWallet = await request('POST', '/api/groups', { token: account.data.accessToken, body: groupBody });
    assert.equal(insufficientWallet.status, 409);
    assert.match(insufficientWallet.data.error, /20\.00 USD/);
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
        `INSERT INTO platform_accounts (identifier, prenom, name, email, phone, password, email_verified_at, status)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active')`,
        ['AVEC-LEGACY-SECURITY', 'Ancien', 'Membre', 'legacy-security@example.test', phone, bcrypt.hashSync('9876', 10)]
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
    const phoneVerificationToken = await verifyPhone(phone, browserSessionId, login.data.accessToken);
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
