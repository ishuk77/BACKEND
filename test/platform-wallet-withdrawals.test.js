const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'platform-wallet-withdrawals-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'platform-wallet-withdrawals-test-secret';
const { start, db } = require('../src/server');
const { registerActiveAccount } = require('./helpers/account-security');

let server;
let port;

function request(method, route, { body, token, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const requestHeaders = { ...headers };
        if (payload) {
            requestHeaders['Content-Type'] = 'application/json';
            requestHeaders['Content-Length'] = payload.length;
        }
        if (token) requestHeaders.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: requestHeaders }, res => {
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

test.before(async () => {
    server = await start(0);
    port = server.address().port;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('platform wallet withdrawals authenticate, reserve, settle and never disclose PIN or OTP', async () => {
    const owner = await registerActiveAccount(request, {
        prenom: 'Amina', name: 'Wallet', phone: '+243811111111',
        identityNumber: 'PLATFORM-WALLET-OWNER', browserSessionId: 'platform-wallet-owner'
    });
    const other = await registerActiveAccount(request, {
        prenom: 'Benoit', name: 'Wallet', phone: '+243822222222',
        identityNumber: 'PLATFORM-WALLET-OTHER', browserSessionId: 'platform-wallet-other'
    });
    const ownerToken = owner.data.accessToken;
    await run('UPDATE platform_accounts SET internal_wallet = 10, internal_wallet_minor = 1000 WHERE id = ?', [owner.data.account.id]);

    assert.equal((await request('GET', '/api/platform/wallet')).status, 401);
    assert.equal((await request('GET', '/api/platform/wallet', { token: other.data.accessToken })).status, 200);

    const headers = { 'Idempotency-Key': 'platform-wallet-withdrawal-0001' };
    const withdrawal = await request('POST', '/api/platform/wallet/withdrawals', {
        token: ownerToken, headers,
        body: { amount: 4, currency: 'USD', provider: 'sandbox', phone: '+243811111111', pin: '1234' }
    });
    assert.equal(withdrawal.status, 201, JSON.stringify(withdrawal.data));
    assert.equal(withdrawal.data.withdrawal.status, 'reserved');
    assert.equal(withdrawal.data.confirmation_required, true);
    assert.doesNotMatch(JSON.stringify(withdrawal.data), /1234|sandboxCode|otp/i);

    const replay = await request('POST', '/api/platform/wallet/withdrawals', {
        token: ownerToken, headers,
        body: { amount: 4, currency: 'USD', provider: 'sandbox', phone: '+243811111111', pin: '1234' }
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.idempotent_replay, true);

    let wallet = await request('GET', '/api/platform/wallet', { token: ownerToken });
    assert.deepEqual(wallet.data.wallet, { available_minor: 600, reserved_minor: 400, total_minor: 1000, currency: 'USD' });
    const denied = await request('POST', `/api/platform/wallet/withdrawals/${withdrawal.data.withdrawal.withdrawal_id}/confirm`, { token: other.data.accessToken, body: {} });
    assert.equal(denied.status, 404);

    const confirmed = await request('POST', `/api/platform/wallet/withdrawals/${withdrawal.data.withdrawal.withdrawal_id}/confirm`, { token: ownerToken, body: {} });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.withdrawal.status, 'succeeded');
    const confirmReplay = await request('POST', `/api/platform/wallet/withdrawals/${withdrawal.data.withdrawal.withdrawal_id}/confirm`, { token: ownerToken, body: {} });
    assert.equal(confirmReplay.status, 200);
    assert.equal(confirmReplay.data.idempotent_replay, true);

    wallet = await request('GET', '/api/platform/wallet', { token: ownerToken });
    assert.deepEqual(wallet.data.wallet, { available_minor: 600, reserved_minor: 0, total_minor: 600, currency: 'USD' });

    const cancel = await request('POST', '/api/platform/wallet/withdrawals', {
        token: ownerToken, headers: { 'Idempotency-Key': 'platform-wallet-withdrawal-0002' },
        body: { amount: 2, currency: 'USD', provider: 'sandbox', phone: '+243811111111', pin: '1234' }
    });
    assert.equal(cancel.status, 201);
    assert.equal((await request('POST', `/api/platform/wallet/withdrawals/${cancel.data.withdrawal.withdrawal_id}/cancel`, { token: ownerToken, body: {} })).data.withdrawal.status, 'cancelled');
    assert.equal((await request('POST', `/api/platform/wallet/withdrawals/${cancel.data.withdrawal.withdrawal_id}/cancel`, { token: ownerToken, body: {} })).data.idempotent_replay, true);

    const failed = await request('POST', '/api/platform/wallet/withdrawals', {
        token: ownerToken, headers: { 'Idempotency-Key': 'platform-wallet-withdrawal-0003' },
        body: { amount: 1, currency: 'USD', provider: 'sandbox', phone: '+243811111111', pin: '1234' }
    });
    assert.equal(failed.status, 201);
    assert.equal((await request('POST', `/api/platform/wallet/withdrawals/${failed.data.withdrawal.withdrawal_id}/fail`, { token: ownerToken, body: {} })).data.withdrawal.status, 'failed');
    wallet = await request('GET', '/api/platform/wallet', { token: ownerToken });
    assert.deepEqual(wallet.data.wallet, { available_minor: 600, reserved_minor: 0, total_minor: 600, currency: 'USD' });

    const transactions = await request('GET', '/api/platform/wallet/transactions?limit=100', { token: ownerToken });
    assert.equal(transactions.status, 200);
    assert.equal(transactions.data.transactions.filter(item => item.kind === 'withdrawal').length, 3);
    const auditCount = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) AS count FROM wallet_withdrawal_events', [], (err, row) => err ? reject(err) : resolve(row.count)));
    assert.equal(auditCount, 6);
});
