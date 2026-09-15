const request = require('supertest');
const app = require('../server');
const { createUser } = require('./helpers');

let adminToken, patientToken, doctorId;

beforeAll(async () => {
  await createUser({ full_name: 'Val Admin', email: 'val-admin@example.com', password: 'password123', role: 'admin' });
  const adminLogin = await request(app).post('/api/auth/login').send({ email: 'val-admin@example.com', password: 'password123' });
  adminToken = adminLogin.body.data.token;

  await createUser({ full_name: 'Val Patient', email: 'val-patient@example.com', password: 'password123', role: 'patient' });
  const patientLogin = await request(app).post('/api/auth/login').send({ email: 'val-patient@example.com', password: 'password123' });
  patientToken = patientLogin.body.data.token;

  const doctorRes = await request(app)
    .post('/api/doctors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Dr. Validation' });
  doctorId = doctorRes.body.data.id;
});

describe('POST /api/auth/register-staff validation', () => {
  it('rejects a non-admin trying to create staff accounts', async () => {
    const res = await request(app)
      .post('/api/auth/register-staff')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ full_name: 'Sneaky Doc', email: 'sneaky-doc@example.com', password: 'password123', role: 'doctor' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid role value', async () => {
    const res = await request(app)
      .post('/api/auth/register-staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Bad Role', email: 'bad-role@example.com', password: 'password123', role: 'patient' });
    expect(res.status).toBe(400);
  });

  it('allows an admin to create a doctor account with a valid role', async () => {
    const res = await request(app)
      .post('/api/auth/register-staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'New Doc', email: 'new-doc@example.com', password: 'password123', role: 'doctor' });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/doctors field-level validation', () => {
  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Bad Email', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/email/i);
  });

  it('rejects an invalid phone format', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Bad Phone', phone: 'call-me-maybe' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/phone/i);
  });
});

describe('POST /api/appointments field-level validation', () => {
  it('rejects a non-integer doctor_id', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctor_id: 'not-a-number', appointment_date: '2099-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(400);
  });

  it('rejects a date that is not a real calendar date', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-02-30', appointment_time: '09:00' });
    expect(res.status).toBe(400);
  });

  it('rejects an appointment_date in the past', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2000-01-01', appointment_time: '09:00' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/past/i);
  });
});

describe('PUT /api/appointments/:id status validation', () => {
  let appointmentId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-03-01', appointment_time: '10:00' });
    appointmentId = res.body.data.id;
  });

  it('rejects a status value outside the allowed set', async () => {
    const res = await request(app)
      .put(`/api/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/records field-level validation', () => {
  it('rejects a malformed visit_date', async () => {
    await createUser({ full_name: 'Rec Val Doc', email: 'rec-val-doc@example.com', password: 'password123', role: 'doctor' });
    const login = await request(app).post('/api/auth/login').send({ email: 'rec-val-doc@example.com', password: 'password123' });
    const docToken = login.body.data.token;

    const patientId = await createUser({ full_name: 'Rec Val Patient', email: 'rec-val-patient@example.com', password: 'password123', role: 'patient' });

    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${docToken}`)
      .send({ patient_id: patientId, diagnosis: 'Checkup', visit_date: '01/02/2099' });
    expect(res.status).toBe(400);
  });
});
