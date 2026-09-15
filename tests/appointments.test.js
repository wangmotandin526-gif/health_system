const request = require('supertest');
const app = require('../server');
const { createUser, createDoctor } = require('./helpers');

let patientAToken, patientAId;
let patientBToken;
let doctorToken, doctorId;
let doctorRecordId;

beforeAll(async () => {
  patientAId = await createUser({ full_name: 'Patient A', email: 'apt-a@example.com', password: 'password123', role: 'patient' });
  const loginA = await request(app).post('/api/auth/login').send({ email: 'apt-a@example.com', password: 'password123' });
  patientAToken = loginA.body.data.token;

  await createUser({ full_name: 'Patient B', email: 'apt-b@example.com', password: 'password123', role: 'patient' });
  const loginB = await request(app).post('/api/auth/login').send({ email: 'apt-b@example.com', password: 'password123' });
  patientBToken = loginB.body.data.token;

  const doctorUserId = await createUser({ full_name: 'Dr. Owner', email: 'apt-doc@example.com', password: 'password123', role: 'doctor' });
  doctorId = await createDoctor({ name: 'Dr. Owner', user_id: doctorUserId });
  const loginDoc = await request(app).post('/api/auth/login').send({ email: 'apt-doc@example.com', password: 'password123' });
  doctorToken = loginDoc.body.data.token;
});

describe('POST /api/appointments', () => {
  it('rejects a non-patient (doctor) from booking', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid time format', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-01-01', appointment_time: '9am' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-existent doctor_id', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ doctor_id: 999999, appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(400);
  });

  it('books a valid appointment for the logged-in patient', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(201);
    doctorRecordId = res.body.data.id;
  });

  it('rejects a second patient booking the same doctor/date/time (conflict)', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientBToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/appointments/my', () => {
  it('only returns the patient\'s own appointments', async () => {
    const res = await request(app).get('/api/appointments/my').set('Authorization', `Bearer ${patientAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((a) => a.patient_id === patientAId)).toBe(true);
  });

  it('returns the doctor\'s assigned appointments', async () => {
    const res = await request(app).get('/api/appointments/my').set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((a) => a.doctor_id === doctorId)).toBe(true);
  });
});

describe('PUT /api/appointments/:id (ownership)', () => {
  it('rejects patient B from cancelling patient A\'s appointment', async () => {
    const res = await request(app)
      .put(`/api/appointments/${doctorRecordId}`)
      .set('Authorization', `Bearer ${patientBToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(403);
  });

  it('rejects patient A trying to confirm (not just cancel) their own appointment', async () => {
    const res = await request(app)
      .put(`/api/appointments/${doctorRecordId}`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });

  it('allows the assigned doctor to confirm the appointment', async () => {
    const res = await request(app)
      .put(`/api/appointments/${doctorRecordId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
  });

  it('allows patient A to cancel their own appointment', async () => {
    const res = await request(app)
      .put(`/api/appointments/${doctorRecordId}`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent appointment', async () => {
    const res = await request(app)
      .put('/api/appointments/999999')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(404);
  });
});
