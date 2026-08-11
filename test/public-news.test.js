const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const databasePath = path.join(__dirname, '..', 'public-news-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'public-news-test-jwt-secret';
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

function query(sql, values = []) {
    return new Promise((resolve, reject) => db.get(sql, values, (err, row) => err ? reject(err) : resolve(row)));
}

async function createAccount(phone, name = 'Membre') {
    const browserSessionId = `public-news-${phone.replace(/\D/g, '')}`;
    const delivery = await request('POST', '/api/platform/phone-verifications/request', { body: { phone, browserSessionId } });
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    return request('POST', '/api/platform/auth/register', {
        body: {
            prenom: name, name: 'AVEC', phone, identityNumber: `ID-${phone.replace(/\D/g, '')}`,
            pin: '1234', pinConfirmation: '1234', browserSessionId, phoneVerificationToken: verification.data.verificationToken
        }
    });
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('public news preserves social privacy and platform admins control scheduled content', async () => {
    const admin = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Actualités', phone: '+22990000077', idNumber: 'ADMIN-NEWS' }
    });
    assert.equal(admin.status, 201);
    const member = await createAccount('+22991112222', 'Awa');
    assert.equal(member.status, 201);

    assert.equal((await request('GET', '/api/admin/public-content')).status, 401);
    const memberRoleToken = jwt.sign({ id: 99, role: 'membre' }, process.env.JWT_SECRET);
    assert.equal((await request('POST', '/api/admin/public-content', {
        token: memberRoleToken,
        body: { title: 'Refusé', body: 'Refusé', content_type: 'announcement', starts_at: new Date().toISOString() }
    })).status, 403);

    const publicPost = await request('POST', '/api/social/posts', {
        token: member.data.accessToken,
        headers: { 'Idempotency-Key': 'public-news-public-post' },
        body: { body: 'Publication explicitement publique', visibility: 'public' }
    });
    const friendsPost = await request('POST', '/api/social/posts', {
        token: member.data.accessToken,
        headers: { 'Idempotency-Key': 'public-news-friends-post' },
        body: { body: 'Publication réservée aux contacts', visibility: 'friends' }
    });
    const pendingPost = await request('POST', '/api/social/posts', {
        token: member.data.accessToken,
        headers: { 'Idempotency-Key': 'public-news-pending-post' },
        body: { body: 'xxx contenu en examen', visibility: 'public' }
    });
    assert.equal(publicPost.status, 201);
    assert.equal(friendsPost.status, 201);
    assert.equal(pendingPost.data.moderation_status, 'pending');

    const now = new Date();
    const current = await request('POST', '/api/admin/public-content', {
        token: admin.data.accessToken,
        body: {
            content_type: 'announcement', title: '<script>Information utile</script>', body: 'Texte de plateforme.',
            audience: 'public', placement: 'news', starts_at: now.toISOString(), active: true
        }
    });
    const future = await request('POST', '/api/admin/public-content', {
        token: admin.data.accessToken,
        body: {
            content_type: 'advertisement', title: 'Demain', body: 'Pas encore visible.',
            audience: 'public', placement: 'news', starts_at: new Date(now.valueOf() + 86400000).toISOString(), active: true
        }
    });
    assert.equal(current.status, 201);
    assert.equal(future.status, 201);

    const updated = await request('PUT', `/api/admin/public-content/${current.data.id}`, {
        token: admin.data.accessToken,
        body: {
            content_type: 'announcement', title: '<script>Information mise à jour</script>', body: 'Texte de plateforme mis à jour.',
            audience: 'public', placement: 'news', starts_at: now.toISOString(), active: true
        }
    });
    assert.equal(updated.status, 200);

    const feed = await request('GET', '/api/public/news?limit=20');
    assert.equal(feed.status, 200);
    assert.ok(feed.data.items.some(item => item.source === 'platform' && item.id === current.data.id));
    assert.ok(feed.data.items.some(item => item.source === 'social' && item.id === publicPost.data.id));
    assert.equal(feed.data.items.some(item => item.source === 'social' && item.id === friendsPost.data.id), false);
    assert.equal(feed.data.items.some(item => item.source === 'social' && item.id === pendingPost.data.id), false);
    assert.equal(feed.data.items.some(item => item.source === 'platform' && item.id === future.data.id), false);
    assert.equal(feed.data.items.find(item => item.source === 'social' && item.id === publicPost.data.id).author_name, 'Membre AVEC');
    assert.equal(feed.data.items.some(item => Object.hasOwn(item, 'phone') || Object.hasOwn(item, 'identifier')), false);
    assert.equal((await request('GET', '/api/public/news?from=2100-01-01')).data.items.length, 0);

    assert.equal((await request('POST', `/api/admin/public-content/${current.data.id}/archive`, {
        token: admin.data.accessToken, body: {}
    })).status, 200);
    assert.equal((await request('GET', '/api/public/news')).data.items.some(item => item.source === 'platform' && item.id === current.data.id), false);
    assert.equal((await query('SELECT COUNT(*) AS count FROM public_content_audit WHERE content_id = ?', [current.data.id])).count, 3);
});
