const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

function extractRowVersion(html) {
  const m = html.match(/name="row_version" value="?(\d+)?"?/);
  return m ? parseInt(m[1] || '0', 10) : null;
}

describe('Optimistic locking for inscriptions', function() {
  this.timeout(30000);
  let agent;
  let dbConn;

  before(async () => {
    agent = request.agent(app);
    dbConn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'congo_knowledge_db'
    });
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    await agent.post('/connexion').type('form').send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
  });

  after(async () => { if (dbConn) await dbConn.end(); });

  it('returns 409 when submitting a stale row_version for inscription', async () => {
    // ensure row_version column exists
    const dbName = process.env.DB_NAME || 'congo_knowledge_db';
    const [[colCheck]] = await dbConn.query("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inscriptions' AND COLUMN_NAME = 'row_version'", [dbName]);
    if (colCheck.cnt === 0) {
      await dbConn.execute('ALTER TABLE inscriptions ADD COLUMN row_version INT NOT NULL DEFAULT 0');
    }

    // create an inscription
    const resForm = await agent.get('/admin/inscriptions/creer');
    const csrf = extractCsrf(resForm.text);
    // pick an existing user if any
    const [[user]] = await dbConn.query('SELECT id FROM utilisateurs LIMIT 1');
    const userId = user ? user.id : null;
    const resCreate = await agent.post('/admin/inscriptions/creer').type('form').send({ utilisateur_id: userId, montant: 10, devise: 'USD', statut_paiement: 'en_attente', _csrf: csrf });
    if (![302,200].includes(resCreate.status)) throw new Error('Failed to create inscription');

    const [[row]] = await dbConn.query('SELECT id FROM inscriptions ORDER BY id DESC LIMIT 1');
    const id = row.id;

    const resEdit1 = await agent.get(`/admin/inscriptions/${id}/modifier`);
    const csrf1 = extractCsrf(resEdit1.text);
    const rv1 = extractRowVersion(resEdit1.text);
    if (rv1 === null) throw new Error('row_version not found in inscription form');

    const resUpdate1 = await agent.post(`/admin/inscriptions/${id}/modifier`).type('form').send({ montant: 20, row_version: rv1, _csrf: csrf1 });
    if (![302,200].includes(resUpdate1.status)) throw new Error('First inscription update failed: ' + resUpdate1.status);

    const resEdit2 = await agent.get(`/admin/inscriptions/${id}/modifier`);
    const csrf2 = extractCsrf(resEdit2.text);

    const resConflict = await agent.post(`/admin/inscriptions/${id}/modifier`).type('form').send({ montant: 30, row_version: rv1, _csrf: csrf2 });
    if (resConflict.status !== 409) throw new Error('Expected 409 conflict but got ' + resConflict.status);

    const [[after]] = await dbConn.query('SELECT montant FROM inscriptions WHERE id = ?', [id]);
    if (parseInt(after.montant, 10) !== 20) throw new Error('DB montant was changed by stale update');

    // cleanup
    const resDelForm = await agent.get(`/admin/inscriptions/${id}/modifier`);
    const csrf3 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/inscriptions/${id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });
});
