#!/usr/bin/env node
/**
 * Test bootstrap: run migrations and ensure a test admin exists.
 * This script is idempotent and safe to run repeatedly in CI or locally.
 */
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
require('dotenv').config();

async function ensureAdmin() {
  const adminUser = process.env.TEST_ADMIN_USERNAME || 'admin';
  const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';

  const conn = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
  });

  try {
    // create table if missing is handled by migrations; check for existing admin
    const [rows] = await conn.execute('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [adminUser]);
    if (rows.length === 0) {
      // Insert a simple admin with known password hash using bcryptjs
      const bcrypt = require('bcryptjs');
      const passHash = await bcrypt.hash(adminPass, 8);
      await conn.execute('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role, statut) VALUES (?, ?, ?, ?, ?)', [adminUser, 'admin@example.test', passHash, 'administrateur', 'actif']);
      console.log('Inserted test admin:', adminUser);
    } else {
      console.log('Test admin already exists:', adminUser);
    }
  } finally {
    await conn.end();
  }
}

function runMigrations() {
  console.log('Running migrations...');
  execSync('node scripts/apply_migrations.js', { stdio: 'inherit' });
}

(async function main(){
  try {
    runMigrations();
    await ensureAdmin();
    console.log('Test bootstrap complete.');
    process.exit(0);
  } catch (err) {
    console.error('Test bootstrap failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
