const request = require('supertest');
const app = require('../../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Smoke CRUD tests per module', function() {
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
    // login as admin
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    const res = await agent.post('/connexion').type('form').send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
    if (![200,302].includes(res.status)) throw new Error('Admin login failed in smoke tests');
  });

  after(async () => {
    if (dbConn) await dbConn.end();
  });

  it('CRUD: utilisateurs (create -> edit -> delete)', async () => {
    let res = await agent.get('/admin/utilisateurs/creer');
    if (res.status !== 200) throw new Error('Cannot fetch utilisateurs create form');
    const csrf = extractCsrf(res.text);
    const username = 'smoke_user_' + Date.now().toString().slice(-6);
    res = await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: username, email: `${username}@example.com`, mot_de_passe: 'Pass1234', role: 'enseignant', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create utilisateur failed');
    const [[row]] = await dbConn.query('SELECT id, nom_utilisateur FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    if (!row) throw new Error('Created utilisateur not found');
    const userId = row.id;

    // Edit (partial)
    res = await agent.get(`/admin/utilisateurs/${userId}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/utilisateurs/${userId}/modifier`).type('form').send({ nom_utilisateur: `${username}_edited`, _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit utilisateur failed');
    const [[row2]] = await dbConn.query('SELECT nom_utilisateur FROM utilisateurs WHERE id = ?', [userId]);
    if (row2.nom_utilisateur.indexOf('edited') === -1) throw new Error('Utilisateur edit not persisted');

    // Delete
    res = await agent.get('/admin/utilisateurs/creer');
    const csrf3 = extractCsrf(res.text);
    res = await agent.post(`/admin/utilisateurs/${userId}/supprimer`).type('form').send({ _csrf: csrf3 });
    if (res.status !== 302) throw new Error('Delete utilisateur failed');
    const [rowsAfterDel] = await dbConn.query('SELECT id FROM utilisateurs WHERE id = ?', [userId]);
    if (rowsAfterDel.length !== 0) throw new Error('Utilisateur not deleted');
  });

  it('CRUD: etapes (create -> edit -> delete)', async () => {
    let res = await agent.get('/admin/etapes/creer');
    if (res.status !== 200) throw new Error('Cannot fetch etape create form');
    const csrf = extractCsrf(res.text);
    const uniqueNum = Math.floor(Date.now() % 900000) + 1000;
    res = await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: uniqueNum, titre: `SmEtape ${uniqueNum}`, description: 'smoke', nom_groupe: 'G', duree_jours: 1, statut: 'actif', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create etape failed');
    const [[row]] = await dbConn.query('SELECT id, numero_etape FROM etapes_programme WHERE numero_etape = ?', [uniqueNum]);
    if (!row) throw new Error('Created etape not found');
    const etapeId = row.id;

    // Edit partial
    res = await agent.get(`/admin/etapes/${etapeId}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/etapes/${etapeId}/modifier`).type('form').send({ titre: 'SmEtape Edited', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit etape failed');
    const [[row2]] = await dbConn.query('SELECT titre FROM etapes_programme WHERE id = ?', [etapeId]);
    if (row2.titre !== 'SmEtape Edited') throw new Error('Etape edit not persisted');

    // Delete
    res = await agent.post(`/admin/etapes/${etapeId}/supprimer`).type('form').send({ _csrf: csrf2 });
    // delete endpoint redirects; verify absence
    const [checkDel] = await dbConn.query('SELECT id FROM etapes_programme WHERE id = ?', [etapeId]);
    if (checkDel.length !== 0) throw new Error('Etape not deleted');
  });

  it('CRUD: parametres_systeme (create -> edit -> delete)', async () => {
    let res = await agent.get('/admin/parametres/creer');
    if (res.status !== 200) throw new Error('Cannot fetch parametre create form');
    const csrf = extractCsrf(res.text);
    const key = 'smoke_param_' + Date.now().toString().slice(-6);
    res = await agent.post('/admin/parametres/creer').type('form').send({ cle_parametre: key, valeur_parametre: 'val', description: 'smoke', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create param failed');
    const [[row]] = await dbConn.query('SELECT id FROM parametres_systeme WHERE cle_parametre = ?', [key]);
    if (!row) throw new Error('Parametre not found');
    const id = row.id;

    // Edit
    res = await agent.get(`/admin/parametres/${id}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/parametres/${id}/modifier`).type('form').send({ valeur_parametre: 'newval', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit param failed');
    const [[row2]] = await dbConn.query('SELECT valeur_parametre FROM parametres_systeme WHERE id = ?', [id]);
    if (row2.valeur_parametre !== 'newval') throw new Error('Param edit not persisted');

    // Delete
    res = await agent.post(`/admin/parametres/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM parametres_systeme WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Param not deleted');
  });

  it('CRUD: inscriptions (create -> edit -> delete)', async () => {
    let res = await agent.get('/admin/inscriptions/creer');
    if (res.status !== 200) throw new Error('Cannot fetch inscription create form');
    const csrf = extractCsrf(res.text);
    // pick a user id to attach (may be null); create a lightweight user first
    const username = 'insc_user_' + Date.now().toString().slice(-6);
    await dbConn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, `${username}@example.com`, 'x', 'étudiant']);
    const [[urow]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    const userId = urow.id;

    res = await agent.post('/admin/inscriptions/creer').type('form').send({ utilisateur_id: userId, montant: 100, devise: 'USD', statut_paiement: 'en_attente', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create inscription failed');
    const [[row]] = await dbConn.query('SELECT id FROM inscriptions WHERE utilisateur_id = ? ORDER BY date_inscription DESC LIMIT 1', [userId]);
    if (!row) throw new Error('Inscription not found');
    const inscId = row.id;

    // Edit
    res = await agent.get(`/admin/inscriptions/${inscId}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/inscriptions/${inscId}/modifier`).type('form').send({ montant: 150, statut_paiement: 'payé', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit inscription failed');
    const [[row2]] = await dbConn.query('SELECT montant, statut_paiement FROM inscriptions WHERE id = ?', [inscId]);
    if (Number(row2.montant) !== 150 || row2.statut_paiement !== 'payé') throw new Error('Inscription edit not persisted');

    // Delete
    res = await agent.post(`/admin/inscriptions/${inscId}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM inscriptions WHERE id = ?', [inscId]);
    if (after.length !== 0) throw new Error('Inscription not deleted');
  });

  it('CRUD: notifications (create -> mark-read -> delete)', async () => {
    let res = await agent.get('/admin/notifications/creer');
    if (res.status !== 200) throw new Error('Cannot fetch notification create form');
    const csrf = extractCsrf(res.text);
    // create notification attached to no user
    res = await agent.post('/admin/notifications/creer').type('form').send({ utilisateur_id: '', titre: 'Smoke Notice', message: 'Hello', type: 'info', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create notification failed');
    const [[row]] = await dbConn.query('SELECT id FROM notifications WHERE titre = ? ORDER BY date_creation DESC LIMIT 1', ['Smoke Notice']);
    if (!row) throw new Error('Notification not found');
    const nid = row.id;

    // mark-read
    res = await agent.post(`/admin/notifications/${nid}/mark-read`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Mark-read failed');
    const [[nr]] = await dbConn.query('SELECT est_lu FROM notifications WHERE id = ?', [nid]);
    if (!nr.est_lu) throw new Error('Notification not marked read');

    // delete
    res = await agent.post(`/admin/notifications/${nid}/supprimer`).type('form').send({ _csrf: csrf });
    const [after] = await dbConn.query('SELECT id FROM notifications WHERE id = ?', [nid]);
    if (after.length !== 0) throw new Error('Notification not deleted');
  });

  it('CRUD: progressions (create -> edit -> delete)', async () => {
    // need user and etape
    const username = 'prog_user_' + Date.now().toString().slice(-6);
    await dbConn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, `${username}@example.com`, 'x', 'étudiant']);
    const [[urow]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    const userId = urow.id;
    const [[erow]] = await dbConn.query('SELECT id FROM etapes_programme ORDER BY id LIMIT 1');
    const etapeId = erow ? erow.id : null;

    let res = await agent.get('/admin/progressions/creer');
    if (res.status !== 200) throw new Error('Cannot fetch progression create form');
    const csrf = extractCsrf(res.text);
    res = await agent.post('/admin/progressions/creer').type('form').send({ utilisateur_id: userId, etape_id: etapeId, statut: 'en_cours', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create progression failed');
    const [[row]] = await dbConn.query('SELECT id FROM progression_etudiants WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 1', [userId]);
    if (!row) throw new Error('Progression not found');
    const pid = row.id;

    // edit (mark terminé)
    res = await agent.get(`/admin/progressions/${pid}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/progressions/${pid}/modifier`).type('form').send({ statut: 'terminé', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit progression failed');
    const [[p2]] = await dbConn.query('SELECT statut FROM progression_etudiants WHERE id = ?', [pid]);
    if (p2.statut !== 'terminé') throw new Error('Progression not updated');

    // delete
    res = await agent.post(`/admin/progressions/${pid}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM progression_etudiants WHERE id = ?', [pid]);
    if (after.length !== 0) throw new Error('Progression not deleted');
  });

  it('Exports: utilisateurs CSV download and async enqueue', async () => {
    // CSV download
    let res = await agent.get('/admin/utilisateurs/export.csv');
    if (res.status !== 200) throw new Error('CSV export failed');
    if (!res.headers['content-type'] || !res.headers['content-type'].includes('text/csv')) throw new Error('CSV content-type missing');

    // enqueue async
    res = await agent.get('/admin/utilisateurs');
    const csrf = extractCsrf(res.text);
    res = await agent.post('/admin/utilisateurs/export-async').type('form').send({ q: '', _csrf: csrf });
    if (res.status !== 200) throw new Error('Enqueue export job failed');
    const body = res.body || {};
    if (!body.jobId) throw new Error('No jobId returned');
    // check job record
    const [[jrow]] = await dbConn.query('SELECT id, status FROM export_jobs WHERE id = ?', [body.jobId]);
    if (!jrow) throw new Error('Export job not recorded');
  });

});
