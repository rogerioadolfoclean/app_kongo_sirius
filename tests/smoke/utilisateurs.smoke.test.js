const { extractCsrf, getAgentAndDb } = require('./_helper');

describe('Smoke: utilisateurs', function() {
  this.timeout(10000);
  let agent, dbConn;
  before(async () => ({ agent, dbConn } = await getAgentAndDb()));
  after(async () => { if (dbConn) await dbConn.end(); });

  it('create -> edit -> delete utilisateur', async () => {
    let res = await agent.get('/admin/utilisateurs/creer');
    if (res.status !== 200) throw new Error('Cannot fetch create form');
    const csrf = extractCsrf(res.text);
    const username = 'smoke_user_' + Date.now().toString().slice(-6);
    res = await agent.post('/admin/utilisateurs/creer').type('form').send({ nom_utilisateur: username, email: `${username}@example.com`, mot_de_passe: 'Pass1234', role: 'enseignant', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create failed');
    const [[row]] = await dbConn.query('SELECT id FROM utilisateurs WHERE nom_utilisateur = ?', [username]);
    if (!row) throw new Error('Created пользователь not found');
    const id = row.id;

    res = await agent.get(`/admin/utilisateurs/${id}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/utilisateurs/${id}/modifier`).type('form').send({ nom_utilisateur: `${username}_edited`, _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit failed');
    const [[r2]] = await dbConn.query('SELECT nom_utilisateur FROM utilisateurs WHERE id = ?', [id]);
    if (!r2.nom_utilisateur.includes('edited')) throw new Error('Edit not persisted');

    res = await agent.post(`/admin/utilisateurs/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM utilisateurs WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Delete not performed');
  });
});
