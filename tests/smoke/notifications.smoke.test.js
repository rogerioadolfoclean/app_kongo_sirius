const { extractCsrf, getAgentAndDb } = require('./_helper');

describe('Smoke: notifications', function() {
  this.timeout(10000);
  let agent, dbConn;
  before(async () => ({ agent, dbConn } = await getAgentAndDb()));
  after(async () => { if (dbConn) await dbConn.end(); });

  it('create -> mark-read -> delete notification', async () => {
    let res = await agent.get('/admin/notifications/creer');
    if (res.status !== 200) throw new Error('Cannot fetch notification form');
    const csrf = extractCsrf(res.text);
    res = await agent.post('/admin/notifications/creer').type('form').send({ utilisateur_id: '', titre: 'SmokeNotice', message: 'Hi', type: 'info', _csrf: csrf });
    if (res.status !== 302) throw new Error('Create notification failed');
    const [[row]] = await dbConn.query('SELECT id FROM notifications WHERE titre = ? ORDER BY date_creation DESC LIMIT 1', ['SmokeNotice']);
    if (!row) throw new Error('Notification not found');
    const id = row.id;

    res = await agent.post(`/admin/notifications/${id}/mark-read`).type('form').send({ _csrf: csrf });
    if (res.status !== 302) throw new Error('Mark read failed');
    const [[r2]] = await dbConn.query('SELECT est_lu FROM notifications WHERE id = ?', [id]);
    if (!r2.est_lu) throw new Error('Notification not marked as read');

    res = await agent.post(`/admin/notifications/${id}/supprimer`).type('form').send({ _csrf: csrf });
    const [after] = await dbConn.query('SELECT id FROM notifications WHERE id = ?', [id]);
    if (after.length !== 0) throw new Error('Notification not deleted');
  });
});
