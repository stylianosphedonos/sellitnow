const fs = require('fs');
const path = require('path');
const config = require('../config');

async function migrate() {
  const schemaFile = config.database.usePostgres ? 'schema.postgresql.sql' : 'schema.sql';
  const schemaPath = path.join(__dirname, schemaFile);
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    if (config.database.usePostgres) {
      const { pool, execPostgresScript, closeDb } = require('./db');
      await execPostgresScript(pool, schema);
      await closeDb();
      console.log('PostgreSQL migration completed successfully.');
    } else {
      const { db } = require('./db');
      db.exec(schema);
      db.close();
      console.log('SQLite migration completed successfully.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
