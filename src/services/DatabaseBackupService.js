const fs = require('fs');
const path = require('path');
const { pool, db: sqliteDb, isPostgres } = require('../database/db');

function splitSqlStatements(sqlText) {
  return String(sqlText || '')
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

function isSafeIdent(name) {
  return /^[A-Za-z0-9_]+$/.test(String(name));
}

function encodeValueForJson(v) {
  if (Buffer.isBuffer(v)) {
    return { __type: 'buffer', base64: v.toString('base64') };
  }
  return v;
}

function decodeValueFromJson(v) {
  if (!v || typeof v !== 'object') return v;
  if (v.__type === 'buffer' && typeof v.base64 === 'string') {
    return Buffer.from(v.base64, 'base64');
  }
  return v;
}

function getSchemaSql() {
  const schemaFile = isPostgres ? 'schema.postgresql.sql' : 'schema.sql';
  const schemaPath = path.join(__dirname, '../database', schemaFile);
  return fs.readFileSync(schemaPath, 'utf8');
}

function extractTableNamesFromSchema(schemaSql) {
  const names = new Set();
  const re = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\(/g;
  for (const m of schemaSql.matchAll(re)) names.add(m[1]);
  return [...names];
}

async function getPostgresColumns(table) {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

async function getAllTablesToBackup() {
  const schemaSql = getSchemaSql();
  return extractTableNamesFromSchema(schemaSql);
}

async function backupTable(table) {
  if (!isSafeIdent(table)) throw new Error(`Unsafe table name: ${table}`);

  if (isPostgres) {
    const columns = await getPostgresColumns(table);
    const { rows } = await pool.query(`SELECT * FROM "${table}"`);
    const encodedRows = rows.map((row) => columns.map((c) => encodeValueForJson(row[c])));
    return { columns, rows: encodedRows };
  }

  const columns = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  const { rows } = await pool.query(`SELECT * FROM "${table}"`);
  const encodedRows = rows.map((row) => columns.map((c) => encodeValueForJson(row[c])));
  return { columns, rows: encodedRows };
}

async function createFullBackup() {
  const schemaSql = getSchemaSql();
  const tables = await getAllTablesToBackup();
  const dbType = isPostgres ? 'postgres' : 'sqlite';

  const backupTables = {};
  // Sequential for reduced memory spikes during DB reads.
  for (const t of tables) {
    backupTables[t] = await backupTable(t);
  }

  return {
    app: 'sellitnow',
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    db: { type: dbType },
    schemaSql,
    tables: backupTables,
  };
}

async function execSqlStatementsOnClient(client, sqlText) {
  const stmts = splitSqlStatements(sqlText);
  for (const stmt of stmts) {
    await client.query(stmt);
  }
}

async function restorePostgresBackup(backup) {
  const { pool: pgPool } = require('../database/db');
  const client = await pgPool.connect();

  try {
    const schemaSql = typeof backup.schemaSql === 'string' ? backup.schemaSql : getSchemaSql();
    const tableNames = Object.keys(backup.tables || {});
    for (const t of tableNames) {
      if (!isSafeIdent(t)) throw new Error(`Unsafe table name in backup: ${t}`);
    }

    await client.query('BEGIN');

    for (const table of tableNames) {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    await execSqlStatementsOnClient(client, schemaSql);

    const inserted = {};
    for (const table of tableNames) {
      const meta = backup.tables[table];
      const columns = meta.columns || [];
      const rows = meta.rows || [];
      if (!Array.isArray(columns) || columns.length === 0) throw new Error(`Missing columns for ${table}`);
      if (!Array.isArray(rows)) throw new Error(`Missing rows for ${table}`);

      for (const row of rows) {
        if (!Array.isArray(row)) throw new Error(`Invalid row format for ${table}`);
        const params = row.map((v) => decodeValueFromJson(v));
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        const colList = columns.map((c) => `"${c}"`).join(',');
        const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
        await client.query(sql, params);
      }

      inserted[table] = rows.length;

      // If we inserted explicit values into SERIAL columns, bring the sequences up to date.
      const serialColsRes = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
           AND column_default LIKE 'nextval(%'`,
        [table]
      );
      for (const r of serialColsRes.rows) {
        const col = r.column_name;
        if (!isSafeIdent(col)) continue;
        const seqFixSql = `
          SELECT setval(
            pg_get_serial_sequence('${table}','${col}'),
            (SELECT COALESCE(MAX("${col}"), 0) FROM "${table}"),
            true
          )
        `;
        await client.query(seqFixSql);
      }
    }

    await client.query('COMMIT');
    return { insertedByTable: inserted };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function restoreSqliteBackup(backup) {
  if (!sqliteDb) throw new Error('SQLite database not initialized');

  const schemaSql = typeof backup.schemaSql === 'string' ? backup.schemaSql : getSchemaSql();
  const tableNames = Object.keys(backup.tables || {});
  for (const t of tableNames) {
    if (!isSafeIdent(t)) throw new Error(`Unsafe table name in backup: ${t}`);
  }

  const inserted = {};
  sqliteDb.exec('BEGIN');
  try {
    for (const table of tableNames) {
      sqliteDb.exec(`DROP TABLE IF EXISTS "${table}"`);
    }

    sqliteDb.exec(schemaSql);

    for (const table of tableNames) {
      const meta = backup.tables[table];
      const columns = meta.columns || [];
      const rows = meta.rows || [];
      if (!Array.isArray(columns) || columns.length === 0) throw new Error(`Missing columns for ${table}`);
      if (!Array.isArray(rows)) throw new Error(`Missing rows for ${table}`);

      const colList = columns.map((c) => `"${c}"`).join(',');
      const placeholders = columns.map(() => '?').join(',');
      const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
      const stmt = sqliteDb.prepare(insertSql);

      for (const row of rows) {
        if (!Array.isArray(row)) throw new Error(`Invalid row format for ${table}`);
        const params = row.map((v) => decodeValueFromJson(v));
        stmt.run(...params);
      }

      inserted[table] = rows.length;
    }

    sqliteDb.exec('COMMIT');
    return { insertedByTable: inserted };
  } catch (err) {
    try {
      sqliteDb.exec('ROLLBACK');
    } catch (_) {}
    throw err;
  }
}

async function restoreFullBackup(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('Invalid backup payload');
  if (backup.app !== 'sellitnow') throw new Error('Backup not recognized');
  const dbType = isPostgres ? 'postgres' : 'sqlite';
  if (backup.db?.type !== dbType) {
    throw new Error(`Backup type mismatch. Expected ${dbType}, got ${backup.db?.type || 'unknown'}`);
  }

  if (isPostgres) return restorePostgresBackup(backup);
  return restoreSqliteBackup(backup);
}

module.exports = {
  createFullBackup,
  restoreFullBackup,
};

