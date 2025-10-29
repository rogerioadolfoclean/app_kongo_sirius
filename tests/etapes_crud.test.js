const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin etapes CRUD', function() {
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
  let createdNumero;
  it('creates an etape', async () => {
    const resForm = await agent.get('/admin/etapes/creer');
    if (resForm.status !== 200) throw new Error('Cannot fetch create etape form');
    const csrf = extractCsrf(resForm.text);
  const numero = 9999 + Math.floor(Math.random() * 1000);
    const res = await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: numero, titre: 'E2E Test Etape', description: 'desc', nom_groupe: 'G', duree_jours: 5, statut: 'actif', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create etape failed');
    const [[row]] = await dbConn.query('SELECT id FROM etapes_programme WHERE numero_etape = ?', [numero]);
    if (!row) throw new Error('Created etape not found');
    createdId = row.id;
    createdNumero = numero;
  });

  it('edits the etape', async () => {
    const resForm = await agent.get(`/admin/etapes/${createdId}/modifier`);
    const csrf = extractCsrf(resForm.text);
  const res = await agent.post(`/admin/etapes/${createdId}/modifier`).type('form').send({ numero_etape: createdNumero, titre: 'Edited Etape', description: 'updated', nom_groupe: 'GX', duree_jours: 7, statut: 'actif', _csrf: csrf });
    if (res.status !== 302) throw new Error('Edit etape failed');
    const [[row]] = await dbConn.query('SELECT titre FROM etapes_programme WHERE id = ?', [createdId]);
    if (row.titre !== 'Edited Etape') throw new Error('Etape not updated');
  });

  it('deletes the etape', async () => {
    // fetch a page that has a valid CSRF token (create form provides one)
    const resForm = await agent.get('/admin/etapes/creer');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/etapes/${createdId}/supprimer`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Delete etape failed');
    const [rows] = await dbConn.query('SELECT id FROM etapes_programme WHERE id = ?', [createdId]);
    if (rows.length !== 0) throw new Error('Etape not deleted');
  });
});
