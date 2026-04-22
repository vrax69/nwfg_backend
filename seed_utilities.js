/**
 * seed_utilities.js
 * Lee el CSV de utility mapping y genera / aplica los INSERTs en nwfg_db.
 *
 * Uso:
 *   node seed_utilities.js           -- aplica directo a Docker (localhost:3306)
 *   node seed_utilities.js --dry-run -- imprime el SQL sin ejecutar
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const mysql  = require(path.resolve(__dirname, 'services/rates-service/node_modules/mysql2/promise'));

const CSV_PATH = path.resolve(
  __dirname,
  'C:\\Users\\bllanes\\OneDrive - First In Solutions SAS\\Mysql-nwfg.net\\rates_db\\Tablas\\utility mapping.csv'
);

const DRY_RUN = process.argv.includes('--dry-run');

// ── Parse CSV ─────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trimEnd())
    .filter(Boolean);

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

  return lines.slice(1).map(line => {
    // Handle quoted fields (some cells contain commas)
    const fields = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    fields.push(current.trim());

    const row = {};
    headers.forEach((h, i) => { row[h] = (fields[i] || '').trim(); });
    return row;
  }).filter(r => r.ID && r.SPL_Utility_Name && r.Standard_Utility_Name);
}

// ── Normalize service type to DB ENUM ────────────────────────────────────────
function normalizeMarket(serviceType) {
  return serviceType?.toLowerCase().startsWith('gas') ? 'Gas' : 'Electric';
}

// ── Normalize unit of measure ─────────────────────────────────────────────────
function normalizeUnit(uom) {
  const u = (uom || '').toUpperCase().trim();
  const map = { KWH: 'kWh', THERM: 'Therms', CCF: 'CCF', MCF: 'MCF' };
  return map[u] || u || 'kWh';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('📂 Leyendo CSV...');
  const rows = parseCSV(CSV_PATH);
  console.log(`   ${rows.length} filas válidas encontradas.\n`);

  // ── 1. Build unique utilities: (Standard_Utility_Name, market) → metadata ──
  // Key: "NombreCanónico||Gas" or "NombreCanónico||Electric"
  const utilMap = new Map(); // key → { nombre, market, unit, logo_url }

  for (const r of rows) {
    const market = normalizeMarket(r.Service_Type);
    const key    = `${r.Standard_Utility_Name}||${market}`;
    if (!utilMap.has(key)) {
      utilMap.set(key, {
        nombre:   r.Standard_Utility_Name,
        market,
        unit:     normalizeUnit(r.Unit_of_Measure),
        logo_url: r.Logo_URL || null,
      });
    }
  }

  console.log(`🏭 Utilities únicas (nombre + market): ${utilMap.size}`);

  // ── 2. Build aliases: SPL_Utility_Name → (Standard_Utility_Name, market) ──
  // If same dirty name maps to multiple standards, last one wins (overwrite).
  const aliasMap = new Map(); // dirty_name → key in utilMap
  for (const r of rows) {
    const market = normalizeMarket(r.Service_Type);
    const key    = `${r.Standard_Utility_Name}||${market}`;
    aliasMap.set(r.SPL_Utility_Name, key);
  }

  console.log(`🔗 Aliases únicos (dirty_name): ${aliasMap.size}\n`);

  // ── 3. Generate SQL ───────────────────────────────────────────────────────
  const utilEntries = [...utilMap.entries()]; // [ [key, {nombre, market, unit, logo_url}] ]
  const keyToIndex  = new Map();
  utilEntries.forEach(([key], idx) => keyToIndex.set(key, idx));

  if (DRY_RUN) {
    console.log('-- ============================================================');
    console.log('-- UTILITIES');
    console.log('-- ============================================================');
    for (const [, u] of utilEntries) {
      const logo = u.logo_url ? `'${u.logo_url.replace(/'/g, "''")}'` : 'NULL';
      console.log(
        `INSERT IGNORE INTO utilities (nombre, market, alias_match) VALUES ` +
        `('${u.nombre.replace(/'/g, "''")}', '${u.market}', NULL);`
      );
    }
    console.log('\n-- ============================================================');
    console.log('-- ALIASES');
    console.log('-- ============================================================');
    for (const [dirty, utilKey] of aliasMap.entries()) {
      const u = utilMap.get(utilKey);
      if (!u) continue;
      console.log(
        `INSERT INTO utility_aliases (dirty_name, utility_id) ` +
        `SELECT '${dirty.replace(/'/g, "''")}', id FROM utilities ` +
        `WHERE nombre='${u.nombre.replace(/'/g, "''")}' AND market='${u.market}' LIMIT 1 ` +
        `ON DUPLICATE KEY UPDATE utility_id = VALUES(utility_id);`
      );
    }
    return;
  }

  // ── 4. Apply to DB ────────────────────────────────────────────────────────
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306,
    user: 'root', password: 'root_password',
    database: 'nwfg_db',
    multipleStatements: true,
  });

  console.log('🔌 Conectado a nwfg_db...\n');

  // Insert utilities
  let utilInserted = 0;
  for (const [, u] of utilEntries) {
    const [res] = await conn.execute(
      'INSERT IGNORE INTO utilities (nombre, market, alias_match) VALUES (?, ?, NULL)',
      [u.nombre, u.market]
    );
    if (res.affectedRows > 0) utilInserted++;
  }
  console.log(`✅ Utilities insertadas: ${utilInserted} nuevas (de ${utilEntries.length} únicas)`);

  // Insert aliases
  let aliasInserted = 0, aliasUpdated = 0;
  for (const [dirty, utilKey] of aliasMap.entries()) {
    const u = utilMap.get(utilKey);
    if (!u) continue;

    // Get utility_id for this (nombre, market)
    const [rows2] = await conn.execute(
      'SELECT id FROM utilities WHERE nombre = ? AND market = ? LIMIT 1',
      [u.nombre, u.market]
    );
    if (!rows2.length) {
      console.warn(`  ⚠️  utility not found: "${u.nombre}" (${u.market})`);
      continue;
    }
    const utilityId = rows2[0].id;

    const [res] = await conn.execute(
      `INSERT INTO utility_aliases (dirty_name, utility_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE utility_id = VALUES(utility_id)`,
      [dirty, utilityId]
    );
    if (res.affectedRows === 1)      aliasInserted++;
    else if (res.affectedRows === 2) aliasUpdated++;
  }
  console.log(`✅ Aliases insertados: ${aliasInserted} nuevos, ${aliasUpdated} actualizados`);

  await conn.end();

  console.log('\n🎉 Seed completo. Puedes re-correr el test:');
  console.log('   node test_etl_flow.js\n');
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
