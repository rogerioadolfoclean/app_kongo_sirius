/* Basic HTTP route tests using supertest + mocha */
const request = require('supertest');
const app = require('../app');

describe('Routes smoke tests', function() {
  it('GET /connexion returns 200', function(done) {
    request(app).get('/connexion').expect(200, done);
  });

  it('GET /inscription returns 200', function(done) {
    request(app).get('/inscription').expect(200, done);
  });

  it('GET /admin/utilisateurs without auth returns 403', function(done) {
    request(app).get('/admin/utilisateurs').expect(403, done);
  });
});
