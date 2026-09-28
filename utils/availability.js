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
    .replace(/\s*[-–—]\s*/g, '-') // "Mon - Fri" -> "Mon-Fri"
    .split(/[,;/&\s]+/)
    .filter((t) => t && t.toLowerCase() !== 'and');

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

function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function formatDays(days) {
  return [...days].sort((a, b) => a - b).map((d) => SHORT_LABELS[d]).join(', ');
}

function checkAvailability(availableDays, dateStr) {
  const { days } = parseAvailableDays(availableDays);
  if (days.size === 0) return { ok: true };
  const ok = days.has(weekdayOf(dateStr));
  return { ok, allowed: formatDays(days), weekday: LONG_NAMES[weekdayOf(dateStr)] };
}

module.exports = { parseAvailableDays, checkAvailability, formatDays, weekdayOf, LONG_NAMES };
