const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin end-to-end flow', function() {
  this.timeout(10000);
  let agent;
  let dbConn;
  before(async () => {
    agent = request.agent(app);
    dbConn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      // Do not embed default DB passwords in source. Use environment
      // variables for secrets. For local setups with empty password,
      // leave DB_PASSWORD unset or set to an empty string.
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'congo_knowledge_db'
    });
  });

  after(async () => {
    if (dbConn) await dbConn.end();
  });

  it('logs in as admin', async () => {
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    const res = await agent
      .post('/connexion')
      .type('form')
      .send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
    if (![302, 200].includes(res.status)) throw new Error('Admin login failed with status ' + res.status);
  });

  let createdUserId;
  it('creates a user via admin UI', async () => {
    let res = await agent.get('/admin/utilisateurs/creer');
    if (res.status !== 200) throw new Error('Cannot fetch create form');
    const csrf = extractCsrf(res.text);
    const username = 'e2e_test_' + Date.now().toString().slice(-6);
    res = await agent.post('/admin/utilisateurs/creer')
      .type('form')
      .send({ nom_utilisateur: username, email: `${username}@example.com`, mot_de_passe: 'Test12345', role: 'enseignant', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create user post failed');
    const [[row]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    if (!row) throw new Error('Created user not found in DB');
    createdUserId = row.id;
  });

  it('edits the created user', async () => {
    let res = await agent.get(`/admin/utilisateurs/${createdUserId}/modifier`);
    const csrf = extractCsrf(res.text);
    res = await agent.post(`/admin/utilisateurs/${createdUserId}/modifier`)
      .type('form')
      .send({ nom_utilisateur: 'edited_name', email: 'edited@example.com', role: 'enseignant', statut: 'actif', _csrf: csrf });
    if (res.status !== 302) throw new Error('Edit user failed');
    const [[row]] = await dbConn.query('SELECT nom_utilisateur, email FROM utilisateurs WHERE id = ?', [createdUserId]);
    if (row.nom_utilisateur !== 'edited_name') throw new Error('User not updated');
  });

  it('creates a failed activation job and retries via admin UI', async () => {
    const [resInsert] = await dbConn.query('INSERT INTO activation_queue (utilisateur_id, source_etape_id, status) VALUES (?, ?, ?)', [createdUserId, 1, 'failed']);
    const jobId = resInsert.insertId;
    let res = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(res.text);
    res = await agent.post(`/admin/activation-queue/${jobId}/retry`) .type('form') .send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Retry request failed');
    const [[jobRow]] = await dbConn.query('SELECT status FROM activation_queue WHERE id = ?', [jobId]);
    if (jobRow.status !== 'pending') throw new Error('Job not set to pending');
  });

  it('deletes the created user', async () => {
    let res = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(res.text);
    res = await agent.post(`/admin/utilisateurs/${createdUserId}/supprimer`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Delete failed');
    const [rows] = await dbConn.query('SELECT id FROM utilisateurs WHERE id = ?', [createdUserId]);
    if (rows.length !== 0) throw new Error('User not deleted from DB');
  });
});
