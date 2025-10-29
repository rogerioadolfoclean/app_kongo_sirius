const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin inscriptions CRUD', function() {
  this.timeout(10000);
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

  after(async () => {
    if (dbConn) await dbConn.end();
  });

  let createdId;
  it('creates an inscription', async () => {
    const resForm = await agent.get('/admin/inscriptions/creer');
    if (resForm.status !== 200) throw new Error('Cannot fetch create inscription form');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post('/admin/inscriptions/creer').type('form').send({ utilisateur_id: '', montant: 10.50, devise: 'USD', statut_paiement: 'en_attente', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create inscription failed');
    const [[row]] = await dbConn.query('SELECT id FROM inscriptions WHERE montant = ? ORDER BY id DESC LIMIT 1', [10.50]);
    if (!row) throw new Error('Created inscription not found');
    createdId = row.id;
  });

  it('edits the inscription', async () => {
    const resForm = await agent.get(`/admin/inscriptions/${createdId}/modifier`);
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/inscriptions/${createdId}/modifier`).type('form').send({ utilisateur_id: '', montant: 12.75, devise: 'USD', statut_paiement: 'payé', _csrf: csrf });
    if (res.status !== 302) throw new Error('Edit inscription failed');
    const [[row]] = await dbConn.query('SELECT montant, statut_paiement FROM inscriptions WHERE id = ?', [createdId]);
    if (row.montant != 12.75 || row.statut_paiement !== 'payé') throw new Error('Inscription not updated');
  });

  it('deletes the inscription', async () => {
    const resForm = await agent.get('/admin/inscriptions/creer');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/inscriptions/${createdId}/supprimer`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Delete inscription failed');
    const [rows] = await dbConn.query('SELECT id FROM inscriptions WHERE id = ?', [createdId]);
    if (rows.length !== 0) throw new Error('Inscription not deleted');
  });
});
