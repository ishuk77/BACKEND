const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIRECTORY = path.join(__dirname, '..', 'migrations');
const TABLES_WITHOUT_NUMERIC_ID = new Set(['social_channel_links']);

function callbackArguments(args) {
    const values = [...args];
    const callback = typeof values[values.length - 1] === 'function' ? values.pop() : () => {};
    if (!values.length) return { params: [], callback };
    if (values.length === 1 && Array.isArray(values[0])) return { params: values[0], callback };
    return { params: values, callback };
}

function translatePostgresSql(source) {
    let sql = source.trim();
    const ignoredInsert = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+([a-z_]+)/i.exec(sql);
    if (ignoredInsert) sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');

    sql = sql
        .replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN')
        .replace(/datetime\(\s*'now'\s*,\s*'(-?\d+)\s+days'\s*\)/gi, 'CURRENT_TIMESTAMP + INTERVAL \'$1 days\'')
        .replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
        .replace(/datetime\(([^()]+)\)/gi, '$1')
        .replace(/([a-z_][a-z0-9_.]*)\s+COLLATE\s+NOCASE/gi, 'LOWER($1)')
        .replace(/json_each\(c\.media_ids_json\)\s+media/gi, "json_array_elements_text(COALESCE(c.media_ids_json, '[]')::json) AS media(value)")
        .replace(/\bmedia\.value\s*=\s*m\.id\b/gi, '(media.value)::bigint = m.id');

    if (ignoredInsert) sql = `${sql.replace(/;+\s*$/, '')} ON CONFLICT DO NOTHING`;

    let index = 0;
    sql = sql.replace(/\?/g, () => `$${++index}`);

    const insertedTable = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(sql);
    if (insertedTable && !TABLES_WITHOUT_NUMERIC_ID.has(insertedTable[1].toLowerCase()) && !/\bRETURNING\b/i.test(sql)) {
        sql = `${sql.replace(/;+\s*$/, '')} RETURNING id`;
    }
    return sql;
}

class PostgresDatabase {
    constructor(connectionString) {
        // pg is loaded only for PostgreSQL deployments so the SQLite test path remains usable
        // before dependencies are reinstalled.
        const { Pool, types } = require('pg');
        types.setTypeParser(20, value => {
            const parsed = Number(value);
            return Number.isSafeInteger(parsed) ? parsed : value;
        });

        const configuredMax = Number(process.env.DB_POOL_MAX);
        this.pool = new Pool({
            connectionString,
            max: Number.isInteger(configuredMax) && configuredMax > 0 && configuredMax <= 50 ? configuredMax : 10
        });
        this.dialect = 'postgres';
        this.transactions = new AsyncLocalStorage();
        this.ready = Promise.resolve();
    }

    serialize(callback) {
        callback();
        return this;
    }

    run(sql, ...args) {
        const { params, callback } = callbackArguments(args);
        this._execute(sql, params, 'run', callback);
        return this;
    }

    get(sql, ...args) {
        const { params, callback } = callbackArguments(args);
        this._execute(sql, params, 'get', callback);
        return this;
    }

    all(sql, ...args) {
        const { params, callback } = callbackArguments(args);
        this._execute(sql, params, 'all', callback);
        return this;
    }

    close(callback) {
        this.pool.end()
            .then(() => callback && callback(null))
            .catch(error => callback && callback(error));
    }

    async migrate() {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT pg_advisory_lock($1)', [754862901]);
            await client.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);
            const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
            const migrations = fs.readdirSync(MIGRATIONS_DIRECTORY)
                .filter(name => /^\d+_[\w-]+\.sql$/i.test(name))
                .sort();

            for (const name of migrations) {
                if (applied.has(name)) continue;
                const migration = fs.readFileSync(path.join(MIGRATIONS_DIRECTORY, name), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(migration);
                    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
                    await client.query('COMMIT');
                } catch (error) {
                    await client.query('ROLLBACK').catch(() => {});
                    throw new Error(`PostgreSQL migration ${name} failed: ${error.message}`);
                }
            }
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [754862901]).catch(() => {});
            client.release();
        }
    }

    _execute(sql, params, method, callback) {
        const context = this.transactions.getStore();
        const normalized = translatePostgresSql(sql);
        const isBegin = /^\s*BEGIN\b/i.test(normalized);
        const isFinish = /^\s*(COMMIT|ROLLBACK)\b/i.test(normalized);

        if (isBegin && !context) {
            this._begin(normalized, callback);
            return;
        }
        if (isFinish && context) {
            this._finish(context, normalized, method, callback);
            return;
        }

        const client = context ? context.client : this.pool;
        client.query(normalized, params)
            .then(result => this._respond(method, callback, null, result))
            .catch(error => this._respond(method, callback, error));
    }

    async _begin(sql, callback) {
        let client;
        try {
            client = await this.pool.connect();
            await client.query(sql);
            const context = { client };
            this.transactions.run(context, () => this._respond('run', callback, null, { rowCount: 0, rows: [] }));
        } catch (error) {
            if (client) client.release();
            this._respond('run', callback, error);
        }
    }

    async _finish(context, sql, method, callback) {
        try {
            const result = await context.client.query(sql);
            context.client.release();
            this.transactions.run(undefined, () => this._respond(method, callback, null, result));
        } catch (error) {
            context.client.release();
            this.transactions.run(undefined, () => this._respond(method, callback, error));
        }
    }

    _respond(method, callback, error, result = { rowCount: 0, rows: [] }) {
        if (method === 'get') {
            callback(error || null, error ? undefined : result.rows[0]);
            return;
        }
        if (method === 'all') {
            callback(error || null, error ? undefined : result.rows);
            return;
        }
        const statement = {
            lastID: result.rows[0] && result.rows[0].id,
            changes: result.rowCount || 0
        };
        callback.call(statement, error || null);
    }
}

function createSqliteDatabase(databasePath) {
    const sqlite3 = require('sqlite3').verbose();
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const database = new sqlite3.Database(databasePath, error => {
        if (error) rejectReady(error);
        else resolveReady();
    });
    database.dialect = 'sqlite';
    database.ready = ready;
    return database;
}

function createDatabase({ databaseUrl, databasePath }) {
    return databaseUrl ? new PostgresDatabase(databaseUrl) : createSqliteDatabase(databasePath);
}

module.exports = { createDatabase, translatePostgresSql };
