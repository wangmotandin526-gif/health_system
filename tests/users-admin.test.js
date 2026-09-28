const request = require('supertest');
const app = require('../server');
const { createUser, createDoctor } = require('./helpers');
const db = require('../config/db');

let adminToken, adminId, patientToken, patientId;

const login = async (email, password = 'password123') =>
  request(app).post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  adminId = await createUser({ full_name: 'Boss', email: 'um-admin@example.com', password: 'password123', role: 'admin' });
  adminToken = (await login('um-admin@example.com')).body.data.token;
  patientId = await createUser({ full_name: 'Pat Ient', email: 'um-patient@example.com', password: 'password123', role: 'patient' });
  patientToken = (await login('um-patient@example.com')).body.data.token;
});

describe('GET /api/auth/users', () => {
  it('lists users to an admin without exposing password hashes', async () => {
    const res = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(res.body)).not.toMatch(/password/);
  });

  it('refuses non-admins', async () => {
    const res = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/auth/users/:id/password (admin sets a password)', () => {
  let targetId;
  beforeAll(async () => {
    targetId = await createUser({ full_name: 'Locked Out', email: 'um-locked@example.com', password: 'oldpassword1', role: 'patient' });
  });

  it('lets an admin set a new password, and the user can log in with it', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${targetId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_password: 'brandnewpass1' });
    expect(res.status).toBe(200);

    expect((await login('um-locked@example.com', 'oldpassword1')).status).toBe(401);
    expect((await login('um-locked@example.com', 'brandnewpass1')).status).toBe(200);
  });

  it('rejects a too-short password', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${targetId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_password: 'short' });
    expect(res.status).toBe(400);
  });

  it('refuses a non-admin (a patient cannot reset someone else\'s password)', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${targetId}/password`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ new_password: 'hackedpass123' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown user and for a malformed id', async () => {
    for (const id of ['doesnotexist', '..%2F..%2Fusers']) {
      const res = await request(app)
        .patch(`/api/auth/users/${id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ new_password: 'brandnewpass1' });
      expect(res.status).toBe(404);
    }
  });
});

describe('PATCH /api/auth/users/:id (admin edits a user)', () => {
  let editId;
  beforeAll(async () => {
    editId = await createUser({ full_name: 'Edit Me', email: 'um-edit@example.com', password: 'password123', role: 'patient' });
  });

  it('updates name, email and role', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${editId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Edited Name', email: 'um-edited@example.com', role: 'doctor' });
    expect(res.status).toBe(200);

    const relogin = await login('um-edited@example.com');
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.user).toMatchObject({ full_name: 'Edited Name', role: 'doctor' });
    // The old address is free again.
    expect((await login('um-edit@example.com')).status).toBe(401);
  });

  it('rejects an email that belongs to someone else', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${editId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Edited Name', email: 'um-patient@example.com' });
    expect(res.status).toBe(409);
  });

  it('will not let an admin change their own role', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Boss', email: 'um-admin@example.com', role: 'patient' });
    expect(res.status).toBe(400);
  });

  it('validates the body', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${editId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: '', email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/auth/users/:id', () => {
  it('deletes an unused account and frees the email for re-registration', async () => {
    const id = await createUser({ full_name: 'Temp', email: 'um-temp@example.com', password: 'password123', role: 'patient' });
    const del = await request(app).delete(`/api/auth/users/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const again = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Temp Again', email: 'um-temp@example.com', password: 'password123' });
    expect(again.status).toBe(201);
  });

  it('refuses to delete a user who still has appointments', async () => {
    const doctorId = await createDoctor({ name: 'Dr. Linked' });
    await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ doctor_id: doctorId, appointment_date: '2099-03-02', appointment_time: '10:00' });

    const res = await request(app).delete(`/api/auth/users/${patientId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it('will not let an admin delete their own account', async () => {
    const res = await request(app).delete(`/api/auth/users/${adminId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('Forgot / reset password flow', () => {
  it('issues a one-time token that resets the password exactly once', async () => {
    await createUser({ full_name: 'Forgetful', email: 'um-forgot@example.com', password: 'password123', role: 'patient' });

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'um-forgot@example.com' });
    expect(forgot.status).toBe(200);
    const { resetToken } = forgot.body.data;

    const reset = await request(app).post('/api/auth/reset-password').send({ token: resetToken, new_password: 'freshpassword1' });
    expect(reset.status).toBe(200);
    expect((await login('um-forgot@example.com', 'freshpassword1')).status).toBe(200);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token: resetToken, new_password: 'anotherpass123' });
    expect(reuse.status).toBe(400);
  });

  it('gives the same answer for an unknown email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeUndefined();
  });
});

describe('Passwords live in Firebase Authentication, not in Firestore', () => {
  it('stores no password (or hash) on the Firestore user profile', async () => {
    const id = await createUser({ full_name: 'No Hash', email: 'um-nohash@example.com', password: 'password123', role: 'patient' });
    const profile = await db.get('users', id);
    expect(profile).toMatchObject({ id, email: 'um-nohash@example.com', role: 'patient' });
    expect(Object.keys(profile).join(',')).not.toMatch(/pass/i);
  });

  it('uses the Firebase account uid as the profile id, so login returns that id', async () => {
    const id = await createUser({ full_name: 'Same Id', email: 'um-sameid@example.com', password: 'password123', role: 'patient' });
    const res = await login('um-sameid@example.com');
    expect(res.body.data.user.id).toBe(id);
  });

  it('lets a signed-in user change their own password (current password required)', async () => {
    await createUser({ full_name: 'Self Change', email: 'um-self@example.com', password: 'password123', role: 'patient' });
    const token = (await login('um-self@example.com')).body.data.token;

    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'not-my-password', new_password: 'updatedpass99' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'password123', new_password: 'updatedpass99' });
    expect(ok.status).toBe(200);
    expect((await login('um-self@example.com', 'updatedpass99')).status).toBe(200);
    expect((await login('um-self@example.com', 'password123')).status).toBe(401);
  });

  it('removes the Firebase login when the account is deleted', async () => {
    const id = await createUser({ full_name: 'Gone', email: 'um-gone@example.com', password: 'password123', role: 'patient' });
    await request(app).delete(`/api/auth/users/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect((await login('um-gone@example.com')).status).toBe(401);
  });
});
