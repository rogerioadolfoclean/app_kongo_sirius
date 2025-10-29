const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Record one inscription', function() {
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
    // login as admin
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    const res = await agent.post('/connexion').type('form').send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
    if (![200,302].includes(res.status)) throw new Error('Admin login failed');
  });

  after(async () => {
    if (dbConn) await dbConn.end();
  });

  it('creates a single inscription via admin UI and verifies database record', async () => {
    // Ensure a user exists to attach the inscription
    const username = 'single_insc_user_' + Date.now().toString().slice(-6);
    await dbConn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, `${username}@example.com`, 'x', 'étudiant']);
    const [[urow]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    const userId = urow.id;

    // Fetch the create form to obtain CSRF
    let res = await agent.get('/admin/inscriptions/creer');
    if (res.status !== 200) throw new Error('Could not fetch inscription create form');
    const csrf = extractCsrf(res.text);

    // Submit the create form
    res = await agent.post('/admin/inscriptions/creer')
      .type('form')
      .send({ utilisateur_id: userId, montant: 123.45, devise: 'EUR', statut_paiement: 'en_attente', _csrf: csrf });

    if (res.status !== 302) throw new Error('Create inscription POST failed with status ' + res.status);

    // Verify the record exists
    const [[inscRow]] = await dbConn.query('SELECT id, utilisateur_id, montant, devise, statut_paiement FROM inscriptions WHERE utilisateur_id = ? ORDER BY date_inscription DESC LIMIT 1', [userId]);
    if (!inscRow) throw new Error('Inscription not found in DB after create');
    if (Number(inscRow.montant) !== 123.45 || inscRow.devise !== 'EUR' || inscRow.statut_paiement !== 'en_attente') {
      throw new Error('Inscription data does not match expected values');
    }
  });
});
