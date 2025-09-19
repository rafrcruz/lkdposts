const request = require('supertest');
const app = require('../src/app');

describe('Hello endpoint', () => {
  it('returns the hello mundo message wrapped in the standard envelope', async () => {
    const response = await request(app)
      .get('/api/v1/hello')
      .set('Origin', 'http://localhost:5173')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ message: 'hello mundo' }),
      })
    );
  });
});
