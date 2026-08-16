const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'phone-verification-expiry-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'phone-verification-expiry-test-jwt-secret';
process.env.PHONE_VERIFICATION_TTL_MS = '2000';
const { start, db } = require('../src/server');
const { registerActiveAccount } = require('./helpers/account-security');
let server;
let port;

function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body));
        const headers = { 'Content-Type': 'application/json', 'Content-Length': payload.length };
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({
            hostname: '127.0.0.1', port, path: route, method,
            headers
        }, res => {
            let output = '';
            res.on('data', chunk => { output += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, data: output ? JSON.parse(output) : {} }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('SANDBOX verification expires and locks after five incorrect attempts', async () => {
    const expiredPhone = '+22995550101';
    const expiredSession = 'expiry-browser-session-22995550101';
    const expiredAccount = await registerActiveAccount(request, {
        phone: expiredPhone, identityNumber: 'PHONE-EXPIRY-1', browserSessionId: 'expiry-account-registration-session'
    });
    const expired = await request('POST', '/api/platform/phone-verifications/request', {
        token: expiredAccount.data.accessToken, body: { phone: expiredPhone, browserSessionId: expiredSession }
    });
    await new Promise(resolve => setTimeout(resolve, 2100));
    const expiredCheck = await request('POST', '/api/platform/phone-verifications/verify', {
        token: expiredAccount.data.accessToken,
        body: { phone: expiredPhone, browserSessionId: expiredSession, code: expired.data.sandboxCode }
    });
    assert.equal(expiredCheck.status, 400);
    assert.match(expiredCheck.data.error, /expiré/);

    const phone = '+22995550102';
    const browserSessionId = 'attempt-browser-session-22995550102';
    const account = await registerActiveAccount(request, {
        phone, identityNumber: 'PHONE-EXPIRY-2', browserSessionId: 'attempt-account-registration-session'
    });
    const delivery = await request('POST', '/api/platform/phone-verifications/request', {
        token: account.data.accessToken, body: { phone, browserSessionId }
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request('POST', '/api/platform/phone-verifications/verify', {
            token: account.data.accessToken, body: { phone, browserSessionId, code: '000000' }
        });
        assert.equal(response.status, attempt === 5 ? 429 : 400);
    }
    const locked = await request('POST', '/api/platform/phone-verifications/verify', {
        token: account.data.accessToken, body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    assert.equal(locked.status, 429);
});
