/**
 * Import ACS Cyprus network locations from Excel.
 * Usage:
 *   node src/database/importAcsExcel.js
 *   node src/database/importAcsExcel.js /path/to/acs-network-locations.xlsx
 */
async function main() {
  const path = require('path');
  const fs = require('fs');
  const config = require('../config');
  const dbMod = require('./db');
  const { resolveDefaultAcsExcelPath } = require('../lib/xlsxSimple');

  const filePath = path.resolve(process.argv[2] || resolveDefaultAcsExcelPath());
  if (!fs.existsSync(filePath)) {
    throw new Error(`ACS Excel not found: ${filePath}`);
  }

  console.log(`Using ${config.database.usePostgres ? 'PostgreSQL' : 'SQLite'}`);
  console.log(`Importing ACS shops from ${filePath}`);

  if (config.database.usePostgres) {
    const { runPostgresMigrations } = require('./postgresMigrations');
    await runPostgresMigrations(dbMod.pool);
  } else {
    const db = dbMod.db;
    db.exec(`CREATE TABLE IF NOT EXISTS pickup_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      provider TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT,
      name TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'CY',
      phone TEXT,
      hours TEXT,
      lat REAL,
      lng REAL,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    const cols = db.prepare('PRAGMA table_info(pickup_stores)').all().map((c) => c.name);
    if (!cols.includes('provider')) {
      db.exec("ALTER TABLE pickup_stores ADD COLUMN provider TEXT NOT NULL DEFAULT 'manual'");
    }
    if (!cols.includes('external_id')) {
      db.exec('ALTER TABLE pickup_stores ADD COLUMN external_id TEXT');
    }
    if (!cols.includes('lat')) db.exec('ALTER TABLE pickup_stores ADD COLUMN lat REAL');
    if (!cols.includes('lng')) db.exec('ALTER TABLE pickup_stores ADD COLUMN lng REAL');
  }

  const CourierPickupSyncService = require('../services/CourierPickupSyncService');
  const PickupStoreService = require('../services/PickupStoreService');

  const result = await CourierPickupSyncService.syncAcsFromExcel(filePath);
  if (!result.ok) {
    throw new Error(result.error || 'ACS Excel import failed');
  }

  console.log(
    `ACS: ${result.active} active (${result.inserted} new, ${result.updated} updated) from Excel`
  );
  console.log('Totals by provider:', await PickupStoreService.countByProvider());
  console.log('Cities:', await PickupStoreService.listCities());

  await dbMod.closeDb();
}

main().catch(async (err) => {
  console.error('ACS import failed:', err.message || err);
  try {
    await require('./db').closeDb();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
