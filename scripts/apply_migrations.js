#!/usr/bin/env node
// Apply SQL migration files from ./migrations in lexical order.
// Records applied migrations in migrations__applied table.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');

async function ensureMigrationsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS migrations__applied (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
}

async function getApplied(conn) {
  const [rows] = await conn.execute('SELECT filename FROM migrations__applied ORDER BY filename');
  return new Set(rows.map(r => r.filename));
}

async function applyMigration(conn, sql, filename) {
  console.log('Applying', filename);
  // run each statement; use conn.query which can accept multiple statements if enabled
  // We'll run the whole file as one query; migration files should have safe statements.
  await conn.query(sql);
  await conn.execute('INSERT INTO migrations__applied (filename) VALUES (?)', [filename]);
}

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('No migrations directory found at', migrationsDir);
    process.exit(1);
  }

  const pool = mysql.createPool({
    ...dbConfig,
    multipleStatements: true
  });

  const conn = await pool.getConnection();
  try {
    await ensureMigrationsTable(conn);
    const applied = await getApplied(conn);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log('Skipping already applied migration', file);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await applyMigration(conn, sql, file);
      console.log('Applied', file);
    }
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}
