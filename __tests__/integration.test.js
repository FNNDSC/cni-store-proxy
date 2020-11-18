const request = require('supertest');
const App = require('../src/app');

describe('ChRIS_store proxy to /api/', () => {

  let app;

  beforeAll(async () => {
    app = await App();
  });

  it('can sign into ChRIS_store like normal', async () => {
    const userInfo = {
      template: {
        data: [
          { name: 'email', value: 'a12@example.com' },
          { name: 'username', value: 'alice' },
          { name: 'password', value: 'bob12345' },
        ]
      }
    };
    await request(app)
      .post('/api/v1/users/')
      .send(userInfo)
      .set('Content-Type', 'application/vnd.collection+json')
      .set('Accept', 'application/vnd.collection+json');
    
    const userLogin = {
      username: 'alice',
      password: 'bob12345'
    };
    const authRes = await request(app)
      .post('/api/v1/auth-token/')
      .send(userLogin)
      .expect(200);
    expect(authRes.body.token).toBeDefined();
  });
});
