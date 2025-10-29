const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Utilisateurs export CSV and search/pagination', function() {
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

  it('exports CSV with expected headers and rows', async () => {
    const usernameA = 'csv_user_a_' + Date.now();
    const usernameB = 'csv_user_b_' + Date.now();

    // create two users
    const resForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(resForm.text);
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: usernameA, email: usernameA + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: usernameB, email: usernameB + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

  // request CSV
  const resCsv = await agent.get('/admin/utilisateurs/export.csv');
  if (!/text\/csv/.test(resCsv.headers['content-type'])) throw new Error('Expected CSV content-type');
  const body = resCsv.text;
  // Validate header order
  if (!/^id,nom_utilisateur,email,role,statut,date_creation/m.test(body)) throw new Error('CSV header missing or out of order');
  // Validate presence of created users' lines
  if (!body.includes(usernameA) || !body.includes(usernameB)) throw new Error('CSV did not include created users');

    // cleanup
    const [[rowA]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [usernameA]);
    const [[rowB]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [usernameB]);
    const resDelForm = await agent.get(`/admin/utilisateurs/${rowA.id}/modifier`);
    const csrf2 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/utilisateurs/${rowA.id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const resDelForm2 = await agent.get(`/admin/utilisateurs/${rowB.id}/modifier`);
    const csrf3 = extractCsrf(resDelForm2.text);
    await agent.post(`/admin/utilisateurs/${rowB.id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });

  it('supports search and pagination on listing', async () => {
    const uniq = 'search_user_' + Date.now();
    const resForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(resForm.text);
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: uniq + '_1', email: uniq + '_1@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: uniq + '_2', email: uniq + '_2@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

    // ask for per_page=1 and q=uniq, should return one of them
  const resList = await agent.get('/admin/utilisateurs').query({ q: uniq, per_page: 1, page: 1 });
  if (resList.status !== 200) throw new Error('Unexpected status for list: ' + resList.status);
  if (!resList.text.includes(uniq + '_1') && !resList.text.includes(uniq + '_2')) throw new Error('Search results did not include expected user');
  // Ensure pagination links include q and per_page
  if (!resList.text.includes('per_page=1') || !resList.text.includes('q=' + encodeURIComponent(uniq))) throw new Error('Pagination links did not preserve query or per_page');

    // cleanup
    const [[r1]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [uniq + '_1']);
    const [[r2]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [uniq + '_2']);
    const resDelForm = await agent.get(`/admin/utilisateurs/${r1.id}/modifier`);
    const csrf2 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/utilisateurs/${r1.id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const resDelForm2 = await agent.get(`/admin/utilisateurs/${r2.id}/modifier`);
    const csrf3 = extractCsrf(resDelForm2.text);
    await agent.post(`/admin/utilisateurs/${r2.id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });
});
