const fs = require('fs');
const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
// perform environment safety checks early
require('../lib/env_safety');

(async () => {
  const config = { ...dbConfig, multipleStatements: true };

  try {
    const sql = fs.readFileSync('database.sql', 'utf8');

    // Remove DELIMITER statements and replace $$ blocks with ; to allow execution via mysql client
    let cleaned = sql.replace(/DELIMITER\s+\$\$/g, '');
    cleaned = cleaned.replace(/DELIMITER\s+;/g, '');
    cleaned = cleaned.replace(/\$\$/g, ';');

    // Connect without specifying database initially so CREATE DATABASE works
    const conn = await mysql.createConnection(config);
    console.log('Connected to MySQL for CI DB init');

    await conn.query(cleaned);
    console.log('database.sql executed successfully');

    // Ensure a test admin user exists (idempotent). Uses a safe INSERT ... SELECT ... WHERE NOT EXISTS pattern.
    try {
      const adminEmail = 'admin@test.com';
      const adminSql = `
        INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role)
        SELECT 'admin_test', ?, '$2b$10$rQJ8P7GQOQcxJzN8zQKOReNzGH.g7vqJ8QX8wN7xFO9J2fQ8zN8.S', 'administrateur'
        FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM utilisateurs WHERE email = ?)
        LIMIT 1;
      `;
      await conn.query(adminSql, [adminEmail, adminEmail]);
      console.log('Ensured test admin user exists (if the utilisateurs table is present).');
    } catch (innerErr) {
      // don't fail CI init for admin insert problems; log and continue
      console.warn('Warning: could not ensure admin user (table may not exist yet):', innerErr.message || innerErr);
    }
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error executing database.sql:', err.message || err);
    process.exit(2);
  }
})();
