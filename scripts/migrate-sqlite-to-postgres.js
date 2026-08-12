#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { createDatabase } = require('../src/database');

const TARGET_TABLES = [
    'groups', 'members', 'platform_accounts', 'history', 'chat_messages', 'message_reactions',
    'chat_attachments', 'meetings', 'meeting_invites', 'wallet_topups', 'platform_account_memberships',
    'group_join_requests', 'group_invitations', 'group_elections', 'group_election_candidates',
    'group_election_votes', 'group_election_audit', 'account_notifications', 'friendships',
    'direct_messages', 'direct_message_attachments', 'direct_message_reactions', 'media_files',
    'social_posts', 'post_reactions', 'post_comments', 'comment_reactions', 'social_sandbox_ledger',
    'social_moderation_audit', 'post_reports', 'social_events', 'social_event_invites',
    'public_content_media', 'public_content', 'public_content_audit', 'paid_public_contents',
    'paid_public_content_payments', 'paid_public_content_ledger', 'paid_public_content_audit',
    'paid_public_content_moderation_audit', 'public_item_comments', 'public_comment_receipts',
    'public_flashes', 'social_channel_links', 'platform_momo', 'fraud_reports', 'review_requests',
    'financial_ledger', 'payment_attempts', 'payment_events', 'payment_operations',
    'payment_idempotency', 'financial_audit_log', 'deployment_settings', 'deployment_settings_audit'
];
const TABLES_WITHOUT_GENERATED_ID = new Set(['social_channel_links', 'deployment_settings']);
const BATCH_SIZE = 50;

function usage(message) {
    if (message) console.error(`Error: ${message}`);
    console.error('Usage: DATABASE_URL=... node scripts\\migrate-sqlite-to-postgres.js <sqlite-database-path>');
    process.exitCode = 1;
}

function sqliteAll(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function openSqliteReadOnly(filename) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, error => {
            if (error) reject(error);
            else resolve(database);
        });
    });
}

function sqliteClose(database) {
    return new Promise(resolve => database.close(() => resolve()));
}

function quoteIdentifier(identifier) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error('Unexpected database identifier');
    return `"${identifier}"`;
}

async function targetColumns(client, table) {
    const result = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1`,
        [table]
    );
    return new Set(result.rows.map(row => row.column_name));
}

async function copyTable(source, client, table, allowedColumns) {
    const sourceColumns = await sqliteAll(source, `PRAGMA table_info(${quoteIdentifier(table)})`);
    if (!sourceColumns.length) return 0;

    const columns = sourceColumns
        .map(column => column.name)
        .filter(column => allowedColumns.has(column));
    if (!columns.length) return 0;

    const rows = await sqliteAll(source, `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table)}`);
    const tableIdentifier = quoteIdentifier(table);
    const columnSql = columns.map(quoteIdentifier).join(', ');

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        const batch = rows.slice(offset, offset + BATCH_SIZE);
        const values = [];
        const placeholders = batch.map((row, rowIndex) => `(${columns.map((_, columnIndex) => {
            values.push(row[columns[columnIndex]] === undefined ? null : row[columns[columnIndex]]);
            return `$${rowIndex * columns.length + columnIndex + 1}`;
        }).join(', ')})`);
        await client.query(`INSERT INTO ${tableIdentifier} (${columnSql}) VALUES ${placeholders.join(', ')}`, values);
    }
    return rows.length;
}

async function ensureEmptyTarget(client) {
    for (const table of TARGET_TABLES) {
        const result = await client.query(`SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(table)} LIMIT 1) AS has_rows`);
        if (result.rows[0].has_rows) {
            throw new Error(`The PostgreSQL target is not empty (found rows in ${table}). Refusing to merge data.`);
        }
    }
}

async function resetSequences(client) {
    for (const table of TARGET_TABLES) {
        if (TABLES_WITHOUT_GENERATED_ID.has(table)) continue;
        const tableIdentifier = quoteIdentifier(table);
        await client.query(
            `SELECT setval(
                pg_get_serial_sequence($1, 'id'),
                COALESCE(MAX(id), 1),
                MAX(id) IS NOT NULL
             ) FROM ${tableIdentifier}`,
            [table]
        );
    }
}

async function main() {
    const sourceArgument = process.argv[2];
    if (!process.env.DATABASE_URL) return usage('DATABASE_URL must point to the PostgreSQL target.');
    if (!sourceArgument) return usage('A SQLite source database path is required.');

    const sourcePath = path.resolve(sourceArgument);
    if (!fs.existsSync(sourcePath)) return usage('The SQLite source database does not exist.');

    let source;
    let target;
    let client;
    try {
        source = await openSqliteReadOnly(sourcePath);
        target = createDatabase({ databaseUrl: process.env.DATABASE_URL });
        await target.migrate();
        const foreignKeyViolations = await sqliteAll(source, 'PRAGMA foreign_key_check');
        if (foreignKeyViolations.length) {
            throw new Error('The SQLite source has foreign-key violations. Repair it before importing.');
        }

        client = await target.pool.connect();
        await client.query('BEGIN');
        try {
            for (const table of TARGET_TABLES) {
                await client.query(`LOCK TABLE ${quoteIdentifier(table)} IN ACCESS EXCLUSIVE MODE`);
            }
            await ensureEmptyTarget(client);
            await client.query('SET CONSTRAINTS ALL DEFERRED');
            const counts = [];
            for (const table of TARGET_TABLES) {
                counts.push([table, await copyTable(source, client, table, await targetColumns(client, table))]);
            }
            await resetSequences(client);
            await client.query('COMMIT');
            const total = counts.reduce((sum, [, count]) => sum + count, 0);
            console.log(`Migrated ${total} rows from SQLite into PostgreSQL.`);
            for (const [table, count] of counts) {
                if (count) console.log(`  ${table}: ${count}`);
            }
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        }
    } finally {
        if (client) client.release();
        if (source) await sqliteClose(source);
        if (target) await new Promise(resolve => target.close(resolve));
    }
}

main().catch(error => {
    console.error(`SQLite to PostgreSQL migration failed: ${error.message}`);
    process.exitCode = 1;
});
