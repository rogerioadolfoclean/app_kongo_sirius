const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin progression_etudiants CRUD', function() {
  this.timeout(15000);
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
  it('creates a progression for etape 1', async () => {
    // ensure etape 1 exists and pick a user
    const [[etape]] = await dbConn.query('SELECT id FROM etapes_programme WHERE numero_etape = 1 LIMIT 1');
    const [[user]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', ['deep_test']);
    const userId = user ? user.id : (await dbConn.query('SELECT id FROM utilisateurs LIMIT 1'))[0][0].id;
    const etapeId = etape ? etape.id : (await dbConn.query('SELECT id FROM etapes_programme LIMIT 1'))[0][0].id;

    const resForm = await agent.get('/admin/progressions/creer');
    if (resForm.status !== 200) throw new Error('Cannot fetch create progression form');
    const csrf = extractCsrf(resForm.text);

    // cleanup any existing progression for this user+etape (idempotent)
    await dbConn.query('DELETE FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ?', [userId, etapeId]);

    const res = await agent.post('/admin/progressions/creer').type('form').send({ utilisateur_id: userId, etape_id: etapeId, statut: 'en_cours', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create progression failed');
    const [[row]] = await dbConn.query('SELECT id FROM progression_etudiants WHERE utilisateur_id = ? AND etape_id = ? LIMIT 1', [userId, etapeId]);
    if (!row) throw new Error('Created progression not found');
    createdId = row.id;
  });

  it('edits the progression (mark terminé)', async () => {
    const resForm = await agent.get(`/admin/progressions/${createdId}/modifier`);
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/progressions/${createdId}/modifier`).type('form').send({ statut: 'terminé', _csrf: csrf });
    if (res.status !== 302) throw new Error('Edit progression failed');
    const [[row]] = await dbConn.query('SELECT statut FROM progression_etudiants WHERE id = ?', [createdId]);
    if (!row || row.statut !== 'terminé') throw new Error('Progression not updated to terminé');
  });

  it('deletes the progression', async () => {
    const resForm = await agent.get('/admin/progressions/creer');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/progressions/${createdId}/supprimer`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Delete progression failed');
    const [rows] = await dbConn.query('SELECT id FROM progression_etudiants WHERE id = ?', [createdId]);
    if (rows.length !== 0) throw new Error('Progression not deleted');
  });
});
