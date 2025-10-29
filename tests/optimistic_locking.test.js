const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

function extractRowVersion(html) {
  const m = html.match(/name="row_version" value="?(\d+)?"?/);
  return m ? parseInt(m[1] || '0', 10) : null;
}

describe('Optimistic locking (row_version) tests', function() {
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

  it('returns 409 when submitting a stale row_version for etape', async () => {
    // ensure row_version column exists (tests may run against DB without migrations applied)
    const dbName = process.env.DB_NAME || 'congo_knowledge_db';
    const [[colCheck]] = await dbConn.query("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'etapes_programme' AND COLUMN_NAME = 'row_version'", [dbName]);
    if (colCheck.cnt === 0) {
      await dbConn.execute('ALTER TABLE etapes_programme ADD COLUMN row_version INT NOT NULL DEFAULT 0');
    }

    // create an etape
    const resForm = await agent.get('/admin/etapes/creer');
    const csrf = extractCsrf(resForm.text);
    const numero = Math.floor(Math.random() * 10000) + 4000;
    const title = 'LOCK_ETAPE_' + Date.now();
    await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: numero, titre: title, description: 'd', nom_groupe: 'g', duree_jours: 5, statut: 'actif', _csrf: csrf });

    const [[row]] = await dbConn.query('SELECT id FROM etapes_programme WHERE numero_etape = ? LIMIT 1', [numero]);
    const id = row.id;

    // load edit form and capture csrf + row_version
    const resEdit1 = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf1 = extractCsrf(resEdit1.text);
    const rv1 = extractRowVersion(resEdit1.text);
    if (rv1 === null) throw new Error('row_version not found in form');

    // perform a successful update with current row_version
    const resUpdate1 = await agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ titre: title + '_v1', row_version: rv1, _csrf: csrf1 });
    if (![302,200].includes(resUpdate1.status)) throw new Error('First update failed: ' + resUpdate1.status);

    // attempt to apply another update but reuse the stale row_version (rv1)
    const resEdit2 = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf2 = extractCsrf(resEdit2.text);
    const rv2 = extractRowVersion(resEdit2.text);
    if (rv2 === null) throw new Error('row_version not found on second form');
    if (rv2 === rv1) {
      // still same version? that's ok; we'll craft a stale value by subtracting 1
    }

    // Use stale version (rv1) intentionally to provoke conflict
    const resConflict = await agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ titre: title + '_stale', row_version: rv1, _csrf: csrf2 });
    if (resConflict.status !== 409) throw new Error('Expected 409 conflict but got ' + resConflict.status);

    // verify DB contains the first successful title and not the stale one
    const [[after]] = await dbConn.query('SELECT titre FROM etapes_programme WHERE id = ?', [id]);
    if (after.titre !== title + '_v1') throw new Error('DB was changed by stale update');

    // cleanup
    const resDelForm = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf3 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/etapes/${id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });
});
