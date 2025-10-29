const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Admin notifications CRUD', function() {
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
  it('creates a notification', async () => {
    const resForm = await agent.get('/admin/notifications/creer');
    if (resForm.status !== 200) throw new Error('Cannot fetch create notification form');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post('/admin/notifications/creer').type('form').send({ utilisateur_id: '', titre: 'E2E Note', message: 'Test message', type: 'info', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create notification failed');
    const [[row]] = await dbConn.query('SELECT id FROM notifications WHERE titre = ? ORDER BY id DESC LIMIT 1', ['E2E Note']);
    if (!row) throw new Error('Created notification not found');
    createdId = row.id;
  });

  it('marks notification as read', async () => {
    // obtain a valid CSRF token from a form route
    const resForm = await agent.get('/admin/notifications/creer');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/notifications/${createdId}/mark-read`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Mark-read failed');
    const [[row]] = await dbConn.query('SELECT est_lu FROM notifications WHERE id = ?', [createdId]);
    if (!row || !row.est_lu) throw new Error('Notification not marked read');
  });

  it('deletes the notification', async () => {
    const resForm = await agent.get('/admin/notifications/creer');
    const csrf = extractCsrf(resForm.text);
    const res = await agent.post(`/admin/notifications/${createdId}/supprimer`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Delete notification failed');
    const [rows] = await dbConn.query('SELECT id FROM notifications WHERE id = ?', [createdId]);
    if (rows.length !== 0) throw new Error('Notification not deleted');
  });
});
