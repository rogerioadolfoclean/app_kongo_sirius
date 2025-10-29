const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin parametres_systeme CRUD', function() {
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
  after(async () => { if (dbConn) await dbConn.end(); });

  let createdId;
  it('creates, edits (partial), and deletes a parametre', async () => {
    const resForm = await agent.get('/admin/parametres/creer');
    if (resForm.status !== 200) throw new Error('Cannot fetch create param form');
    const csrf = extractCsrf(resForm.text);

    const res = await agent.post('/admin/parametres/creer').type('form').send({ cle_parametre: 'test_cle', valeur_parametre: 'v1', description: 'd1', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create param failed');

    const [[row]] = await dbConn.query('SELECT id, cle_parametre, valeur_parametre, description FROM parametres_systeme WHERE cle_parametre = ? LIMIT 1', ['test_cle']);
    if (!row) throw new Error('Parametre not found after create');
    createdId = row.id;

    // Edit: change only description, omit valeur_parametre to ensure it is preserved
    const resEditForm = await agent.get(`/admin/parametres/${createdId}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);
    const resEdit = await agent.post(`/admin/parametres/${createdId}/modifier`).type('form').send({ description: 'd2', _csrf: csrf2 });
    if (resEdit.status !== 302) throw new Error('Edit param failed');

    const [[row2]] = await dbConn.query('SELECT valeur_parametre, description FROM parametres_systeme WHERE id = ?', [createdId]);
    if (!row2) throw new Error('Parametre not found after edit');
    if (row2.valeur_parametre !== 'v1') throw new Error('valeur_parametre was not preserved');
    if (row2.description !== 'd2') throw new Error('description was not updated');

    // Delete
    const resDelForm = await agent.get(`/admin/parametres/${createdId}/modifier`);
    const csrf3 = extractCsrf(resDelForm.text);
    const resDel = await agent.post(`/admin/parametres/${createdId}/supprimer`).type('form').send({ _csrf: csrf3 });
    if (resDel.status !== 302) throw new Error('Delete param failed');
    const [rowsAfter] = await dbConn.query('SELECT id FROM parametres_systeme WHERE id = ?', [createdId]);
    if (rowsAfter.length !== 0) throw new Error('Parametre not deleted');
  });
});
