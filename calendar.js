// Concordant Reckoning, taken from Cruise's Fantasy Calendar export.
// Time is stored everywhere as one number: minutes since midnight, day 1 of year 1.

export const CAL = {
  name: 'Concordant Reckoning',
  era: 'CR',
  weekdays: ['Sunstead', 'Silverday', 'Redmark', 'Earthen', 'Tidesend', 'Ashrest', 'Ravenfall'],
  months: [
    { name: 'Ashenveil', length: 30 },
    { name: 'Kindling', length: 30 },
    { name: 'Bloomtide', length: 30 },
    { name: 'Greenmarch', length: 30 },
    { name: 'Wildmarch', length: 30 },
    { name: 'Solantide', length: 30 },
    { name: 'The Convergence', length: 5 },
    { name: 'Emberhigh', length: 30 },
    { name: 'Goldenwane', length: 30 },
    { name: 'Turning', length: 30 },
    { name: 'Dimfall', length: 30 },
    { name: 'Frostwatch', length: 30 },
    { name: 'Deepwatch', length: 30 },
  ],
  moons: [
    { name: 'Selune', cycle: 29, shift: 0, color: '#f4f1e8' },
    { name: 'Ruidus', cycle: 20, shift: 0, color: '#d8432f' },
  ],
  // Fixed-date events (month index is 0-based).
  events: [
    { name: 'Spring Equinox', month: 2, day: 15, kind: 'astro' },
    { name: 'Summer Solstice', month: 5, day: 15, kind: 'astro' },
    { name: 'Autumn Equinox', month: 9, day: 15, kind: 'astro' },
    { name: 'Winter Solstice', month: 12, day: 15, kind: 'astro' },
    { name: 'The Long Hunt', month: 4, day: 21, days: 3, kind: 'holiday',
      description: 'Origin: Faerûn (Rangers of the North) / Exandria (Zephrah traditions). Three days. A solemn ceremony in which rangers, druids, and wilderness guardians trace their patrol routes at a ceremonial pace, stopping at landmarks to perform brief rituals of acknowledgement. Not a hunt for prey but a declaration of stewardship.' },
  ],
};

export const DAY = 1440;
const offsets = [];
let acc = 0;
for (const m of CAL.months) { offsets.push(acc); acc += m.length; }
export const YEAR_DAYS = acc; // 365

export function monthOffset(m) { return offsets[m]; }

// Day number since day 1 of year 1 (this matches Fantasy Calendar's "epoch").
export function epochOf(year, month, day) {
  return (year - 1) * YEAR_DAYS + offsets[month] + (day - 1);
}

export function toMinutes({ year, month, day, hour = 0, minute = 0 }) {
  return epochOf(year, month, day) * DAY + hour * 60 + minute;
}

export function fromMinutes(t) {
  const epoch = Math.floor(t / DAY);
  let mins = t - epoch * DAY;
  const year = Math.floor(epoch / YEAR_DAYS) + 1;
  let doy = epoch - (year - 1) * YEAR_DAYS;
  let month = 0;
  while (month < CAL.months.length - 1 && doy >= offsets[month + 1]) month++;
  const day = doy - offsets[month] + 1;
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  return { year, month, day, hour, minute, epoch, doy, weekday: weekdayOf(epoch) };
}

// Fantasy Calendar: first_day = 1 and weeks overflow across months, so day 1 of year 1 is Sunstead.
export function weekdayOf(epoch) { return ((epoch % 7) + 7) % 7; }

export function moonPhase(moon, epoch) {
  const pos = (epoch - moon.shift) / moon.cycle;
  const frac = pos - Math.floor(pos); // 0 = new, 0.5 = full
  const names = ['New', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const idx = Math.round(frac * 8) % 8;
  return { frac, name: names[idx], day: Math.floor(frac * moon.cycle) + 1 };
}

export function seasonOf(month, day) {
  const d = offsets[month] + day; // 1-based day of year
  const springEq = offsets[2] + 15, summerSol = offsets[5] + 15, autumnEq = offsets[9] + 15, winterSol = offsets[12] + 15;
  if (d >= springEq && d < summerSol) return 'Spring';
  if (d >= summerSol && d < autumnEq) return 'Summer';
  if (d >= autumnEq && d < winterSol) return 'Autumn';
  return 'Winter';
}

export function eventsOn(month, day) {
  return CAL.events.filter(e => e.month === month && day >= e.day && day < e.day + (e.days || 1))
    .map(e => (e.days > 1 ? { ...e, label: `${e.name} (day ${day - e.day + 1} of ${e.days})` } : { ...e, label: e.name }));
}

export function ordinalDay(n) { return String(n); }

export function fmtTime(t) {
  const d = fromMinutes(t);
  const h12 = d.hour % 12 === 0 ? 12 : d.hour % 12;
  return `${h12}:${String(d.minute).padStart(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}`;
}

export function fmtDate(t, { weekday = true, year = true } = {}) {
  const d = fromMinutes(t);
  const parts = [];
  if (weekday) parts.push(CAL.weekdays[d.weekday] + ',');
  parts.push(`${d.day} ${CAL.months[d.month].name}`);
  if (year) parts.push(`${d.year} ${CAL.era}`);
  return parts.join(' ');
}

export function fmtDateTime(t) { return `${fmtDate(t)} · ${fmtTime(t)}`; }

export function fmtShort(t) {
  const d = fromMinutes(t);
  return `${d.day} ${CAL.months[d.month].name} ${d.year}`;
}

// "3 weeks, 2 days" style span.
export function fmtSpan(mins) {
  const neg = mins < 0; mins = Math.abs(mins);
  const days = Math.floor(mins / DAY), rem = mins % DAY;
  const w = Math.floor(days / 7), d = days % 7, h = Math.floor(rem / 60), m = rem % 60;
  const out = [];
  if (w) out.push(`${w} week${w > 1 ? 's' : ''}`);
  if (d) out.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h) out.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m && !w) out.push(`${m} min`);
  return (neg ? '−' : '') + (out.join(', ') || '0 min');
}
