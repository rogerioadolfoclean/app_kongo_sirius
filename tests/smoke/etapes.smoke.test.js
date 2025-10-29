const { extractCsrf, getAgentAndDb } = require('./_helper');

describe('Smoke: etapes', function() {
  this.timeout(10000);
  let agent, dbConn;
  before(async () => ({ agent, dbConn } = await getAgentAndDb()));
  after(async () => { if (dbConn) await dbConn.end(); });

  it('create -> edit -> delete etape', async () => {
    let res = await agent.get('/admin/etapes/creer');
    if (res.status !== 200) throw new Error('Cannot fetch etape form');
    const csrf = extractCsrf(res.text);
    const uniqueNum = Math.floor(Date.now() % 900000) + 1000;
    res = await agent.post('/admin/etapes/creer').type('form').send({ numero_etape: uniqueNum, titre: `SmokeEt ${uniqueNum}`, description: 's', nom_groupe: 'G', duree_jours: 1, statut: 'actif', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create etape failed');
    const [[row]] = await dbConn.query('SELECT id FROM etapes_programme WHERE numero_etape = ?', [uniqueNum]);
    if (!row) throw new Error('Etape not found');
    const id = row.id;

    res = await agent.get(`/admin/etapes/${id}/modifier`);
    const csrf2 = extractCsrf(res.text);
    res = await agent.post(`/admin/etapes/${id}/modifier`).type('form').send({ titre: 'Smoke Edited', _csrf: csrf2 });
    if (res.status !== 302) throw new Error('Edit etape failed');
    const [[r2]] = await dbConn.query('SELECT titre FROM etapes_programme WHERE id = ?', [id]);
    if (r2.titre !== 'Smoke Edited') throw new Error('Edit not persisted');

    res = await agent.post(`/admin/etapes/${id}/supprimer`).type('form').send({ _csrf: csrf2 });
    const [after] = await dbConn.query('SELECT id FROM etapes_programme WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Etape not deleted');
  });
});
