const request = require('supertest');
const app = require('../server');
const { createUser } = require('./helpers');

let patientAId, patientAToken;
let patientBToken;
let doctorToken;

beforeAll(async () => {
  patientAId = await createUser({ full_name: 'Rec Patient A', email: 'rec-a@example.com', password: 'password123', role: 'patient' });
  const loginA = await request(app).post('/api/auth/login').send({ email: 'rec-a@example.com', password: 'password123' });
  patientAToken = loginA.body.data.token;

  await createUser({ full_name: 'Rec Patient B', email: 'rec-b@example.com', password: 'password123', role: 'patient' });
  const loginB = await request(app).post('/api/auth/login').send({ email: 'rec-b@example.com', password: 'password123' });
  patientBToken = loginB.body.data.token;

  await createUser({ full_name: 'Rec Doctor', email: 'rec-doc@example.com', password: 'password123', role: 'doctor' });
  const loginDoc = await request(app).post('/api/auth/login').send({ email: 'rec-doc@example.com', password: 'password123' });
  doctorToken = loginDoc.body.data.token;
});

describe('POST /api/records', () => {
  it('rejects a patient trying to create a record', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ patient_id: patientAId, diagnosis: 'Self-diagnosed flu' });
    expect(res.status).toBe(403);
  });

  it('rejects a doctor creating a record with no diagnosis or prescription', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patient_id: patientAId });
    expect(res.status).toBe(400);
  });

  it('rejects a record for a non-existent patient_id', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patient_id: 999999, diagnosis: 'Flu' });
    expect(res.status).toBe(400);
  });

  it('allows a doctor to create a record for a real patient', async () => {
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ patient_id: patientAId, diagnosis: 'Seasonal flu', prescription: 'Rest and fluids' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/records/my', () => {
  it('returns only the logged-in patient\'s own records', async () => {
    const res = await request(app).get('/api/records/my').set('Authorization', `Bearer ${patientAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((r) => r.patient_id === patientAId)).toBe(true);
  });

  it('does not let patient B see patient A\'s records via /my', async () => {
    const res = await request(app).get('/api/records/my').set('Authorization', `Bearer ${patientBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});

describe('GET /api/records/patient/:patientId', () => {
  it('rejects a patient trying to use the staff lookup route', async () => {
    const res = await request(app)
      .get(`/api/records/patient/${patientAId}`)
      .set('Authorization', `Bearer ${patientAToken}`);
    expect(res.status).toBe(403);
  });

  it('allows a doctor to view a specific patient\'s records', async () => {
    const res = await request(app)
      .get(`/api/records/patient/${patientAId}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns 404 when patientId does not belong to a real patient', async () => {
    const res = await request(app)
      .get('/api/records/patient/999999')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(404);
  });
});
