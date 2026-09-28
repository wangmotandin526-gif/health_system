require('dotenv').config();
const db = require('./config/db');

const DEMO_DOCTORS = [
  { name: 'Dr. Sarah Smith', specialty: 'Cardiology', email: 'sarah.smith@healthsys.test', phone: '0400111222', available_days: 'Mon,Wed,Fri', available_from: '09:00', available_to: '17:00' },
  { name: 'Dr. James Lee', specialty: 'General Practice', email: 'james.lee@healthsys.test', phone: '0400333444', available_days: 'Tue,Thu', available_from: '09:00', available_to: '17:00' },
  { name: 'Dr. Amina Yusuf', specialty: 'Paediatrics', email: 'amina.yusuf@healthsys.test', phone: '0400555666', available_days: 'Mon,Tue,Wed', available_from: '08:00', available_to: '16:00' },
];

const DEMO_ARTICLES = [
  {
    title: 'Why hydration matters every day',
    category: 'General Health',
    summary: 'Water supports energy, concentration and kidney function. Here is how to build the habit.',
    content:
      'Your body relies on water for nearly every process, from regulating temperature to carrying nutrients around.\n\nMost adults do well aiming for pale-yellow urine through the day rather than a fixed number of glasses. Needs go up in hot weather, during exercise, and when you are unwell.\n\nSimple habits help: keep a bottle within reach, drink a glass with each meal, and choose water over sugary drinks. If you have a heart or kidney condition, ask your doctor how much fluid is right for you.',
  },
  {
    title: 'Building a balanced plate',
    category: 'Nutrition',
    summary: 'A quick visual guide to portioning vegetables, protein and wholegrains.',
    content:
      'A balanced plate does not need to be complicated. As a rough guide, fill about half your plate with vegetables and fruit, a quarter with lean protein (fish, eggs, legumes, chicken), and a quarter with wholegrains such as brown rice or oats.\n\nAdd a small amount of healthy fat, like olive oil or nuts, and limit heavily processed foods, sugary drinks and excess salt.\n\nSmall swaps add up: wholemeal bread instead of white, fruit instead of dessert most days, and cooking at home more often.',
  },
  {
    title: 'Simple ways to manage everyday stress',
    category: 'Mental Wellbeing',
    summary: 'Short, practical techniques you can use in a few minutes.',
    content:
      'Stress is a normal response, but staying stressed for long periods takes a toll on sleep, mood and physical health.\n\nTry slow breathing (in for four seconds, out for six) for a few minutes, take a short walk outdoors, and keep regular sleep and meal times. Talking with a friend or family member also helps.\n\nIf worries feel overwhelming or last for weeks, speak with your doctor. Support is available and asking for it is a strength.',
  },
  {
    title: 'Living well with high blood pressure',
    category: 'Chronic Conditions',
    summary: 'Lifestyle habits that support healthy blood pressure alongside medical care.',
    content:
      'High blood pressure often has no symptoms, which is why regular checks matter.\n\nHabits that help include eating less salt, staying physically active most days, keeping a healthy weight, limiting alcohol, and not smoking. Take any prescribed medication exactly as directed, even when you feel fine.\n\nKeep a record of your readings and bring it to appointments so your doctor can adjust your plan.',
  },
  {
    title: 'Keeping childhood vaccinations on schedule',
    category: 'Child Health',
    summary: 'Why routine immunisation protects children and the wider community.',
    content:
      'Vaccines train the immune system to recognise serious diseases before a child is ever exposed to them. Following the recommended schedule gives protection at the ages when children are most vulnerable.\n\nKeep your child\'s vaccination record somewhere safe and bring it to check-ups. If a dose is missed, you can usually catch up rather than starting again; ask your doctor or clinic.\n\nMild soreness or a low fever after a vaccine is common and usually settles within a day or two.',
  },
  {
    title: 'Why regular health check-ups are worth it',
    category: 'Preventive Care',
    summary: 'Catching problems early makes them easier to treat.',
    content:
      'Many conditions, including high blood pressure, diabetes and some cancers, can develop quietly. Routine check-ups and recommended screening tests can find them early, when treatment is often simpler and more effective.\n\nAsk your doctor which checks suit your age, family history and lifestyle, and book them in advance. Keep your appointment history handy in the Records page of this system.',
  },
];

async function ensureSeedData() {
  const existingDoctors = await db.find('doctors');
  if (existingDoctors.length > 0) {
    console.log(`Skipping doctor seed: ${existingDoctors.length} doctor(s) already in the database.`);
  } else {
    for (const d of DEMO_DOCTORS) {
      await db.create('doctors', { ...d, photo_url: null, user_id: null });
    }
    console.log(`Seeded ${DEMO_DOCTORS.length} doctors.`);
  }

  const existingArticles = await db.find('articles');
  if (existingArticles.length === 0) {
    for (const a of DEMO_ARTICLES) {
      await db.create('articles', { ...a, author_id: null, author_name: 'HealthSys Team' });
    }
    console.log(`Seeded ${DEMO_ARTICLES.length} learning articles.`);
  }
}

module.exports = ensureSeedData;
module.exports.DEMO_DOCTORS = DEMO_DOCTORS;

if (require.main === module) {
  ensureSeedData()
    .then(() => db.close())
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
