const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'avec-security-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'avec-security-test-secret';
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

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('registration requires email and does not disclose email or OTP', async () => {
    const missingEmail = await request('POST', '/api/platform/auth/register', {
        body: { prenom: 'Awa', name: 'Test', country: 'Bénin', phone: '95550001', pin: '1234', pinConfirmation: '1234' }
    });
    assert.equal(missingEmail.status, 400);
    const registered = await request('POST', '/api/platform/auth/register', {
        body: { prenom: 'Awa', name: 'Test', email: 'awa@example.test', country: 'Bénin', phone: '95550001', pin: '1234', pinConfirmation: '1234' }
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.activationRequired, true);
    assert.equal(JSON.stringify(registered.data).includes('awa@example.test'), false);
    assert.equal(Object.hasOwn(registered.data, 'sandboxCode'), false);
});

test('group creation charges only the personal wallet as platform revenue', async () => {
    const hash = bcrypt.hashSync('1234', 10);
    await run(`INSERT INTO platform_accounts
        (identifier, prenom, name, email, phone, country, password, identity_number, email_verified_at, phone_verified_at, pin_configured, status, internal_wallet, internal_wallet_minor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'active', 25, 2500)`,
    ['AVEC-SECURITY-CREATOR', 'Kofi', 'Créateur', 'kofi@example.test', '+22995550002', 'Bénin', hash, 'BJ-PASSPORT-SECURITY']);
    const login = await request('POST', '/api/platform/auth/login', { body: { phone: '+22995550002', pin: '1234' } });
    assert.equal(login.status, 200);
    const created = await request('POST', '/api/groups', {
        token: login.data.accessToken,
        body: {
            name: 'AVEC sécurisée', country: 'Bénin', province: 'Littoral', city: 'Cotonou',
            momo_provider: 'MTN', phone: '90123456', intended_member_count: 20, starting_capital: 100
        }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.creation_fee.amount_minor, 2000);
    const account = await get('SELECT internal_wallet FROM platform_accounts WHERE identifier = ?', ['AVEC-SECURITY-CREATOR']);
    const group = await get('SELECT wallet_minor, starting_capital_minor, intended_member_count FROM groups WHERE id = ?', [created.data.groupId]);
    const revenue = await get('SELECT amount_minor FROM group_creation_fees WHERE group_id = ?', [created.data.groupId]);
    assert.equal(account.internal_wallet, 5);
    assert.equal(group.wallet_minor, 0);
    assert.equal(group.starting_capital_minor, 10000);
    assert.equal(group.intended_member_count, 20);
    assert.equal(revenue.amount_minor, 2000);
});
