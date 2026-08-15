/**
 * Import Cyprus pickup stores from live courier sources (Box Now, Akis Express, ACS if configured).
 * Usage: node src/database/importPickupStores.js
 */
async function main() {
  const config = require('../config');
  const dbMod = require('./db');

  console.log(`Using ${config.database.usePostgres ? 'PostgreSQL' : 'SQLite'}`);

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
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_pickup_stores_active_order ON pickup_stores(active, display_order, city)'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_pickup_stores_provider ON pickup_stores(provider)');
  }

  const CourierPickupSyncService = require('../services/CourierPickupSyncService');
  const PickupStoreService = require('../services/PickupStoreService');

  console.log('Fetching courier pickup locations from the web…');
  const results = await CourierPickupSyncService.syncAll();

  for (const [provider, result] of Object.entries(results)) {
    if (result.skipped) {
      console.log(`- ${provider}: skipped (${result.error})`);
    } else if (!result.ok) {
      console.log(`- ${provider}: failed — ${result.error}`);
    } else {
      console.log(
        `- ${provider}: ${result.active} active (${result.inserted} new, ${result.updated} updated)`
      );
    }
  }

  const counts = await PickupStoreService.countByProvider();
  const cities = await PickupStoreService.listCities();
  const active = await PickupStoreService.listActive();
  console.log('Totals by provider:', counts);
  console.log(`Cities: ${cities.length}`);
  console.log(`Active pickup stores: ${active.length}`);

  await dbMod.closeDb();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  try {
    await require('./db').closeDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
