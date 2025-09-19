const request = require('supertest');
const app = require('../src/app');

describe('Hello endpoint', () => {
  it('requires authentication to access the message', async () => {
    const response = await request(app)
      .get('/api/v1/hello')
      .set('Origin', 'http://localhost:5173')
      .expect('Content-Type', /json/)
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'UNAUTHENTICATED',
        }),
      })
    );
  });
});
