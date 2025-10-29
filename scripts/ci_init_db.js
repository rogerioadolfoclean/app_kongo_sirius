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
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Error executing database.sql:', err.message || err);
    process.exit(2);
  }
})();
