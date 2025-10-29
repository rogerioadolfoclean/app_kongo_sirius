const request = require('supertest');
const app = require('../../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html && html.match && html.match(/name=\"_csrf\" value=\"([^\"]+)\"/);
  return m ? m[1] : null;
}

async function getAgentAndDb() {
  const agent = request.agent(app);
  const dbConn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'congo_knowledge_db'
  });
  const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
  const res = await agent.post('/connexion').type('form').send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
  if (![200, 302].includes(res.status)) throw new Error('Admin login failed in smoke helper');
  return { agent, dbConn };
}

module.exports = { extractCsrf, getAgentAndDb };
