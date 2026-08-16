const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'meta-page-publishing-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'meta-page-publishing-test-secret';
delete process.env.META_APP_ID;
delete process.env.META_APP_SECRET;
delete process.env.META_PAGE_ID;
delete process.env.META_PAGE_ACCESS_TOKEN;
delete process.env.META_REDIRECT_URI;

const { start, db } = require('../src/server');

let server;
let port;
let adminAccessToken;

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
                try { resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {}, headers: res.headers }); } catch (_) { resolve({ status: res.statusCode, data: {}, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function formRequest(route, body) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(body);
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: route,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': payload.length }
        }, res => {
            let output = '';
            res.on('data', chunk => { output += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }); } catch (_) { resolve({ status: res.statusCode, data: {} }); }
            });
        });
        req.on('error', reject);
        req.end(payload);
    });
}

function base64Url(value) {
    return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('Meta page publishing automatically sends declared public promotions server-side', async () => {
    const admin = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Meta', phone: '+22990000666', idNumber: 'ADMIN-META' }
    });
    assert.equal(admin.status, 201);
    adminAccessToken = admin.data.accessToken;

    const unconfigured = await request('GET', '/api/admin/meta/status', { token: admin.data.accessToken });
    assert.equal(unconfigured.status, 200);
    assert.equal(unconfigured.data.publishingReady, false);
    assert.equal(Object.prototype.hasOwnProperty.call(unconfigured.data, 'pageAccessToken'), false);
    assert.equal((await request('GET', '/api/admin/meta/status')).status, 401);

    const publicContent = await request('POST', '/api/admin/public-content', {
        token: admin.data.accessToken,
        body: {
            content_type: 'announcement',
            audience: 'public',
            placement: 'news',
            title: 'Annonce approuvée',
            body: 'Cette annonce a été sélectionnée explicitement.',
            starts_at: new Date(Date.now() - 60_000).toISOString(),
            ends_at: null,
            active: true,
            media_id: null
        }
    });

    function run(sql, values = []) {
        return new Promise((resolve, reject) => db.run(sql, values, err => err ? reject(err) : resolve()));
    }

    function get(sql, values = []) {
        return new Promise((resolve, reject) => db.get(sql, values, (err, row) => err ? reject(err) : resolve(row)));
    }

    async function waitFor(check, timeoutMs = 500) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await check()) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.fail('Timed out waiting for asynchronous Meta publication');
    }

    process.env.META_APP_ID = '1234567890';
    process.env.META_APP_SECRET = 'a'.repeat(32);
    process.env.META_PAGE_ID = '9876543210';
    process.env.META_PAGE_ACCESS_TOKEN = 'test-page-access-token';

    async function testAutomaticPromotionPublication() {
        const originalRequest = https.request;
        const calls = [];
        let failNextPublication = false;
        https.request = (options, callback) => {
            const req = new EventEmitter();
            let body = '';
            req.write = chunk => { body += chunk; };
            req.end = () => {
                process.nextTick(() => {
                    const response = new EventEmitter();
                    const failed = failNextPublication;
                    failNextPublication = false;
                    response.statusCode = failed ? 400 : 200;
                    callback(response);
                    response.emit('data', Buffer.from(JSON.stringify(failed
                        ? { error: { code: 190, message: 'Page token rejected for test' } }
                        : { id: `9876543210_auto_${calls.length + 1}` })));
                    response.emit('end');
                });
            };
            req.destroy = error => { if (error) req.emit('error', error); };
            calls.push({ options, get body() { return body; } });
            return req;
        };
        const createAdminContent = body => request('POST', '/api/admin/public-content', {
            token: adminAccessToken,
            body: {
                content_type: 'advertisement',
                audience: 'public',
                placement: 'news',
                title: 'Offre publique',
                body: 'Publicité automatiquement approuvée.',
                starts_at: new Date(Date.now() - 60_000).toISOString(),
                ends_at: null,
                active: true,
                media_id: null,
                ...body
            }
        });

        try {
            const publicAnnouncement = await createAdminContent({
                content_type: 'announcement',
                title: 'Annonce publique automatique'
            });
            assert.equal(publicAnnouncement.status, 201);
            await waitFor(async () => calls.length === 1);
            const publication = await get(
                `SELECT status FROM meta_page_publications
                 WHERE source = ? AND source_content_id = ?`,
                ['public_content', publicAnnouncement.data.id]
            );
            assert.equal(publication.status, 'published');
            assert.match(new URLSearchParams(calls[0].body).get('message'), /https:\/\/www\.avec\.my\/communaute/);

            assert.equal((await createAdminContent({ audience: 'members', title: 'Publicité membres' })).status, 201);
            const inactiveAdvertisement = await createAdminContent({ active: false, title: 'Publicité inactive' });
            assert.equal(inactiveAdvertisement.status, 201);
            assert.equal((await request('POST', `/api/admin/public-content/${inactiveAdvertisement.data.id}/archive`, {
                token: adminAccessToken, body: {}
            })).status, 200);
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(calls.length, 1, 'member, inactive, and archived content must not publish');

            const publicMarketingCampaign = await createAdminContent({
                title: 'Campagne de lancement AVEC',
                body: 'Découvrez la plateforme AVEC.'
            });
            assert.equal(publicMarketingCampaign.status, 201);
            await waitFor(async () => calls.length === 2);

            const phone = '+22995556666';
            const browserSessionId = 'meta-auto-publication-session';
            const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
            const verification = await request('POST', '/api/platform/phone-verifications/verify', {
                body: { phone, browserSessionId, code: delivery.data.sandboxCode }
            });
            const registration = await request('POST', '/api/platform/auth/register', {
                body: {
                    prenom: 'Awa', name: 'Meta', phone, identityNumber: 'META-AUTO-1', pin: '1234', pinConfirmation: '1234',
                    browserSessionId, phoneVerificationToken: verification.data.verificationToken
                }
            });
            assert.equal(registration.status, 201);
            await run('UPDATE platform_accounts SET internal_wallet = 5 WHERE id = ?', [registration.data.account.id]);

            const paidAdvertisement = await request('POST', '/api/member-content', {
                token: registration.data.accessToken,
                headers: { 'Idempotency-Key': 'meta-auto-paid-ad-0001' },
                body: {
                    content_type: 'advertisement', title: 'Campagne produit AVEC', body: 'Offre xxx lancée sans seconde modération.',
                    product_price: '5 USD', product_total: '5 USD', availability: 'En stock', address: 'Cotonou',
                    contact_phone: '+229 90 00 00 00', contact_email: 'vente@example.test', payment_method: 'internal_wallet'
                }
            });
            assert.equal(paidAdvertisement.status, 201);
            assert.equal(paidAdvertisement.data.content.publication_status, 'approved');
            await waitFor(async () => calls.length === 3);

            const genericPaidPost = await request('POST', '/api/member-content', {
                token: registration.data.accessToken,
                headers: { 'Idempotency-Key': 'meta-auto-generic-post-0001' },
                body: { content_type: 'post', body: 'Publication sociale publique, sans publicité.', payment_method: 'internal_wallet' }
            });
            assert.equal(genericPaidPost.status, 201);
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(calls.length, 3, 'generic paid posts must not publish to Facebook');

            const socialPost = await request('POST', '/api/social/posts', {
                token: registration.data.accessToken,
                headers: { 'Idempotency-Key': 'meta-auto-social-post-0001' },
                body: { body: 'Publication sociale publique, sans campagne.', visibility: 'public' }
            });
            assert.equal(socialPost.status, 201);
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(calls.length, 3, 'arbitrary public social posts must not publish to Facebook');
            const friendsPost = await request('POST', '/api/social/posts', {
                token: registration.data.accessToken,
                headers: { 'Idempotency-Key': 'meta-auto-friends-post-0001' },
                body: { body: 'Publication entre amis.', visibility: 'friends' }
            });
            assert.equal(friendsPost.status, 201);
            await new Promise(resolve => setTimeout(resolve, 30));
            assert.equal(calls.length, 3, 'friends-only content must not publish to Facebook');
            assert.equal((await request('POST', '/api/admin/meta/publish', {
                token: adminAccessToken,
                headers: { 'Idempotency-Key': 'meta-social-post-manual-0001' },
                body: { source: 'social_post', sourceContentId: socialPost.data.id }
            })).status, 400);

            failNextPublication = true;
            const failingAdvertisement = await createAdminContent({ title: 'Publicité avec échec Meta' });
            assert.equal(failingAdvertisement.status, 201, 'local approval must succeed even when Meta fails');
            await waitFor(async () => {
                const failed = await get(
                    `SELECT status FROM meta_page_publications WHERE source = ? AND source_content_id = ?`,
                    ['public_content', failingAdvertisement.data.id]
                );
                return failed && failed.status === 'failed';
            });
            const publishable = await request('GET', '/api/admin/meta/publishable-content', { token: adminAccessToken });
            assert.equal(publishable.status, 200);
            assert.ok(publishable.data.failures.some(item => item.source === 'public_content'
                && item.sourceContentId === failingAdvertisement.data.id
                && item.reason.includes('Meta 190: Page token rejected for test')));
            const retry = await request('PUT', `/api/admin/public-content/${failingAdvertisement.data.id}`, {
                token: adminAccessToken,
                body: {
                    content_type: 'advertisement',
                    audience: 'public',
                    placement: 'news',
                    title: 'Publicité avec nouvel essai Meta',
                    body: 'La mise à jour relance automatiquement la publication.',
                    starts_at: new Date(Date.now() - 60_000).toISOString(),
                    ends_at: null,
                    active: true,
                    media_id: null
                }
            });
            assert.equal(retry.status, 200);
            await waitFor(async () => calls.length === 5);
            const retries = await get(
                `SELECT COUNT(*) AS count FROM meta_page_publications
                 WHERE source = ? AND source_content_id = ?`,
                ['public_content', failingAdvertisement.data.id]
            );
            assert.equal(retries.count, 2, 'a failed automatic publication must be retryable without duplicating a successful post');
        } finally {
            https.request = originalRequest;
        }
    }
    assert.equal(publicContent.status, 201);

    const publishable = await request('GET', '/api/admin/meta/publishable-content', { token: admin.data.accessToken });
    assert.equal(publishable.status, 200);
    assert.ok(publishable.data.items.some(item => item.source === 'public_content' && item.sourceContentId === publicContent.data.id));

    const originalRequest = https.request;
    const calls = [];
    https.request = (options, callback) => {
        const req = new EventEmitter();
        let body = '';
        req.write = chunk => { body += chunk; };
        req.end = () => {
            process.nextTick(() => {
                const response = new EventEmitter();
                response.statusCode = 200;
                callback(response);
                response.emit('data', Buffer.from(JSON.stringify(options.path.includes('/oauth/access_token')
                    ? { access_token: 'temporary-test-token' }
                    : { id: '9876543210_1234567890' })));
                response.emit('end');
            });
        };
        req.destroy = error => { if (error) req.emit('error', error); };
        calls.push({ options, get body() { return body; } });
        return req;
    };
    try {
        const start = await request('GET', '/auth/meta/start', {
            token: admin.data.accessToken,
            headers: { Accept: 'application/json' }
        });
        assert.equal(start.status, 200);
        const state = new URL(start.data.authorizeUrl).searchParams.get('state');
        const callback = await request('GET', `/auth/meta/callback?state=${encodeURIComponent(state)}&code=test-code`);
        assert.equal(callback.status, 303);

        const signedPayload = base64Url(JSON.stringify({ app_id: process.env.META_APP_ID, user_id: 'test-user' }));
        const signature = crypto.createHmac('sha256', process.env.META_APP_SECRET).update(signedPayload).digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        assert.equal((await formRequest('/auth/meta/deauthorize', `signed_request=${encodeURIComponent(`${signature}.${signedPayload}`)}`)).status, 200);

        const publish = await request('POST', '/api/admin/meta/publish', {
            token: admin.data.accessToken,
            headers: { 'Idempotency-Key': 'meta-publish-test-0001' },
            body: { source: 'public_content', sourceContentId: publicContent.data.id }
        });
        assert.equal(publish.status, 201, JSON.stringify(publish.data));
        assert.equal(publish.data.publication.status, 'published');
        assert.equal(calls.at(-1).options.hostname, 'graph.facebook.com');
        assert.match(calls.at(-1).options.path, /\/9876543210\/feed$/);
        assert.match(calls.at(-1).body, /message=/);
        assert.match(calls.at(-1).body, /access_token=test-page-access-token/);
        assert.match(new URLSearchParams(calls.at(-1).body).get('message'), /https:\/\/www\.avec\.my\/communaute/);

        const replay = await request('POST', '/api/admin/meta/publish', {
            token: admin.data.accessToken,
            headers: { 'Idempotency-Key': 'meta-publish-test-0001' },
            body: { source: 'public_content', sourceContentId: publicContent.data.id }
        });
        assert.equal(replay.status, 200);
        assert.equal(replay.data.idempotent_replay, true);
        assert.equal(calls.length, 2);
    } finally {
        https.request = originalRequest;
    }
    await testAutomaticPromotionPublication();
});
