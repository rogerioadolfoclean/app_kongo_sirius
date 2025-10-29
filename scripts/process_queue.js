const mysql = require('mysql2/promise');
const { dbConfig } = require('../lib/config');
// Environment safety checks (warn in dev, fail in production)
require('../lib/env_safety');

async function processJobs(limit = 10) {
  require('dotenv').config();
  const config = dbConfig;

  let conn;
  try {
    conn = await mysql.createConnection(config);
    const [jobs] = await conn.query("SELECT * FROM activation_queue WHERE status = 'pending' ORDER BY date_creation LIMIT ?", [limit]);
    if (jobs.length === 0) {
      console.log('Aucun job en attente.');
      await conn.end();
      return;
    }

    for (const job of jobs) {
      console.log('Processing job', job.id, 'user', job.utilisateur_id, 'etape', job.source_etape_id);
      try {
        // mark processing
        await conn.query('UPDATE activation_queue SET status = ?, tentatives = tentatives + 1 WHERE id = ?', ['processing', job.id]);

        // Call stored procedure to activate next step
        await conn.query('CALL activer_etape_suivante(?, ?)', [job.utilisateur_id, job.source_etape_id]);

        // mark done
        await conn.query('UPDATE activation_queue SET status = ?, result_message = ? WHERE id = ?', ['done', 'activated', job.id]);
        console.log('Job processed successfully', job.id);
      } catch (err) {
        console.error('Error processing job', job.id, err.message || err);
        await conn.query('UPDATE activation_queue SET status = ?, result_message = ? WHERE id = ?', ['failed', (err.message || '').substring(0, 200), job.id]);
      }
    }

    await conn.end();
  } catch (err) {
    console.error('Erreur process_queue:', err.message || err);
    if (conn) await conn.end();
    process.exit(2);
  }
}

if (require.main === module) {
  const limit = parseInt(process.argv[2] || '10', 10);
  processJobs(limit).then(() => process.exit(0));
}

module.exports = { processJobs };