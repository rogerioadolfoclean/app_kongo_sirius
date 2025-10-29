const { extractCsrf, getAgentAndDb } = require('./_helper');

describe('Smoke: inscriptions', function() {
  this.timeout(10000);
  let agent, dbConn;
  before(async () => ({ agent, dbConn } = await getAgentAndDb()));
  after(async () => { if (dbConn) await dbConn.end(); });

  it('create -> edit -> delete inscription', async () => {
    let res = await agent.get('/admin/inscriptions/creer');
    if (res.status !== 200) throw new Error('Cannot fetch inscription form');
    const csrf = extractCsrf(res.text);
    const username = 'insc_user_' + Date.now().toString().slice(-6);
    await dbConn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, `${username}@example.com`, 'x', 'étudiant']);
    const [[urow]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    const userId = urow.id;

    res = await agent.post('/admin/inscriptions/creer').type('form').send({ utilisateur_id: userId, montant: 50, devise: 'USD', statut_paiement: 'en_attente', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create inscription failed');
    const [[row]] = await dbConn.query('SELECT id FROM inscriptions WHERE utilisateur_id = ? ORDER BY date_inscription DESC LIMIT 1', [userId]);
    if (!row) throw new Error('Inscription not created');
    const id = row.id;

    res = await agent.get(`/admin/inscriptions/${id}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/inscriptions/${id}/modifier`).type('form').send({ montant: 75, statut_paiement: 'payé', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit inscription failed');
    const [[r2]] = await dbConn.query('SELECT montant, statut_paiement FROM inscriptions WHERE id = ?', [id]);
    if (Number(r2.montant) !== 75 || r2.statut_paiement !== 'payé') throw new Error('Inscription edit not persisted');

    res = await agent.post(`/admin/inscriptions/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM inscriptions WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Inscription not deleted');
  });
});
