const request = require('supertest');
const app = require('../app');
const mysql = require('mysql2/promise');
require('dotenv').config();

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

describe('Partial update preserves existing values', function() {
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

  it('utilisateur update should preserve nom_utilisateur and email when omitted', async () => {
    const resCreateForm = await agent.get('/admin/utilisateurs/creer');
    const csrf = extractCsrf(resCreateForm.text);
    const username = 'pu_user_' + Date.now();
    await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: username, email: username + '@test', mot_de_passe: 'secret123', role: 'étudiant', _csrf: csrf });

    const [[row]] = await dbConn.query('SELECT id, nom_utilisateur, email FROM utilisateurs WHERE nom_utilisateur = ? LIMIT 1', [username]);
    if (!row) throw new Error('Created user not found');
    const id = row.id;

    const resEditForm = await agent.get(`/admin/utilisateurs/${id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);

    // Send only statut change, omit nom_utilisateur and email
    const resEdit = await agent.post(`/admin/utilisateurs/${id}/modifier`).type('form').send({ statut: 'inactif', _csrf: csrf2 });
    if (resEdit.status !== 302) throw new Error('Utilisateur partial update failed');

    const [[row2]] = await dbConn.query('SELECT nom_utilisateur, email, statut FROM utilisateurs WHERE id = ?', [id]);
    if (row2.nom_utilisateur !== username) throw new Error('nom_utilisateur changed unexpectedly');
    if (row2.email !== username + '@test') throw new Error('email changed unexpectedly');
    if (row2.statut !== 'inactif') throw new Error('statut was not updated');

    // cleanup
    const resDelForm = await agent.get(`/admin/utilisateurs/${id}/modifier`);
    const csrf3 = extractCsrf(resDelForm.text);
    await agent.post(`/admin/utilisateurs/${id}/supprimer`).type('form').send({ _csrf: csrf3 });
  });

  it('etape update should preserve titre when omitted', async () => {
    const resForm = await agent.get('/admin/etapes/creer');
    const csrf = extractCsrf(resForm.text);
    const numero = Math.floor(Math.random() * 10000) + 1000;
    const title = 'PU_TITLE_' + Date.now();
    await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: numero, titre: title, description: 'd1', nom_groupe: 'g1', duree_jours: 10, statut: 'actif', _csrf: csrf });

    const [[row]] = await dbConn.query('SELECT id, titre FROM etapes_programme WHERE numero_etape = ? LIMIT 1', [numero]);
    if (!row) throw new Error('Created etape not found');
    const id = row.id;

    const resEditForm = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);

    // Update only duree_jours, omit titre
    const resEdit = await agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ duree_jours: 20, _csrf: csrf2 });
    if (resEdit.status !== 302) throw new Error('Etape partial update failed');

    const [[row2]] = await dbConn.query('SELECT titre, duree_jours FROM etapes_programme WHERE id = ?', [id]);
    if (row2.titre !== title) throw new Error('titre changed unexpectedly');
    if (parseInt(row2.duree_jours, 10) !== 20) throw new Error('duree_jours was not updated');

    // cleanup
    await agent.post(`/admin/etapes/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
  });

  it('inscription update should preserve montant when omitted', async () => {
    const resForm = await agent.get('/admin/inscriptions/creer');
    const csrf = extractCsrf(resForm.text);
    const montant = 123.45;
    const resCreate = await agent.post('/admin/inscriptions/creer').type('form').send({ utilisateur_id: '', montant: montant, devise: 'USD', statut_paiement: 'en_attente', _csrf: csrf });
    if (resCreate.status !== 302) throw new Error('Create inscription failed');

    const [[row]] = await dbConn.query('SELECT id, montant FROM inscriptions WHERE montant = ? LIMIT 1', [montant]);
    if (!row) throw new Error('Created inscription not found');
    const id = row.id;

    const resEditForm = await agent.get(`/admin/inscriptions/${id}/modifier`);
    const csrf2 = extractCsrf(resEditForm.text);

    // Update only statut_paiement, omit montant
    const resEdit = await agent.post(`/admin/inscriptions/${id}/modifier`).type('form').send({ statut_paiement: 'payé', _csrf: csrf2 });
    if (resEdit.status !== 302) throw new Error('Inscription partial update failed');

    const [[row2]] = await dbConn.query('SELECT montant, statut_paiement FROM inscriptions WHERE id = ?', [id]);
    if (parseFloat(row2.montant) !== montant) throw new Error('montant changed unexpectedly');
    if (row2.statut_paiement !== 'payé') throw new Error('statut_paiement was not updated');

    // cleanup
    await agent.post(`/admin/inscriptions/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
  });
});
