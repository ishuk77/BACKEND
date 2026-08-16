const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'public-enhancements-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'public-enhancements-test-secret';
const { start, db } = require('../src/server');
const { registerActiveAccount } = require('./helpers/account-security');

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

async function account(phone) {
    return registerActiveAccount(request, {
        prenom: 'Awa', name: 'Test', phone, identityNumber: `ID-${phone.replace(/\D/g, '')}`,
        browserSessionId: `enhancement-${phone.replace(/\D/g, '')}`
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

test('public advertising, comment receipts, curated flashes, and social links respect sandbox and visibility rules', async () => {
    const member = await account('+22997770001');
    assert.equal(member.status, 201, JSON.stringify(member.data));
    await run('UPDATE platform_accounts SET internal_wallet = 5 WHERE id = ?', [member.data.account.id]);

    const prices = await request('GET', '/api/member-content/prices', { token: member.data.accessToken });
    assert.equal(prices.data.prices.text_or_photo_advertisement_minor, 25);
    assert.equal(prices.data.prices.video_per_started_mebibyte_per_day_minor, 10);
    assert.equal(prices.data.prices.paid_comment_minor, 25);

    const videoBody = Buffer.alloc((1024 * 1024) + 1, 1);
    videoBody.write('ftyp', 4);
    const video = await request('POST', '/api/social/uploads', {
        token: member.data.accessToken,
        headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'annonce.mp4' },
        body: videoBody
    });
    assert.equal(video.status, 201, JSON.stringify(video.data));
    const advertised = await request('POST', '/api/member-content', {
        token: member.data.accessToken,
        headers: { 'Idempotency-Key': 'enhancement-video-ad-0001' },
        body: { content_type: 'post', body: 'Vidéo de démonstration', media_ids: [video.data.media.id], duration_days: 2, payment_method: 'internal_wallet' }
    });
    assert.equal(advertised.status, 201, JSON.stringify(advertised.data));
    assert.equal(advertised.data.receipt.amount_minor, 40);
    assert.equal(advertised.data.receipt.sandbox, true);
    assert.ok((await request('GET', '/api/public/news')).data.items.some(item => item.source === 'member_content' && item.id === advertised.data.content.id));

    const commentHeaders = { 'Idempotency-Key': 'enhancement-paid-comment-0001' };
    const comment = await request('POST', `/api/public/news/member_content/${advertised.data.content.id}/comments`, {
        token: member.data.accessToken, headers: commentHeaders, body: { body: 'Très utile.' }
    });
    assert.equal(comment.status, 201);
    assert.equal(comment.data.receipt.amount_minor, 25);
    assert.equal(comment.data.receipt.platform_amount_minor, 13);
    assert.equal(comment.data.receipt.post_author_amount_minor, 12);
    const replay = await request('POST', `/api/public/news/member_content/${advertised.data.content.id}/comments`, {
        token: member.data.accessToken, headers: commentHeaders, body: { body: 'Très utile.' }
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.data.idempotent_replay, true);
    assert.equal((await request('GET', `/api/public/news/member_content/${advertised.data.content.id}/comments`)).data.comments.length, 1);

    const privatePost = await request('POST', '/api/social/posts', {
        token: member.data.accessToken, body: { body: 'Discussion réservée', visibility: 'friends' }
    });
    const privateComment = await request('POST', `/api/social/posts/${privatePost.data.id}/comments`, {
        token: member.data.accessToken, body: { body: 'Sans facture.' }
    });
    assert.equal(privateComment.status, 201);
    assert.equal(Object.hasOwn(privateComment.data, 'receipt'), false);

    const admin = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Flash', phone: '+22990009999', idNumber: 'ADMIN-FLASH' }
    });
    assert.equal(admin.status, 201);
    assert.equal((await request('POST', '/api/admin/flashes', {
        token: admin.data.accessToken, body: { category: 'local', title: 'Cotonou', body: 'Programme local.', locality_tag: 'Cotonou' }
    })).status, 201);
    assert.equal((await request('POST', '/api/admin/flashes', {
        token: admin.data.accessToken, body: { category: 'sport', title: 'Sport AVEC', body: 'Programme éditorial.' }
    })).status, 201);
    const local = await request('GET', '/api/public/flashes?locality=Cotonou');
    assert.ok(local.data.flashes.some(flash => flash.title === 'Cotonou'));
    assert.equal((await request('GET', '/api/public/flashes?locality=Porto-Novo')).data.flashes.some(flash => flash.title === 'Cotonou'), false);

    assert.equal((await request('PUT', '/api/admin/social-links/facebook', {
        token: admin.data.accessToken, body: { url: 'https://example.test/not-facebook' }
    })).status, 400);
    assert.equal((await request('PUT', '/api/admin/social-links/facebook', {
        token: admin.data.accessToken, body: { url: 'https://www.facebook.com/avec.officiel' }
    })).status, 200);
    assert.equal((await request('GET', '/api/public/social-links')).data.links[0].network, 'facebook');
});
