const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbPath = config.database.sqlitePath;
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// pg-compatible pool.query() - converts $1,$2 to ? and returns { rows }
// PostgreSQL params are 1-indexed: $1 = params[0], $2 = params[1], etc.
// SQLite uses positional ? - order must match appearance in SQL.
function query(sql, params = []) {
  // Convert pg syntax: ILIKE -> LIKE, COUNT(*)::int -> COUNT(*), NOW() -> datetime('now')
  let sqliteSql = sql
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/COUNT\(\*\)::int/gi, 'COUNT(*) as count')
    .replace(/\bNOW\(\)/gi, "datetime('now')");

  // Replace $1,$2,... with ? and build params in SQL appearance order
  const orderedParams = [];
  sqliteSql = sqliteSql.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10) - 1;
    if (params[idx] !== undefined) orderedParams.push(params[idx]);
    return '?';
  });

  try {
    const stmt = db.prepare(sqliteSql);
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
}

const pool = {
  query,
  end: () => { db.close(); },
};

module.exports = { pool, db };
