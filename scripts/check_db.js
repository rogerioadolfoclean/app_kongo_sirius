const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
// Safety check: warn or abort when insecure defaults used in production
require('../lib/env_safety');

(async () => {
  const config = dbConfig;

  try {
    const conn = await mysql.createConnection(config);
    console.log('Connecté à MySQL ✅');

    const [rows] = await conn.query("SHOW TABLES;");
    if (!rows || rows.length === 0) {
      console.log('Aucune table trouvée dans la base congo_knowledge_db ou la base est vide.');
    } else {
      console.log(`Tables trouvées (${rows.length}):`);
      // Different MySQL versions return different column names for SHOW TABLES, so print values
      rows.forEach((r, i) => {
        const tableName = Object.values(r)[0];
        console.log(`  ${i + 1}. ${tableName}`);
      });
    }

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('Erreur de connexion ou requête :', err.message || err);
    process.exit(2);
  }
})();