const request = require('supertest');
const app = require('../server');
const { createUser } = require('./helpers');

let patientToken;
let adminToken;

beforeAll(async () => {
  await createUser({ full_name: 'Patient One', email: 'doc-patient@example.com', password: 'password123', role: 'patient' });
  const patientLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'doc-patient@example.com', password: 'password123' });
  patientToken = patientLogin.body.data.token;

  await createUser({ full_name: 'Admin One', email: 'doc-admin@example.com', password: 'password123', role: 'admin' });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'doc-admin@example.com', password: 'password123' });
  adminToken = adminLogin.body.data.token;
});

describe('GET /api/doctors', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/doctors');
    expect(res.status).toBe(401);
  });

  it('allows any authenticated user to list doctors', async () => {
    const res = await request(app).get('/api/doctors').set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Authentication middleware (invalid/malformed tokens)', () => {
  it('rejects a well-formed but invalid/tampered JWT', async () => {
    const res = await request(app)
      .get('/api/doctors')
      .set('Authorization', 'Bearer this.is.not-a-valid-jwt');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('rejects an Authorization header that is not a Bearer token', async () => {
    const res = await request(app).get('/api/doctors').set('Authorization', 'garbage-header-value');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/doctors', () => {
  it('rejects a patient trying to add a doctor', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ name: 'Dr. Nope' });
    expect(res.status).toBe(403);
  });

  it('rejects a request missing the required name field', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ specialty: 'Cardiology' });
    expect(res.status).toBe(400);
  });

  it('allows an admin to add a doctor', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Test', specialty: 'Cardiology', email: 'dr.test@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
  });
});

describe('PUT /api/doctors/:id', () => {
  let doctorId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Update Me', specialty: 'General' });
    doctorId = res.body.data.id;
  });

  it('rejects a non-admin from updating a doctor', async () => {
    const res = await request(app)
      .put(`/api/doctors/${doctorId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ name: 'Hacked Name' });
    expect(res.status).toBe(403);
  });

  it('allows an admin to update a doctor', async () => {
    const res = await request(app)
      .put(`/api/doctors/${doctorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Updated', specialty: 'Neurology' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when updating a non-existent doctor', async () => {
    const res = await request(app)
      .put('/api/doctors/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ghost Doctor' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/doctors/:id', () => {
  let doctorId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Delete Me' });
    doctorId = res.body.data.id;
  });

  it('rejects a non-admin from deleting a doctor', async () => {
    const res = await request(app)
      .delete(`/api/doctors/${doctorId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
  });

  it('allows an admin to delete a doctor', async () => {
    const res = await request(app)
      .delete(`/api/doctors/${doctorId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when deleting a non-existent doctor', async () => {
    const res = await request(app)
      .delete('/api/doctors/999999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
