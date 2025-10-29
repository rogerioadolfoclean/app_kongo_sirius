const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { processExportJobs } = require('../scripts/process_exports');
require('dotenv').config();

describe('Async export jobs for utilisateurs', function() {
  this.timeout(60000);
  let agent;
  let dbConn;

  before(async () => {
    // ensure migrations are applied so export_jobs table exists
    const { execSync } = require('child_process');
    try {
      execSync('node scripts/apply_migrations.js', { stdio: 'inherit' });
    } catch (e) {
      // continue; tests will fail later if migrations not applied
      console.warn('Migration runner reported an error (continuing):', e.message || e);
    }
    agent = request.agent(app);
    dbConn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'congo_knowledge_db'
    });
    // Ensure export_jobs table exists for tests (some environments may not run migrations)
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS export_jobs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        q VARCHAR(255) DEFAULT NULL,
        params TEXT DEFAULT NULL,
        file_path VARCHAR(1024) DEFAULT NULL,
        result_message VARCHAR(255) DEFAULT NULL,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    await agent.post('/connexion').type('form').send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
  });

  after(async () => { if (dbConn) await dbConn.end(); });

  it('enqueues an export job and produces a CSV file when worker runs', async () => {
    const uniq = 'async_user_' + Date.now();
    const resForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = (resForm.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: uniq, email: uniq + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

    // enqueue
    const enqueue = await agent.post('/admin/utilisateurs/export-async').type('form').send({ q: uniq, _csrf: csrf });
    if (enqueue.status !== 200) throw new Error('Failed to enqueue export job');
    const jobId = enqueue.body.jobId;
    if (!jobId) throw new Error('No jobId returned');

    // run worker
    const results = await processExportJobs(5);
    const found = results.find(r => r.id === jobId && r.status === 'done');
    if (!found) throw new Error('Worker did not mark job done: ' + JSON.stringify(results));

    // check file
    const filePath = found.file_path;
    if (!fs.existsSync(filePath)) throw new Error('Export file not found: ' + filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(uniq)) throw new Error('Export file did not include expected user');

    // cleanup DB and file
    const [[row]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [uniq]);
    const resDelForm = await agent.get(`/admin/utilisateurs/${row.id}/modifier`);
    const csrf2 = (resDelForm.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await agent.post(`/admin/utilisateurs/${row.id}/supprimer`).type('form').send({ _csrf: csrf2 });
    fs.unlinkSync(filePath);
  });
});
