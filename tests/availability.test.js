const request = require('supertest');
const app = require('../server');
const { createUser, createDoctor } = require('./helpers');
const { parseAvailableDays, checkAvailability } = require('../utils/availability');

function dateFor(weekday, weeksAhead = 0) {
  const d = new Date(Date.UTC(2099, 0, 1));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + weeksAhead * 7);
  return d.toISOString().slice(0, 10);
}
const [SUN, MON, TUE, WED, THU, FRI, SAT] = [0, 1, 2, 3, 4, 5, 6];

describe('parseAvailableDays / checkAvailability', () => {
  it('understands short names, long names and ranges', () => {
    expect([...parseAvailableDays('Mon,Wed,Fri').days].sort()).toEqual([1, 3, 5]);
    expect([...parseAvailableDays('Monday, Thursday').days].sort()).toEqual([1, 4]);
    expect([...parseAvailableDays('Mon-Fri').days].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...parseAvailableDays('tues & thurs').days].sort()).toEqual([2, 4]);
  });

  it('reports unrecognised tokens', () => {
    expect(parseAvailableDays('Mon,Funday').invalid).toEqual(['Funday']);
  });

  it('treats blank availability as unrestricted', () => {
    expect(checkAvailability(null, dateFor(SUN)).ok).toBe(true);
    expect(checkAvailability('', dateFor(SUN)).ok).toBe(true);
  });
});

describe('Booking only on the days a doctor works', () => {
  let patientAToken, patientBToken, adminToken;
  let monWedDoctor, weekdayDoctor, anyDayDoctor;

  const book = (token, doctor_id, appointment_date, appointment_time = '09:00') =>
    request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ doctor_id, appointment_date, appointment_time });

  const login = async (email) =>
    (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.data.token;

  beforeAll(async () => {
    await createUser({ full_name: 'Avail A', email: 'avail-a@example.com', password: 'password123', role: 'patient' });
    await createUser({ full_name: 'Avail B', email: 'avail-b@example.com', password: 'password123', role: 'patient' });
    await createUser({ full_name: 'Avail Admin', email: 'avail-admin@example.com', password: 'password123', role: 'admin' });
    patientAToken = await login('avail-a@example.com');
    patientBToken = await login('avail-b@example.com');
    adminToken = await login('avail-admin@example.com');

    monWedDoctor = await createDoctor({ name: 'Dr. MonWed', available_days: 'Mon,Wed' });
    weekdayDoctor = await createDoctor({ name: 'Dr. Weekday', available_days: 'Mon-Fri' });
    anyDayDoctor = await createDoctor({ name: 'Dr. AnyDay' });
  });

  it('rejects a booking on a day the doctor does not work', async () => {
    const res = await book(patientAToken, monWedDoctor, dateFor(TUE));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available on Tuesdays/);
    expect(res.body.message).toMatch(/Mon, Wed/);
  });

  it('accepts a booking on a day the doctor works', async () => {
    const res = await book(patientAToken, monWedDoctor, dateFor(MON));
    expect(res.status).toBe(201);
  });

  it('supports range availability such as Mon-Fri', async () => {
    expect((await book(patientAToken, weekdayDoctor, dateFor(SAT))).status).toBe(400);
    expect((await book(patientAToken, weekdayDoctor, dateFor(WED))).status).toBe(201);
  });

  it('does not restrict a doctor with no availability recorded', async () => {
    expect((await book(patientAToken, anyDayDoctor, dateFor(SUN))).status).toBe(201);
  });

  it('frees the slot again when the appointment is cancelled', async () => {
    const date = dateFor(FRI, 1);
    const first = await book(patientAToken, weekdayDoctor, date, '11:00');
    expect(first.status).toBe(201);
    expect((await book(patientBToken, weekdayDoctor, date, '11:00')).status).toBe(409);

    await request(app)
      .put(`/api/appointments/${first.body.data.id}`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ status: 'cancelled' });

    expect((await book(patientBToken, weekdayDoctor, date, '11:00')).status).toBe(201);
  });

  it('stops a patient double-booking themselves at the same time with two doctors', async () => {
    const date = dateFor(THU, 2);
    expect((await book(patientAToken, weekdayDoctor, date, '14:00')).status).toBe(201);
    const res = await book(patientAToken, anyDayDoctor, date, '14:00');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/You already have/);
  });

  it('rejects invalid available_days when an admin saves a doctor', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Typo', available_days: 'Mon,Funday' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/Funday/);
  });

  it('accepts and stores valid available_days from an admin', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr. Valid', available_days: 'Tue,Thu' });
    expect(res.status).toBe(201);

    const list = await request(app).get('/api/doctors').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data.find((d) => d.name === 'Dr. Valid').available_days).toBe('Tue,Thu');
  });
});
