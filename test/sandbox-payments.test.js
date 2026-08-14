const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'sandbox-payments-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'sandbox-payment-test-jwt-secret';
process.env.PAYMENT_WEBHOOK_SECRET_MTN = 'sandbox-webhook-test-secret';

const { start, db, SANDBOX_PAYMENT_ADAPTER } = require('../src/server');

let server;
let port;

function request(method, route, { body, token, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
        const requestHeaders = { ...headers };
        if (payload) {
            requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
            requestHeaders['Content-Length'] = payload.length;
        }
        if (token) requestHeaders.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: requestHeaders }, res => {
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

test.before(async () => {
    server = await start(0);
    port = server.address().port;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('SANDBOX payments are idempotent, authorized, blocked when required, and webhook-protected', async () => {
    assert.equal(SANDBOX_PAYMENT_ADAPTER.sandbox, true);

    const platform = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Platform', phone: '+22990000000', idNumber: 'ADMIN-1' }
    });
    assert.equal(platform.status, 201);

    const creatorSession = 'sandbox-payments-browser-session-22991111111';
    const creatorPhone = '+22991111111';
    const creatorDelivery = await request('POST', '/api/platform/phone-verifications/request', {
        body: { phone: creatorPhone, browserSessionId: creatorSession }
    });
    const creatorVerification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone: creatorPhone, browserSessionId: creatorSession, code: creatorDelivery.data.sandboxCode }
    });
    const creator = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Président', name: 'Test', phone: creatorPhone, identityNumber: 'ID-SANDBOX-PRESIDENT',
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
                name: 'Groupe sandbox',
                country: 'Bénin',
                province: 'Littoral',
                city: 'Cotonou',
                currency: 'XOF',
                momo_provider: 'MTN',
                phone: '+22990123456'
            }
        }
    });
    assert.equal(group.status, 201);

    const memberSession = 'sandbox-payments-browser-session-22992222222';
    const memberPhone = '+22992222222';
    const memberDelivery = await request('POST', '/api/platform/phone-verifications/request', {
        body: { phone: memberPhone, browserSessionId: memberSession }
    });
    const memberVerification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone: memberPhone, browserSessionId: memberSession, code: memberDelivery.data.sandboxCode }
    });
    const memberAccount = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Membre', name: 'Test', phone: memberPhone, identityNumber: 'MEM-1',
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

    const originalFetch = global.fetch;
    global.fetch = () => { throw new Error('A SANDBOX adapter must not call the network'); };
    const paymentBody = { type: 'collection', member_id: memberId, amount_minor: 2500, provider: 'mtn' };
    const firstPayment = await request('POST', '/api/payments/intents', {
        token: memberToken, body: paymentBody, headers: { 'Idempotency-Key': 'collection-sandbox-0001' }
    });
    global.fetch = originalFetch;
    assert.equal(firstPayment.status, 201);
    assert.equal(firstPayment.data.sandbox, true);
    assert.match(firstPayment.data.external_reference, /^SANDBOX-MTN-/);

    const duplicatePayment = await request('POST', '/api/payments/intents', {
        token: memberToken, body: paymentBody, headers: { 'Idempotency-Key': 'collection-sandbox-0001' }
    });
    assert.equal(duplicatePayment.status, 201);
    assert.equal(duplicatePayment.data.idempotent_replay, true);
    assert.equal(duplicatePayment.data.transaction_id, firstPayment.data.transaction_id);

    const status = await request('GET', `/api/payments/${firstPayment.data.transaction_id}`, { token: memberToken });
    assert.equal(status.status, 200);
    assert.equal(status.data.payment.status, 'succeeded');
    assert.equal(status.data.payment.amount_minor, 2500);

    const loanRequest = await request('POST', '/api/payments/intents', {
        token: memberToken,
        body: { type: 'loan_disbursement', member_id: memberId, amount_minor: 1000, provider: 'mtn' },
        headers: { 'Idempotency-Key': 'loan-request-sandbox-0001' }
    });
    assert.equal(loanRequest.status, 202, JSON.stringify(loanRequest.data));

    const selfApproval = await request('POST', `/api/payment-operations/${loanRequest.data.operation_id}/approve`, {
        token: memberToken,
        body: {},
        headers: { 'Idempotency-Key': 'loan-self-approval-0001' }
    });
    assert.equal(selfApproval.status, 403);

    const fraud = await request('POST', `/api/members/${memberId}/fraud-reports`, {
        token: memberToken, body: { details: 'Test de blocage sandbox' }
    });
    assert.equal(fraud.status, 201);
    const blockedPayment = await request('POST', '/api/payments/intents', {
        token: memberToken, body: paymentBody, headers: { 'Idempotency-Key': 'blocked-payment-sandbox-0001' }
    });
    assert.equal(blockedPayment.status, 403);
    const replayAfterBlock = await request('POST', '/api/payments/intents', {
        token: memberToken, body: paymentBody, headers: { 'Idempotency-Key': 'collection-sandbox-0001' }
    });
    assert.equal(replayAfterBlock.status, 201);
    assert.equal(replayAfterBlock.data.transaction_id, firstPayment.data.transaction_id);

    const webhookBody = Buffer.from(JSON.stringify({ event_id: 'sandbox-event-1', transaction_id: firstPayment.data.transaction_id, status: 'succeeded' }));
    const invalidWebhook = await request('POST', '/api/webhooks/mtn', {
        body: webhookBody, headers: { 'X-Payment-Signature': '00'.repeat(32) }
    });
    assert.equal(invalidWebhook.status, 401);

    const missingSecretWebhook = await request('POST', '/api/webhooks/orange', {
        body: webhookBody, headers: { 'X-Payment-Signature': '00'.repeat(32) }
    });
    assert.equal(missingSecretWebhook.status, 503);

    const signature = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET_MTN).update(webhookBody).digest('hex');
    const webhook = await request('POST', '/api/webhooks/mtn', {
        body: webhookBody, headers: { 'X-Payment-Signature': `sha256=${signature}` }
    });
    assert.equal(webhook.status, 201);
    const duplicateWebhook = await request('POST', '/api/webhooks/mtn', {
        body: webhookBody, headers: { 'X-Payment-Signature': signature }
    });
    assert.equal(duplicateWebhook.status, 200);
    assert.equal(duplicateWebhook.data.duplicate, true);
});
