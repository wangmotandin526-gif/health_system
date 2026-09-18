const request = require('supertest');
const app = require('../server');

describe('POST /api/auth/register', () => {
  it('registers a new patient with valid data', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Alice Patient',
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Bad Email',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Short Pass',
      email: 'short@example.com',
      password: '123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send({
      full_name: 'Dup One',
      email: 'dup@example.com',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Dup Two',
      email: 'dup@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(409);
  });

  it('ignores a client-supplied admin role and always creates a patient', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Sneaky',
      email: 'sneaky@example.com',
      password: 'password123',
      role: 'admin',
    });
    expect(res.status).toBe(201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sneaky@example.com', password: 'password123' });
    expect(login.body.data.user.role).toBe('patient');
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      full_name: 'Login Test',
      email: 'login@example.com',
      password: 'password123',
    });
  });

  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@example.com', password: 'password123' });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not registered/i);
  });
});
