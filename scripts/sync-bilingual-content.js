#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../src/database/db');
const { syncAllBilingualContent } = require('../src/lib/bilingualSync');

async function main() {
  console.log('Syncing bilingual catalog content (EN ↔ EL)…');
  const stats = await syncAllBilingualContent(pool);
  console.log(`Updated ${stats.products} product(s), ${stats.categories} categor(ies), ${stats.hero} hero block(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
