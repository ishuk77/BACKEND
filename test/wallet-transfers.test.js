const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'wallet-transfers-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'wallet-transfers-test-secret';
const { start, db } = require('../src/server');

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
                try {
                    resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} });
                } catch (_) {
                    resolve({ status: res.statusCode, data: {} });
                }
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

async function registerMember(phone, identityNumber, prenom) {
    const browserSessionId = `wallet-${identityNumber}`;
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    const registration = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom, name: 'Transfert', phone, identityNumber, pin: '1234', pinConfirmation: '1234',
            browserSessionId, phoneVerificationToken: verification.data.verificationToken
        }
    });
    assert.equal(registration.status, 201);
    return registration.data;
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

test('internal wallet transfers are idempotent, balanced, and append-only', async () => {
    const sender = await registerMember('+243811111111', 'WALLET-SENDER-1', 'Amina');
    const recipient = await registerMember('+243822222222', 'WALLET-RECIPIENT-1', 'Benoit');
    await run('UPDATE platform_accounts SET internal_wallet = 25 WHERE id = ?', [sender.account.id]);

    const headers = { 'Idempotency-Key': 'wallet-transfer-integration-0001' };
    const transfer = await request('POST', '/api/platform/wallet/transfers', {
        token: sender.accessToken,
        headers,
        body: { recipient_identifier: recipient.account.identifier, amount: 7.5, currency: 'USD', memo: 'Cotisation commune' }
    });
    assert.equal(transfer.status, 201);
    assert.equal(transfer.data.transfer.amount_minor, 750);

    const replay = await request('POST', '/api/platform/wallet/transfers', {
        token: sender.accessToken,
        headers,
        body: { recipient_identifier: recipient.account.identifier, amount: 7.5, currency: 'USD', memo: 'Cotisation commune' }
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.idempotent_replay, true);

    const senderRow = await get('SELECT internal_wallet FROM platform_accounts WHERE id = ?', [sender.account.id]);
    const recipientRow = await get('SELECT internal_wallet FROM platform_accounts WHERE id = ?', [recipient.account.id]);
    assert.equal(senderRow.internal_wallet, 17.5);
    assert.equal(recipientRow.internal_wallet, 7.5);

    const journal = await new Promise((resolve, reject) => db.all(
        'SELECT entry_type, amount_minor FROM wallet_journal_entries WHERE transfer_id = ? ORDER BY entry_type',
        [transfer.data.transfer.transfer_id],
        (err, rows) => err ? reject(err) : resolve(rows)
    ));
    assert.deepEqual(journal, [{ entry_type: 'credit', amount_minor: 750 }, { entry_type: 'debit', amount_minor: 750 }]);
    await assert.rejects(run('UPDATE wallet_journal_entries SET amount_minor = 1 WHERE transfer_id = ?', [transfer.data.transfer.transfer_id]));
});
