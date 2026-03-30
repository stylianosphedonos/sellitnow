const config = require('../config');

function splitSqlStatements(sql) {
  return sql
    .replace(/^\uFEFF/, '')
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => {
          const t = line.trim();
          return t.length > 0 && !t.startsWith('--');
        })
        .join('\n')
        .trim()
    )
    .filter(Boolean);
}

async function execPostgresScript(pool, sqlText) {
  const client = await pool.connect();
  try {
    for (const stmt of splitSqlStatements(sqlText)) {
      await client.query(stmt);
    }
  } finally {
    client.release();
  }
}

let pgPool = null;
let sqliteDb = null;
let sqliteQueryFn = null;

function initSqlite() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const dbPath = config.database.sqlitePath;
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('foreign_keys = ON');

  sqliteQueryFn = function query(sql, params = []) {
    let sqliteSql = sql
      .replace(/\bILIKE\b/gi, 'LIKE')
      .replace(/COUNT\(\*\)::int/gi, 'COUNT(*) as count')
      .replace(/\bNOW\(\)/gi, "datetime('now')");

    const orderedParams = [];
    sqliteSql = sqliteSql.replace(/\$(\d+)/g, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      if (params[idx] !== undefined) orderedParams.push(params[idx]);
      return '?';
    });

    try {
      const stmt = sqliteDb.prepare(sqliteSql);
      const hasReturning = /RETURNING/i.test(sql);
      const isSelect = /^\s*SELECT/i.test(sql);
      if (isSelect || hasReturning) {
        const rows = stmt.all(...orderedParams);
        return Promise.resolve({ rows });
      }
      stmt.run(...orderedParams);
      return Promise.resolve({ rows: [] });
    } catch (err) {
      return Promise.reject(err);
    }
  };
}

if (config.database.usePostgres) {
  const { Pool } = require('pg');
  const url = config.database.url;
  const sslFromEnv = process.env.DATABASE_SSL;
  const useSsl =
    sslFromEnv === 'true' ||
    (sslFromEnv !== 'false' &&
      url &&
      (url.includes('sslmode=require') ||
        url.includes('render.com') ||
        url.includes('amazonaws.com')));
  pgPool = new Pool({
    connectionString: url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

if (!config.database.usePostgres) {
  initSqlite();
}

const pool = config.database.usePostgres
  ? pgPool
  : {
      query: (sql, params) => sqliteQueryFn(sql, params),
      end: () => Promise.resolve(),
    };

async function withTransaction(callback) {
  if (config.database.usePostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  sqliteDb.exec('BEGIN');
  try {
    const client = { query: (sql, params) => sqliteQueryFn(sql, params) };
    const result = await callback(client);
    sqliteDb.exec('COMMIT');
    return result;
  } catch (e) {
    sqliteDb.exec('ROLLBACK');
    throw e;
  }
}

async function closeDb() {
  if (config.database.usePostgres && pgPool) {
    await pgPool.end();
    return;
  }
  if (sqliteDb) sqliteDb.close();
}

const db = sqliteDb;

module.exports = {
  pool,
  db,
  isPostgres: Boolean(config.database.usePostgres),
  execPostgresScript,
  withTransaction,
  closeDb,
};
