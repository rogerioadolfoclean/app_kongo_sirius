const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Utilisateurs export PDF', function() {
  this.timeout(20000);
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

  it('exports PDF with expected content-type and non-empty body', async () => {
    const username = 'pdf_user_' + Date.now();

    // create a user to ensure content
    const resForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(resForm.text);
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: username, email: username + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

    // fetch PDF; parse as binary buffer
    const res = await agent.get('/admin/utilisateurs/export.pdf').buffer(true).parse(function(res, callback){
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(data)));
    });

    if (!/application\/pdf/.test(res.headers['content-type'])) throw new Error('Expected PDF content-type');
    if (!res.body || !Buffer.isBuffer(res.body) || res.body.length < 100) throw new Error('PDF body appears empty or too small');

    // cleanup
    const [[row]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [username]);
    const resDelForm = await agent.get(`/admin/utilisateurs/${row.id}/modifier`);
    const csrf2 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/utilisateurs/${row.id}/supprimer`).type('form').send({ _csrf: csrf2 });
  });
});
