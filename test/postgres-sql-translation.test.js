const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { translatePostgresSql } = require('../src/database');

test('PostgreSQL adapter translates SQLite placeholders, conflict handling, and date helpers', () => {
    assert.equal(
        translatePostgresSql('INSERT OR IGNORE INTO post_reactions (post_id, account_id) VALUES (?, ?)'),
        'INSERT INTO post_reactions (post_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id'
    );
    assert.equal(
        translatePostgresSql("SELECT * FROM public_flashes WHERE datetime(starts_at) <= datetime('now')"),
        'SELECT * FROM public_flashes WHERE starts_at <= CURRENT_TIMESTAMP'
    );
    assert.equal(
        translatePostgresSql("SELECT * FROM accounts ORDER BY name COLLATE NOCASE ASC"),
        'SELECT * FROM accounts ORDER BY LOWER(name) ASC'
    );
});

test('PostgreSQL baseline contains no SQLite-only schema syntax', () => {
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_initial_schema.sql'), 'utf8');
    assert.equal(/AUTOINCREMENT|PRAGMA|RAISE\(ABORT|DATETIME/i.test(migration), false);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_accounts/);
    assert.match(migration, /CREATE TRIGGER financial_ledger_immutable_update/);
    assert.match(migration, /FOREIGN KEY \(group_id\) REFERENCES groups \(id\) DEFERRABLE INITIALLY IMMEDIATE/);
});

test('wallet transfer migration uses immutable minor-unit journal entries', () => {
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_wallet_transfers.sql'), 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS wallet_transfers/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS wallet_journal_entries/);
    assert.match(migration, /amount_minor BIGINT NOT NULL CHECK \(amount_minor > 0\)/);
    assert.match(migration, /wallet_journal_entries_immutable_update/);
});
