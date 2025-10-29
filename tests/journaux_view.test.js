const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

describe('Admin journaux viewer', function() {
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

  it('shows a recently inserted journaux_systeme row', async () => {
    // insert a journal entry
    await dbConn.execute('INSERT INTO journaux_systeme (utilisateur_id, action, nom_table) VALUES (?, ?, ?)', [null, 'TEST_ACTION_X', 'tests']);

    const res = await agent.get('/admin/journaux');
    if (res.status !== 200) throw new Error('Cannot fetch journaux page');
    if (!res.text.includes('TEST_ACTION_X')) throw new Error('Inserted journaux entry not shown in UI');

    // cleanup
    await dbConn.execute("DELETE FROM journaux_systeme WHERE action = ?", ['TEST_ACTION_X']);
  });
});
