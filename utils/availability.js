const LONG_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayIndex(token) {
  const t = token.toLowerCase().replace(/\.$/, '');
  if (t.length < 3) return -1;
  return LONG_NAMES.findIndex((name) => name.startsWith(t));
}

function parseAvailableDays(text) {
  const days = new Set();
  const invalid = [];
  if (typeof text !== 'string') return { days, invalid };

  const tokens = text
    .toLowerCase()
    .replace(/every\s*day|all\s*days|7\s*days|daily/g, 'mon-sun')
    .replace(/week\s*days?/g, 'mon-fri')
    .replace(/week\s*ends?/g, 'sat,sun')
    .replace(/\s+(?:to|through|thru|until|till)\s+/g, '-') // "Mon to Fri" -> "Mon-Fri"
    .replace(/\s*[-–—]\s*/g, '-') // "Mon - Fri" -> "Mon-Fri"
    .split(/[,;/&+\s]+/)
    .filter((t) => t && t !== 'and');

  tokens.forEach((token) => {
    if (token.includes('-')) {
      const [from, to, ...rest] = token.split('-');
      const a = dayIndex(from);
      const b = dayIndex(to || '');
      if (a === -1 || b === -1 || rest.length) {
        invalid.push(token);
        return;
      }
      for (let d = a; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === b) break;
      }
      return;
    }
    const idx = dayIndex(token);
    if (idx === -1) invalid.push(token);
    else days.add(idx);
  });

  return { days, invalid };
}

const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

const formatDays = (days) => [...days].sort((a, b) => a - b).map((d) => SHORT_LABELS[d]).join(', ');

const weekdaysOf = (text) => [...parseAvailableDays(text).days].sort((a, b) => a - b);

function checkAvailability(availableDays, dateStr) {
  const { days } = parseAvailableDays(availableDays);
  if (days.size === 0) return { ok: false, reason: 'not_set' };
  const weekday = weekdayOf(dateStr);
  return {
    ok: days.has(weekday),
    reason: days.has(weekday) ? undefined : 'day',
    allowed: formatDays(days),
    weekday: LONG_NAMES[weekday],
  };
}

function bookingProblem(doctor, dateStr, timeStr) {
  const check = checkAvailability(doctor.available_days, dateStr);

  if (check.reason === 'not_set') {
    return `${doctor.name} has not set their available days yet, so they cannot be booked at the moment.`;
  }
  if (!check.ok) {
    const plural = `${check.weekday.charAt(0).toUpperCase()}${check.weekday.slice(1)}s`;
    return `${doctor.name} is not available on ${plural}. Available days: ${check.allowed}`;
  }

  const { available_from: from, available_to: to } = doctor;
  if (from && to && (timeStr < from || timeStr >= to)) {
    return `${doctor.name} only sees patients between ${from} and ${to}. Please choose a time in that window.`;
  }
  return null;
}

module.exports = {
  parseAvailableDays,
  checkAvailability,
  bookingProblem,
  formatDays,
  weekdayOf,
  weekdaysOf,
  LONG_NAMES,
};
