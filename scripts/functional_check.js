require('dotenv').config();
const request = require('supertest');
const app = require('../app');
require('../lib/env_safety');

(async () => {
  try {
    console.log('Starting functional HTTP checks...');
    const agent = request.agent(app);

    // Login as admin
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'password';
    let res = await agent
      .post('/connexion')
      .type('form')
      .send({ nom_utilisateur: 'admin', mot_de_passe: adminPass });
    console.log('/connexion (admin) -> status:', res.status);

    res = await agent.get('/admin/tableau-de-bord');
    console.log('/admin/tableau-de-bord -> status:', res.status);

    res = await agent.get('/admin/utilisateurs');
    console.log('/admin/utilisateurs -> status:', res.status);

    res = await agent.get('/activation-queue');
    // note: route is /admin/activation-queue; try both to be safe
    console.log('/activation-queue -> status (expected 404 or redirect):', res.status);

    res = await agent.get('/admin/activation-queue');
    console.log('/admin/activation-queue -> status:', res.status);

    // Access public pages
    res = await request(app).get('/connexion');
    console.log('GET /connexion ->', res.status);

    res = await request(app).get('/inscription');
    console.log('GET /inscription ->', res.status);

    // Try to access user dashboard as admin (should be allowed)
    res = await agent.get('/tableau-de-bord');
    console.log('/tableau-de-bord (as admin) -> status:', res.status);

    console.log('Functional HTTP checks completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Functional check failed:', err.message || err);
    process.exit(2);
  }
})();
