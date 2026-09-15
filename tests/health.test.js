const request = require('supertest');
const app = require('../server');

describe('GET /health', () => {
  it('reports ok status for use by a process manager / uptime check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});

describe('Unknown routes', () => {
  it('returns a consistent 404 shape for a route that does not exist', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
