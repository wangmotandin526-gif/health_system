const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createUser } = require('./helpers');

describe('Expired token handling', () => {
  it('rejects a token that is well-formed but expired', async () => {
    const expiredToken = jwt.sign(
      { id: 1, role: 'admin', full_name: 'Expired User' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // already expired at issue time
    );
    const res = await request(app).get('/api/doctors').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Unauthenticated access to write endpoints', () => {
  it('rejects booking an appointment with no token at all', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .send({ doctor_id: 1, appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(401);
  });

  it('rejects creating a record with no token at all', async () => {
    const res = await request(app).post('/api/records').send({ patient_id: 1, diagnosis: 'Flu' });
    expect(res.status).toBe(401);
  });
});

describe('Oversized request body', () => {
  it('rejects a JSON body larger than the configured limit', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Overflow',
        email: 'overflow@example.com',
        password: 'password123',
        // Comfortably over the 100kb express.json() limit set in server.js.
        padding: 'x'.repeat(200 * 1024),
      });
    expect(res.status).toBe(413);
  });
});

describe('SQL-injection-style input is treated as literal data', () => {
  it('does not error out or authenticate on a classic injection string in the login form', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR '1'='1", password: "' OR '1'='1" });
    // Should fail validation (not a valid email shape) or fail auth --
    // never a 500, and never a successful login.
    expect([400, 401]).toContain(res.status);
  });

  it('safely stores and returns a name containing quote characters without breaking the query', async () => {
    await createUser({ full_name: "O'Brien", email: 'obrien@example.com', password: 'password123', role: 'patient' });
    const login = await request(app).post('/api/auth/login').send({ email: 'obrien@example.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.full_name).toBe("O'Brien");
  });
});
