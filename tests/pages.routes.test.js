const request = require('supertest');
const app = require('../app');
require('dotenv').config();

describe('Additional pages and auth-guarded routes', function() {
  this.timeout(8000);
  let agent;

  before(async () => {
    agent = request.agent(app);
    // Login as admin for guarded routes
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    await agent
      .post('/connexion')
      .type('form')
      .send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
  });

  it('GET /programme/etapes returns 200 for authenticated user', async () => {
    const res = await agent.get('/programme/etapes');
    if (res.status !== 200) throw new Error('/programme/etapes did not return 200');
  });

  it('GET /tableau-de-bord returns 200 for authenticated user', async () => {
    const res = await agent.get('/tableau-de-bord');
    if (res.status !== 200) throw new Error('/tableau-de-bord did not return 200');
  });

  it('GET /admin/activation-queue returns 200 for admin', async () => {
    const res = await agent.get('/admin/activation-queue');
    if (res.status !== 200) throw new Error('/admin/activation-queue did not return 200');
  });

  it('GET /deconnexion redirects to /connexion', async () => {
    const res = await agent.get('/deconnexion');
    if (![302, 303].includes(res.status)) throw new Error('/deconnexion did not redirect');
    // follow redirect
    const loc = res.headers.location || '';
    if (!loc.includes('/connexion')) throw new Error('/deconnexion did not redirect to /connexion');
  });
});
