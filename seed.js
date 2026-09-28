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
  {
    title: 'Health screenings: what to ask your doctor at each age',
    category: 'Preventive Care',
    summary: 'A plain-language guide to routine checks and when to talk about them.',
    content:
      'Screening tests look for problems before you have symptoms. Which ones you need depends on your age, sex, family history and lifestyle, so the best first step is a conversation with your doctor.\n\nCommon topics to raise:\n- Blood pressure and cholesterol checks, usually starting in adulthood and repeated regularly.\n- Blood sugar testing if you have risk factors for diabetes.\n- Cervical, breast, bowel and prostate screening, which start at different ages depending on local guidelines.\n- Skin checks if you have many moles or a history of sunburn.\n\nWrite down your family history (parents, brothers and sisters) before you go. It often changes what is recommended.',
  },
  {
    title: 'Handwashing and everyday infection prevention',
    category: 'Preventive Care',
    summary: 'The simplest habit that prevents the most illness.',
    content:
      'Washing your hands is one of the most effective ways to stop infections spreading.\n\nWash with soap and water for at least 20 seconds: palms, backs of hands, between fingers and under nails. Do this after using the toilet, before eating or preparing food, after coughing or sneezing, and after caring for someone who is unwell. If soap and water are not available, use a hand rub containing at least 60% alcohol.\n\nOther habits help too: cough into your elbow, stay home when you are sick, keep vaccinations up to date, and clean frequently touched surfaces.',
  },
  {
    title: 'How much physical activity do adults need?',
    category: 'General Health',
    summary: 'Simple weekly targets and easy ways to reach them.',
    content:
      'Health guidelines commonly suggest adults aim for about 150 minutes of moderate activity each week (brisk walking, cycling, swimming), or 75 minutes of vigorous activity, plus muscle-strengthening exercises on two or more days.\n\nIf that sounds like a lot, start small. Ten-minute walks count, and doing a little more than yesterday is a good goal.\n\nTips: pick something you enjoy, schedule it like an appointment, use stairs when you can, and build up gradually. If you have a health condition or have been inactive for a long time, check with your doctor first.',
  },
  {
    title: 'Sleep: why it matters and how to improve it',
    category: 'Mental Wellbeing',
    summary: 'Habits that help you fall asleep and wake refreshed.',
    content:
      'Most adults need around 7 to 9 hours of sleep. Regularly sleeping less is linked with low mood, poor concentration and higher risk of long-term health problems.\n\nHelpful habits: keep a regular bedtime and wake time (even on weekends), keep the bedroom dark, cool and quiet, avoid caffeine in the afternoon and evening, and switch off screens for the last 30 to 60 minutes before bed.\n\nIf you often struggle to sleep, snore loudly, or feel exhausted despite enough hours in bed, speak with your doctor.',
  },
  {
    title: 'Protecting your skin from the sun',
    category: 'Preventive Care',
    summary: 'Simple sun-safety steps that lower your risk of skin damage.',
    content:
      'Too much ultraviolet (UV) radiation causes sunburn, premature ageing and increases the risk of skin cancer.\n\nTo protect yourself: seek shade when the sun is strongest (roughly late morning to mid-afternoon), wear a wide-brimmed hat, sunglasses and covering clothing, and apply broad-spectrum sunscreen of SPF 30 or higher to exposed skin, reapplying every two hours and after swimming.\n\nCheck your skin regularly. See a doctor promptly about any mole or spot that changes in size, shape or colour, itches, bleeds, or does not heal.',
  },
  {
    title: 'Looking after your heart',
    category: 'Chronic Conditions',
    summary: 'Everyday choices that lower the risk of heart disease.',
    content:
      'Heart disease is largely preventable. The most helpful steps are not smoking, being physically active, eating plenty of vegetables, fruit and wholegrains, limiting salt, sugary drinks and processed meats, and keeping a healthy weight.\n\nKnow your numbers: blood pressure, cholesterol and blood sugar. Regular checks let you and your doctor act early.\n\nSeek urgent help (call your local emergency number) for chest pain or pressure, pain spreading to the arm or jaw, shortness of breath, sudden weakness on one side, or difficulty speaking.',
  },
  {
    title: 'Adult vaccinations: staying protected',
    category: 'Preventive Care',
    summary: 'Immunity can fade, and some vaccines are recommended for adults.',
    content:
      'Vaccination is not just for children. Depending on your age, health and travel plans, your doctor may recommend a yearly flu vaccine, tetanus boosters, and vaccines against shingles, pneumonia, hepatitis or COVID-19.\n\nBring your vaccination record to your check-up so gaps can be found. Pregnant women and people with long-term conditions may have extra recommendations.\n\nMild soreness or a low fever after a vaccine is common. Tell your doctor about any allergies before you are vaccinated.',
  },
  {
    title: 'Dental and eye check-ups: the forgotten essentials',
    category: 'Preventive Care',
    summary: 'Regular visits catch problems that are easy to miss.',
    content:
      'Dental visits every six to twelve months (or as your dentist advises) prevent cavities and gum disease, which are linked to wider health problems. Brush twice a day with fluoride toothpaste and clean between your teeth daily.\n\nEye tests every one to two years detect changes in vision and can reveal conditions such as glaucoma or diabetes-related eye disease, often before you notice symptoms. Have your eyes checked sooner if your vision changes suddenly, or if you see flashes or floaters.',
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

  const existingTitles = new Set((await db.find('learning')).map((a) => a.title));
  const missing = DEMO_ARTICLES.filter((a) => !existingTitles.has(a.title));
  for (const a of missing) {
    await db.create('learning', { ...a, author_id: null, author_name: 'HealthSys Team' });
  }
  if (missing.length) console.log(`Seeded ${missing.length} learning article(s).`);
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
