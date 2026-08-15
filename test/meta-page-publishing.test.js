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

test('Meta page publishing remains admin-only, explicit, and server-side', async () => {
    const admin = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Meta', phone: '+22990000666', idNumber: 'ADMIN-META' }
    });
    assert.equal(admin.status, 201);

    const unconfigured = await request('GET', '/api/admin/meta/status', { token: admin.data.accessToken });
    assert.equal(unconfigured.status, 200);
    assert.equal(unconfigured.data.publishingReady, false);
    assert.equal(Object.prototype.hasOwnProperty.call(unconfigured.data, 'pageAccessToken'), false);
    assert.equal((await request('GET', '/api/admin/meta/status')).status, 401);

    process.env.META_APP_ID = '1234567890';
    process.env.META_APP_SECRET = 'a'.repeat(32);
    process.env.META_PAGE_ID = '9876543210';
    process.env.META_PAGE_ACCESS_TOKEN = 'test-page-access-token';

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
});
