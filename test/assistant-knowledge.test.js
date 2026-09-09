const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const databasePath = path.join(__dirname, '..', 'assistant-knowledge-test.db');
fs.rmSync(databasePath, { force: true });
process.env.DATABASE_PATH = databasePath;
process.env.JWT_SECRET = 'assistant-knowledge-test-secret';
const { start, db } = require('../src/server');

let server; let port;
function request(method, route, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
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
    return new Promise((resolve, reject) => db.run(sql, values, function done(err) {
        if (err) reject(err); else resolve(this.lastID);
    }));
}

test.before(async () => { server = await start(0); port = server.address().port; });
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(databasePath, { force: true });
});

test('assistant only retrieves approved knowledge and rejects sensitive or non-public learning input', async () => {
    const admin = await request('POST', '/api/platform-admin', { body: { prenom: 'Admin', name: 'Assistant', phone: '+22990000077', idNumber: 'ADMIN-ASSISTANT' } });
    assert.equal(admin.status, 201);
    const token = admin.data.accessToken;

    const sensitive = await request('POST', '/api/assistant/query', { body: { question: 'Mon PIN est 1234', locale: 'fr', saveForReview: true } });
    assert.equal(sensitive.status, 400);
    assert.equal((await request('GET', '/api/admin/assistant/submissions', { token })).data.submissions.length, 0);

    const curated = await request('POST', '/api/admin/assistant/knowledge', {
        token, body: { title: 'Règles groupes', body: 'Les groupes AVEC suivent les règles affichées dans l’espace membre.', locale: 'fr' }
    });
    assert.equal(curated.status, 201);
    const answer = await request('POST', '/api/assistant/query', { body: { question: 'Quelles règles pour les groupes AVEC ?', locale: 'fr' } });
    assert.equal(answer.status, 200);
    assert.match(answer.data.answer, /Les groupes AVEC suivent/);
    assert.deepEqual(answer.data.sources, [curated.data.id]);

    const accountId = await run(
        `INSERT INTO platform_accounts (identifier, prenom, name, phone, password, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['AVEC-ASSISTANT-PUBLIC', 'Public', 'Auteur', '+22990000078', 'hash', 'active']
    );
    const privatePost = await run(
        `INSERT INTO social_posts (author_account_id, body, visibility, moderation_status)
         VALUES (?, ?, 'friends', 'approved')`,
        [accountId, 'Discussion entre contacts']
    );
    const publicPost = await run(
        `INSERT INTO social_posts (author_account_id, body, visibility, moderation_status)
         VALUES (?, ?, 'public', 'approved')`,
        [accountId, 'Les réunions AVEC sont organisées par le groupe.']
    );
    assert.equal((await request('POST', '/api/admin/assistant/submissions/public-content', {
        token, body: { contentType: 'post', contentId: privatePost, locale: 'fr' }
    })).status, 400);
    const queued = await request('POST', '/api/admin/assistant/submissions/public-content', {
        token, body: { contentType: 'post', contentId: publicPost, locale: 'fr' }
    });
    assert.equal(queued.status, 201);
    const pending = await request('GET', '/api/admin/assistant/submissions', { token });
    assert.equal(pending.data.submissions.length, 1);
    assert.equal((await request('POST', `/api/admin/assistant/submissions/${queued.data.id}/review`, {
        token, body: { action: 'approve', note: 'Publication publique utile.' }
    })).status, 200);
    const approvedAnswer = await request('POST', '/api/assistant/query', { body: { question: 'Comment sont organisées les réunions AVEC ?', locale: 'fr' } });
    assert.match(approvedAnswer.data.answer, /réunions AVEC sont organisées/);
});
