const request = require('supertest');
const app = require('../src/app');

describe('Health endpoints', () => {
  it('returns liveness information', async () => {
    const { body } = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(body.success).toBe(true);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'ok',
      })
    );
  });

  it('returns readiness information', async () => {
    const { body } = await request(app)
      .get('/health/ready')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(body.success).toBe(true);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'ok',
      })
    );
  });
});
