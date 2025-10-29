const { execFile } = require('child_process');
const mysql = require('mysql2/promise');
const assert = require('assert');

describe('Payment → Activation full flow', function () {
  this.timeout(20000);

  let config;
  before(async () => {
    require('dotenv').config();
    config = {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      // avoid embedding default DB passwords in repo; prefer environment
      // variables or CI secrets. Local setups can set DB_PASSWORD to '' if needed.
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'congo_knowledge_db',
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10)
    };

    // Ensure deep_test user exists (create or ignore)
    const conn = await mysql.createConnection(config);
    const [rows] = await conn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', ['deep_test']);
    if (rows.length === 0) {
      await conn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', ['deep_test', 'deep_test@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'étudiant']);
    }
    await conn.end();
  });

  it('should run simulate_payment, mark complete, process queue and activate next step', async () => {
    // Ensure there is no leftover progression for the test user so the
    // simulate_payment script runs idempotently in CI/local runs.
    const cleanupConn = await mysql.createConnection(config);
    const [uRows] = await cleanupConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', ['deep_test']);
    if (uRows.length) {
      await cleanupConn.query('DELETE FROM progression_etudiants WHERE utilisateur_id = ?', [uRows[0].id]);
    }
    await cleanupConn.end();

    // run simulate_payment.js
    await new Promise((resolve, reject) => {
      execFile(process.execPath, ['scripts/simulate_payment.js'], { env: process.env }, (err, stdout, stderr) => {
        if (err) return reject(new Error('simulate_payment failed: ' + (stderr || err.message)));
        // console.log(stdout);
        resolve();
      });
    });

    // run test_mark_complete_trigger to mark the current progression as terminé (it will enqueue activation job)
    await new Promise((resolve, reject) => {
      execFile(process.execPath, ['scripts/test_mark_complete_trigger.js'], { env: process.env }, (err, stdout, stderr) => {
        if (err) return reject(new Error('mark_complete failed: ' + (stderr || err.message)));
        resolve();
      });
    });

    // process the queue (calls stored procedure activer_etape_suivante)
    await new Promise((resolve, reject) => {
      execFile(process.execPath, ['scripts/process_queue.js', '10'], { env: process.env }, (err, stdout, stderr) => {
        if (err) return reject(new Error('process_queue failed: ' + (stderr || err.message)));
        resolve();
      });
    });

    // verify that progression for step 2 exists for deep_test and is en_cours or terminé
    const conn = await mysql.createConnection(config);
    const [[user]] = await conn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', ['deep_test']);
    assert(user && user.id, 'deep_test user must exist');

    // get step 2 id
    const [etape2] = await conn.query('SELECT id FROM etapes_programme WHERE numero_etape = 2 LIMIT 1');
    assert(etape2.length === 1, 'etape 2 must exist');
    const etape2Id = etape2[0].id;

    const [progs] = await conn.query('SELECT * FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ? LIMIT 1', [user.id, etape2Id]);
    await conn.end();

    assert(progs.length === 1, 'Progression for step 2 should have been created');
    const prog = progs[0];
    assert(['en_cours', 'terminé'].includes(prog.statut), 'Progression statut should be en_cours or terminé');
  });
});
