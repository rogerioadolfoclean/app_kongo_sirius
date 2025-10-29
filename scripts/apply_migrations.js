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
  // Migration files may include vendor-specific convenience like
  // "ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..." which older MySQL
  // servers don't support. Detect those patterns and perform a safe
  // conditional ALTER via INFORMATION_SCHEMA checks, then run the
  // remaining SQL. This keeps migrations idempotent across MySQL
  // versions.
  //
  // Extract and process any "ADD COLUMN IF NOT EXISTS" statements.
  const addColumnRegex = /ALTER\s+TABLE\s+`?([\w_]+)`?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?([\w_]+)`?\s+([^;]+);/ig;
  let match;
  const toRemove = [];
  while ((match = addColumnRegex.exec(sql)) !== null) {
    const table = match[1];
    const column = match[2];
    const definition = match[3].trim();
    // Check if column exists
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [conn.config.database, table, column]
    );
    if (rows && rows[0] && rows[0].cnt === 0) {
      // Perform the ALTER TABLE to add the column
      const alterSql = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
      console.log('Applying conditional alter:', alterSql);
      await conn.query(alterSql);
    } else {
      console.log(`Skipping existing column ${table}.${column}`);
    }
    // mark this snippet for removal from the main SQL string
    toRemove.push(match[0]);
  }

  // Remove processed ADD COLUMN IF NOT EXISTS statements from the SQL
  let remainingSql = sql;
  for (const snippet of toRemove) {
    remainingSql = remainingSql.replace(snippet, '');
  }

  // Handle CREATE INDEX IF NOT EXISTS ...; some MySQL versions don't support
  // the IF NOT EXISTS clause on CREATE INDEX. Detect those statements and
  // create the index only when it doesn't already exist.
  const createIndexRegex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+`?([\w_]+)`?\s+ON\s+`?([\w_]+)`?\s*\(([^;]+?)\)\s*;/ig;
  let idxMatch;
  const indexSnippets = [];
  while ((idxMatch = createIndexRegex.exec(remainingSql)) !== null) {
    const indexName = idxMatch[1];
    const tableName = idxMatch[2];
    const columns = idxMatch[3];
    // Check INFORMATION_SCHEMA.STATISTICS for existing index
    const [idxRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [conn.config.database, tableName, indexName]
    );
    if (idxRows && idxRows[0] && idxRows[0].cnt === 0) {
      const createSql = `CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`;
      console.log('Creating index:', createSql);
      await conn.query(createSql);
    } else {
      console.log(`Skipping existing index ${tableName}.${indexName}`);
    }
    indexSnippets.push(idxMatch[0]);
  }
  for (const s of indexSnippets) remainingSql = remainingSql.replace(s, '');

  // Run any remaining SQL statements (if non-empty after trimming)
  if (remainingSql.trim()) {
    await conn.query(remainingSql);
  }
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
