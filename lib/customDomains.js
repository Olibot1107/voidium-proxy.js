const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function normalizeDomain(domain) {
    return String(domain || '').trim().toLowerCase();
}

function openDb(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
            return resolve(db);
        });
    });
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function initDb(dbPath) {
    const resolved = dbPath || path.resolve(__dirname, '..', 'custom-domains.sqlite');
    const db = await openDb(resolved);
    await run(
        db,
        `CREATE TABLE IF NOT EXISTS custom_domains (
            domain TEXT PRIMARY KEY,
            target TEXT NOT NULL,
            port INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`
    );
    return { db, path: resolved };
}

async function listDomains(db) {
    const rows = await all(db, 'SELECT domain, target, port FROM custom_domains ORDER BY domain');
    const map = {};
    for (const row of rows) {
        map[row.domain] = { target: row.target, port: row.port };
    }
    return map;
}

async function getDomain(db, domain) {
    const key = normalizeDomain(domain);
    if (!key) return null;
    const row = await get(db, 'SELECT domain, target, port FROM custom_domains WHERE domain = ?', [key]);
    if (!row) return null;
    return { target: row.target, port: row.port };
}

async function setDomain(db, domain, entry) {
    const key = normalizeDomain(domain);
    if (!key) return false;
    const now = new Date().toISOString();
    await run(
        db,
        `INSERT INTO custom_domains (domain, target, port, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(domain) DO UPDATE SET
            target = excluded.target,
            port = excluded.port,
            updated_at = excluded.updated_at`,
        [key, entry.target, entry.port, now, now]
    );
    return true;
}

async function removeDomain(db, domain) {
    const key = normalizeDomain(domain);
    if (!key) return false;
    const result = await run(db, 'DELETE FROM custom_domains WHERE domain = ?', [key]);
    return result.changes > 0;
}

module.exports = {
    initDb,
    listDomains,
    getDomain,
    setDomain,
    removeDomain,
    normalizeDomain
};
