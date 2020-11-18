const request = require('supertest');
const app = require('../app');

describe('ChRIS_store proxy to /api/', () => {
  it('should forward to the ChRIS_store', async () => {
    request(app())
  });
});
