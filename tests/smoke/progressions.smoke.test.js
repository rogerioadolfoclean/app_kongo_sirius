const { extractCsrf, getAgentAndDb } = require('./_helper');

describe('Smoke: progressions', function() {
  this.timeout(15000);
  let agent, dbConn;
  before(async () => ({ agent, dbConn } = await getAgentAndDb()));
  after(async () => { if (dbConn) await dbConn.end(); });

  it('create -> edit -> delete progression', async () => {
    // ensure we have a user and an etape
    const username = 'prog_user_' + Date.now().toString().slice(-6);
    await dbConn.query('INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES (?, ?, ?, ?)', [username, `${username}@example.com`, 'x', 'étudiant']);
    const [[urow]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    const uid = urow.id;
    const [[erow]] = await dbConn.query('SELECT id FROM etapes_programme ORDER BY id LIMIT 1');
    const etapeId = erow ? erow.id : null;

    let res = await agent.get('/admin/progressions/creer');
    if (res.status !== 200) throw new Error('Cannot fetch progression form');
    const csrf = extractCsrf(res.text);
    res = await agent.post('/admin/progressions/creer').type('form').send({ utilisateur_id: uid, etape_id: etapeId, statut: 'en_cours', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create progression failed');
    const [[row]] = await dbConn.query('SELECT id FROM progression_etudiants WHERE utilisateur_id = ? ORDER BY date_creation DESC LIMIT 1', [uid]);
    if (!row) throw new Error('Progression not found');
    const id = row.id;

    res = await agent.get(`/admin/progressions/${id}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/progressions/${id}/modifier`).type('form').send({ statut: 'terminé', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit progression failed');
    const [[p2]] = await dbConn.query('SELECT statut FROM progression_etudiants WHERE id = ?', [id]);
    if (p2.statut !== 'terminé') throw new Error('Progression not updated');

    res = await agent.post(`/admin/progressions/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM progression_etudiants WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Progression not deleted');
  });
});
