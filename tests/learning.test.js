const request = require('supertest');
const app = require('../server');
const { createUser } = require('./helpers');

let patientToken, doctorToken, otherDoctorToken, adminToken;

const login = async (email) =>
  (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.data.token;

const article = (overrides = {}) => ({
  title: 'Sleep basics',
  category: 'General Health',
  summary: 'Why sleep matters',
  content: 'Aim for regular sleep and wake times.',
  ...overrides,
});

beforeAll(async () => {
  await createUser({ full_name: 'L Patient', email: 'lr-patient@example.com', password: 'password123', role: 'patient' });
  await createUser({ full_name: 'L Doctor', email: 'lr-doctor@example.com', password: 'password123', role: 'doctor' });
  await createUser({ full_name: 'L Doctor 2', email: 'lr-doctor2@example.com', password: 'password123', role: 'doctor' });
  await createUser({ full_name: 'L Admin', email: 'lr-admin@example.com', password: 'password123', role: 'admin' });
  patientToken = await login('lr-patient@example.com');
  doctorToken = await login('lr-doctor@example.com');
  otherDoctorToken = await login('lr-doctor2@example.com');
  adminToken = await login('lr-admin@example.com');
});

describe('Learning articles', () => {
  let articleId;

  it('requires login to read', async () => {
    expect((await request(app).get('/api/learning')).status).toBe(401);
  });

  it('stops patients publishing', async () => {
    const res = await request(app).post('/api/learning').set('Authorization', `Bearer ${patientToken}`).send(article());
    expect(res.status).toBe(403);
  });

  it('lets a doctor publish, and everyone read it', async () => {
    const created = await request(app).post('/api/learning').set('Authorization', `Bearer ${doctorToken}`).send(article());
    expect(created.status).toBe(201);
    articleId = created.body.data.id;

    const list = await request(app).get('/api/learning').set('Authorization', `Bearer ${patientToken}`);
    expect(list.status).toBe(200);
    const found = list.body.data.find((a) => a.id === articleId);
    expect(found).toMatchObject({ title: 'Sleep basics', author_name: 'L Doctor' });
    expect(list.body.categories).toContain('Nutrition');
  });

  it('validates the article and its category', async () => {
    const bad = await request(app)
      .post('/api/learning')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(article({ title: '', category: 'Astrology', content: '' }));
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBe(3);
  });

  it('filters by category', async () => {
    await request(app).post('/api/learning').set('Authorization', `Bearer ${doctorToken}`).send(article({ title: 'Eat well', category: 'Nutrition' }));
    const res = await request(app).get('/api/learning?category=Nutrition').set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((a) => a.category === 'Nutrition')).toBe(true);
    expect((await request(app).get('/api/learning?category=Bogus').set('Authorization', `Bearer ${patientToken}`)).status).toBe(400);
  });

  it('only lets the author or an admin delete', async () => {
    expect((await request(app).delete(`/api/learning/${articleId}`).set('Authorization', `Bearer ${patientToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/learning/${articleId}`).set('Authorization', `Bearer ${otherDoctorToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/learning/${articleId}`).set('Authorization', `Bearer ${doctorToken}`)).status).toBe(200);
    expect((await request(app).delete(`/api/learning/${articleId}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
  });
});
