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
const sorted = (text) => [...parseAvailableDays(text).days].sort();

describe('parseAvailableDays / checkAvailability', () => {
  it('understands short names, long names and ranges', () => {
    expect(sorted('Mon,Wed,Fri')).toEqual([1, 3, 5]);
    expect(sorted('Monday, Thursday')).toEqual([1, 4]);
    expect(sorted('Mon-Fri')).toEqual([1, 2, 3, 4, 5]);
    expect(sorted('tues & thurs')).toEqual([2, 4]);
  });

  it('understands "to", weekdays, weekends and daily', () => {
    expect(sorted('Monday to Friday')).toEqual([1, 2, 3, 4, 5]);
    expect(sorted('Mon - Wed')).toEqual([1, 2, 3]);
    expect(sorted('weekdays')).toEqual([1, 2, 3, 4, 5]);
    expect(sorted('Weekends')).toEqual([0, 6]);
    expect(sorted('Every day')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sorted('Fri-Mon')).toEqual([0, 1, 5, 6]); // wraps over the weekend
  });

  it('reports unrecognised tokens', () => {
    expect(parseAvailableDays('Mon,Funday').invalid).toEqual(['funday']);
  });

  it('treats blank availability as NOT bookable', () => {
    expect(checkAvailability(null, dateFor(SUN))).toMatchObject({ ok: false, reason: 'not_set' });
    expect(checkAvailability('', dateFor(SUN))).toMatchObject({ ok: false, reason: 'not_set' });
  });
});

describe('Booking only when the doctor is available', () => {
  let patientAToken, patientBToken, adminToken;
  let monWedDoctor, weekdayDoctor, anyDayDoctor, noDaysDoctor, morningDoctor;

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
    anyDayDoctor = await createDoctor({ name: 'Dr. AnyDay', available_days: 'Mon-Sun' });
    noDaysDoctor = await createDoctor({ name: 'Dr. NoDays', available_days: null });
    morningDoctor = await createDoctor({
      name: 'Dr. Morning',
      available_days: 'Mon-Fri',
      available_from: '09:00',
      available_to: '12:00',
    });
  });

  it('rejects a booking on a day the doctor does not work', async () => {
    const res = await book(patientAToken, monWedDoctor, dateFor(TUE));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available on Tuesdays/);
    expect(res.body.message).toMatch(/Mon, Wed/);
  });

  it('accepts a booking on a day the doctor works', async () => {
    expect((await book(patientAToken, monWedDoctor, dateFor(MON))).status).toBe(201);
  });

  it('supports range availability such as Mon-Fri', async () => {
    expect((await book(patientAToken, weekdayDoctor, dateFor(SAT))).status).toBe(400);
    expect((await book(patientAToken, weekdayDoctor, dateFor(WED))).status).toBe(201);
  });

  it('accepts any day for a doctor who works Mon-Sun', async () => {
    expect((await book(patientAToken, anyDayDoctor, dateFor(SUN))).status).toBe(201);
  });

  it('refuses to book a doctor who has no available days set', async () => {
    const res = await book(patientAToken, noDaysDoctor, dateFor(WED));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not set their available days/);
  });

  describe('working hours', () => {
    it('allows a time inside the hours, including the start time', async () => {
      expect((await book(patientAToken, morningDoctor, dateFor(MON, 1), '09:00')).status).toBe(201);
      expect((await book(patientBToken, morningDoctor, dateFor(MON, 1), '11:59')).status).toBe(201);
    });

    it('rejects a time before opening or at/after closing', async () => {
      for (const time of ['08:59', '12:00', '17:30']) {
        const res = await book(patientAToken, morningDoctor, dateFor(TUE), time);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/between 09:00 and 12:00/);
      }
    });

    it('checks the day before the hours', async () => {
      const res = await book(patientAToken, morningDoctor, dateFor(SAT), '10:00');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not available on Saturdays/);
    });
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

  describe('admin saving a doctor', () => {
    const post = (body) =>
      request(app).post('/api/doctors').set('Authorization', `Bearer ${adminToken}`).send(body);

    it('requires available days', async () => {
      const res = await post({ name: 'Dr. NoDays Saved' });
      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/available_days is required/);
    });

    it('rejects invalid available_days', async () => {
      const res = await post({ name: 'Dr. Typo', available_days: 'Mon,Funday' });
      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/funday/i);
    });

    it('rejects half-filled, malformed or reversed working hours', async () => {
      const base = { name: 'Dr. Hours', available_days: 'Mon-Fri' };
      expect((await post({ ...base, available_from: '09:00' })).status).toBe(400);
      expect((await post({ ...base, available_from: '9am', available_to: '5pm' })).status).toBe(400);
      expect((await post({ ...base, available_from: '17:00', available_to: '09:00' })).status).toBe(400);
    });

    it('stores valid days and hours, and exposes the weekdays as numbers', async () => {
      const res = await post({ name: 'Dr. Valid', available_days: 'Tue,Thu', available_from: '08:30', available_to: '16:00' });
      expect(res.status).toBe(201);

      const list = await request(app).get('/api/doctors').set('Authorization', `Bearer ${adminToken}`);
      expect(list.body.data.find((d) => d.name === 'Dr. Valid')).toMatchObject({
        available_days: 'Tue,Thu',
        available_weekdays: [2, 4],
        available_from: '08:30',
        available_to: '16:00',
      });
    });
  });
});
