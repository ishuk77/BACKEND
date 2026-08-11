const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const databasePath = path.join(__dirname, '..', 'deployment-settings-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'deployment-settings-test-jwt-secret';
process.env.SMS_API_KEY = 'must-never-be-stored-or-returned';

const { start, db } = require('../src/server');

let server;
let port;
let platformToken;

function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
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

function query(sql, params = []) {
    return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

const safeSettings = {
    publicBaseUrl: 'https://app.avec.example',
    allowedOrigins: ['https://app.avec.example'],
    hostingProvider: 'render',
    smsProvider: 'sandbox',
    videoProvider: 'jitsi',
    turnUrls: ['turn:turn.avec.example:3478', 'turns:turn.avec.example:5349?transport=tcp'],
    momoProviders: ['mtn', 'orange'],
    maintenanceMode: false,
    productionReady: false,
    backupVerified: true,
    sandboxAcknowledged: true
};

test.before(async () => {
    server = await start(0);
    port = server.address().port;
    const platform = await request('POST', '/api/platform-admin', {
        body: { prenom: 'Admin', name: 'Déploiement', phone: '+22990000123', idNumber: 'ADMIN-DEPLOYMENT' }
    });
    assert.equal(platform.status, 201);
    platformToken = platform.data.accessToken;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('deployment settings are platform-admin only and preserve no secret values', async () => {
    assert.equal((await request('GET', '/api/admin/deployment-settings')).status, 401);
    const memberToken = jwt.sign({ id: 12, role: 'membre' }, process.env.JWT_SECRET);
    assert.equal((await request('GET', '/api/admin/deployment-settings', { token: memberToken })).status, 403);

    const saved = await request('PUT', '/api/admin/deployment-settings', {
        token: platformToken,
        body: safeSettings
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.settings.turnUrls, safeSettings.turnUrls);
    assert.equal(JSON.stringify(saved.data).includes(process.env.SMS_API_KEY), false);
    assert.equal(saved.data.environment.find(item => item.id === 'sms').configured, true);

    const stored = await query('SELECT * FROM deployment_settings WHERE id = 1');
    assert.equal(JSON.stringify(stored).includes(process.env.SMS_API_KEY), false);
    assert.equal(Object.keys(stored).some(key => /secret|key|token|password/i.test(key)), false);

    const history = await request('GET', '/api/admin/deployment-settings/history', { token: platformToken });
    assert.equal(history.status, 200);
    assert.equal(history.data.length, 1);
    assert.equal(JSON.stringify(history.data).includes(process.env.SMS_API_KEY), false);
});

test('deployment settings reject secret fields and credential-bearing TURN URLs', async () => {
    const secretField = await request('PUT', '/api/admin/deployment-settings', {
        token: platformToken,
        body: { ...safeSettings, apiKey: 'forbidden' }
    });
    assert.equal(secretField.status, 400);
    const credentialTurn = await request('PUT', '/api/admin/deployment-settings', {
        token: platformToken,
        body: { ...safeSettings, turnUrls: ['turn:user:password@turn.avec.example:3478'] }
    });
    assert.equal(credentialTurn.status, 400);
});
