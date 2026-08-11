const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'paid-public-content-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'paid-public-content-test-secret';
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

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('paid public content debits only the internal sandbox wallet and confirms Momo only when simulated', async () => {
    const phone = '+22993334444';
    const browserSessionId = 'paid-content-browser-session';
    const admin = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Contenu', phone: '+22990000123', idNumber: 'ADMIN-PAID-CONTENT' }
    });
    assert.equal(admin.status, 201);
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    const registration = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom: 'Awa', name: 'Contenu', phone, identityNumber: 'PAID-CONTENT-1', pin: '1234', pinConfirmation: '1234',
            browserSessionId, phoneVerificationToken: verification.data.verificationToken
        }
    });
    assert.equal(registration.status, 201);
    await run('UPDATE platform_accounts SET internal_wallet = 2 WHERE id = ?', [registration.data.account.id]);

    assert.equal((await request('POST', '/api/member-content', {
        token: registration.data.accessToken,
        body: { content_type: 'post', body: 'Sans clé', payment_method: 'internal_wallet' }
    })).status, 400);
    const walletPost = await request('POST', '/api/member-content', {
        token: registration.data.accessToken, headers: { 'Idempotency-Key': 'paid-content-wallet-0001' },
        body: { content_type: 'post', body: 'Publication payée par portefeuille', payment_method: 'internal_wallet' }
    });
    assert.equal(walletPost.status, 201);
    assert.equal(walletPost.data.receipt.sandbox, true);
    const profile = await request('GET', '/api/platform/profile', { token: registration.data.accessToken });
    assert.equal(profile.data.account.internal_wallet, 1.75);
    assert.equal((await request('POST', '/api/member-content', {
        token: registration.data.accessToken, headers: { 'Idempotency-Key': 'paid-content-wallet-0001' },
        body: { content_type: 'post', body: 'Publication payée par portefeuille', payment_method: 'internal_wallet' }
    })).data.idempotent_replay, true);

    const momoAd = await request('POST', '/api/member-content', {
        token: registration.data.accessToken, headers: { 'Idempotency-Key': 'paid-content-momo-0001' },
        body: {
            content_type: 'advertisement', title: 'Savon AVEC', body: 'Savon artisanal.',
            product_price: '5 USD', product_total: '5 USD', availability: 'En stock', address: 'Cotonou',
            contact_phone: '+229 90 00 00 00', contact_email: 'vente@example.test', payment_method: 'momo_sandbox'
        }
    });
    assert.equal(momoAd.status, 202);
    assert.equal((await request('GET', '/api/public/news')).data.items.some(item => item.id === momoAd.data.content.id && item.source === 'member_content'), false);
    assert.equal((await request('POST', `/api/member-content/payments/${momoAd.data.receipt.payment_id}/simulate-confirmation`, {
        token: registration.data.accessToken, body: {}
    })).status, 400);
    const confirmation = await request('POST', `/api/member-content/payments/${momoAd.data.receipt.payment_id}/simulate-confirmation`, {
        token: registration.data.accessToken, headers: { 'Idempotency-Key': 'paid-content-momo-confirm-0001' }, body: {}
    });
    assert.equal(confirmation.status, 200);
    const news = await request('GET', '/api/public/news');
    const publicAd = news.data.items.find(item => item.id === momoAd.data.content.id && item.source === 'member_content');
    assert.equal(publicAd.contact_email, 'vente@example.test');
    assert.equal((await request('POST', '/api/member-content', {
        token: registration.data.accessToken, headers: { 'Idempotency-Key': 'paid-content-photos-0001' },
        body: { content_type: 'advertisement', body: 'x', title: 'x', product_price: '1', product_total: '1', availability: 'x', address: 'x', contact_phone: '+22990000000', contact_email: 'x@example.test', payment_method: 'momo_sandbox', media_ids: [1, 2, 3, 4, 5] }
    })).status, 400);

    const pendingAd = await request('POST', '/api/member-content', {
        token: registration.data.accessToken,
        headers: { 'Idempotency-Key': 'paid-content-pending-moderation-0001' },
        body: { content_type: 'advertisement', title: 'Offre xxx', body: 'Publicité à examiner.', product_price: '1 USD', product_total: '1 USD', availability: 'En stock', address: 'Cotonou', contact_phone: '+22990000000', contact_email: 'vente@example.test', payment_method: 'internal_wallet' }
    });
    assert.equal(pendingAd.status, 201);
    assert.equal(pendingAd.data.content.publication_status, 'pending_review');
    const moderationQueue = await request('GET', '/api/admin/social/moderation', { token: admin.data.accessToken });
    assert.equal(moderationQueue.status, 200, JSON.stringify(moderationQueue.data));
    const queuedAd = moderationQueue.data.items.find(item => item.content_type === 'paid_content' && item.content_id === pendingAd.data.content.id);
    assert.ok(queuedAd);
    assert.equal((await request('POST', `/api/admin/social/moderation/paid_content/${pendingAd.data.content.id}`, {
        token: admin.data.accessToken, body: { action: 'approve', reason: 'Publicité conforme.' }
    })).status, 200);
    assert.ok((await request('GET', '/api/public/news')).data.items.some(item => item.source === 'member_content' && item.id === pendingAd.data.content.id));
});
