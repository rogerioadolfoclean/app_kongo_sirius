const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Concurrent and invalid update tests', function() {
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

  it('applies concurrent partial updates to utilisateur without losing fields', async () => {
    const resForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(resForm.text);
    const username = 'concur_user_' + Date.now();
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: username, email: username + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

    const [[row]] = await dbConn.query('SELECT id, nom_utilisateur, email, statut FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [username]);
    const id = row.id;

    const resEditForm = await agent.get(`/admin/utilisateurs/${id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);

    const p1 = agent.post(`/admin/utilisateurs/${id}/modifier`).type('form').send({ statut: 'inactif', _csrf: csrf2 });
    const p2 = agent.post(`/admin/utilisateurs/${id}/modifier`).type('form').send({ nom_utilisateur: username + '_edited', _csrf: csrf2 });

    // run concurrently
    const results = await Promise.all([p1, p2]);
    // Expect both to have responded (redirects or errors)
    results.forEach(r => { if (![302,200].includes(r.status)) throw new Error('One concurrent update failed with status ' + r.status); });

    const [[after]] = await dbConn.query('SELECT nom_utilisateur, email, statut FROM utilisateurs WHERE id = ?', [id]);
    if (after.nom_utilisateur !== username + '_edited') throw new Error('nom_utilisateur was not updated by concurrent edit');
    if (after.email !== username + '@test') throw new Error('email was unexpectedly changed by concurrent edit');
    if (after.statut !== 'inactif') throw new Error('statut was not updated by concurrent edit');

    // cleanup
    const resDelForm = await agent.get(`/admin/utilisateurs/${id}/modifier`);
    const csrf3 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/utilisateurs/${id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });

  it('applies concurrent partial updates to etape without losing fields', async () => {
    const resForm = await agent.get('/admin/etapes/creer');
    const csrf = extractCsrf(resForm.text);
    const numero = Math.floor(Math.random() * 10000) + 2000;
    const title = 'CONCUR_ETAPE_' + Date.now();
    await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: numero, titre: title, description: 'd', nom_groupe: 'g', duree_jours: 5, statut: 'actif', _csrf: csrf });

    const [[row]] = await dbConn.query('SELECT id, titre, duree_jours FROM etapes_programme WHERE numero_etape = ? LIMIT 1', [numero]);
    const id = row.id;

    const resEditForm = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);

    const p1 = agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ duree_jours: 10, _csrf: csrf2 });
    const p2 = agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ titre: title + '_X', _csrf: csrf2 });
    const results = await Promise.all([p1, p2]);
    results.forEach(r => { if (![302,200].includes(r.status)) throw new Error('One concurrent etape update failed with status ' + r.status); });

    const [[after]] = await dbConn.query('SELECT titre, duree_jours FROM etapes_programme WHERE id = ?', [id]);
    if (after.titre !== title + '_X') throw new Error('titre was not updated');
    if (parseInt(after.duree_jours,10) !== 10) throw new Error('duree_jours was not updated');

    // cleanup
    await agent.post(`/admin/etapes/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
  });

  it('rejects invalid duplicate numero_etape and leaves original unchanged', async () => {
    // create two etapes
    const resForm = await agent.get('/admin/etapes/creer');
    const csrf = extractCsrf(resForm.text);
    const n1 = Math.floor(Math.random() * 10000) + 3000;
    const n2 = n1 + 1;
    await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: n1, titre: 'DUP1', description: '', nom_groupe: '', duree_jours: 5, statut: 'actif', _csrf: csrf });
    await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: n2, titre: 'DUP2', description: '', nom_groupe: '', duree_jours: 5, statut: 'actif', _csrf: csrf });

    const [[e1]] = await dbConn.query('SELECT id, numero_etape FROM etapes_programme WHERE numero_etape = ? LIMIT 1', [n1]);
    const [[e2]] = await dbConn.query('SELECT id, numero_etape FROM etapes_programme WHERE numero_etape = ? LIMIT 1', [n2]);

    // attempt to update e1 to n2 (duplicate)
    const resEditForm = await agent.get(`/admin/etapes/${e1.id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);
    const res = await agent.post(`/admin/etapes/${e1.id}/modifier`).type('form').send({ numero_etape: n2, _csrf: csrf2 });

    // Expect failure (duplicate key) — server should return 500 and original unchanged
    if (res.status === 200 || res.status === 302) throw new Error('Expected duplicate update to fail but it did not');

    const [[after1]] = await dbConn.query('SELECT numero_etape FROM etapes_programme WHERE id = ?', [e1.id]);
    if (after1.numero_etape !== n1) throw new Error('numero_etape was changed despite duplicate attempt');

    // cleanup
    const resDelForm1 = await agent.get(`/admin/etapes/${e1.id}/modifier`);
    const csrf3 = extractCsrf(resDelForm1.text);
    await agent.post(`/admin/etapes/${e1.id}/supprimer`).type('form').send({ _csrf: csrf3 });
    const resDelForm2 = await agent.get(`/admin/etapes/${e2.id}/modifier`);
    const csrf4 = extractCsrf(resDelForm2.text);
    await agent.post(`/admin/etapes/${e2.id}/supprimer`).type('form').send({ _csrf: csrf4 });
  });
});
