// Weather for Omnithel, following the Omnithel Climate Guide.
// Base roll: DMG chapter 5 weather table. Streaks: homebrew (yesterday's weather holds on a d20 of 1–10).
// All temperature, precipitation and daylight numbers are estimates from real-world climates, not from a sourcebook.
import { CAL, YEAR_DAYS, monthOffset, DAY } from './calendar.js';

// swing: how many °F one step of the DMG's "1d4 × 10 degrees colder/warmer" is worth here. The DMG uses 10 everywhere;
// coasts and the tropics get smaller swings so a rolled cold snap stays believable (homebrew, not from a sourcebook).
// winter/summer: [night low, day high] in °F; wet: chance of rain or snow per day [winter, summer]; light: daylight hours [winter, summer]
export const CLIMATES = [
  { id: 'icecap', swing: 10, name: 'Ice cap', winter: [-40, -10], summer: [10, 35], wet: [15, 20], light: [2, 22], windy: false, feel: 'Endless ice, killing cold, almost no winter sun' },
  { id: 'tundra', swing: 10, name: 'Tundra', winter: [-25, 10], summer: [35, 60], wet: [25, 30], light: [5, 19], windy: true, feel: 'Treeless, windswept, short bright summers' },
  { id: 'boreal', swing: 10, name: 'Boreal forest', winter: [-15, 20], summer: [50, 75], wet: [30, 35], light: [7, 17], windy: false, feel: 'Deep snow under pines, mild summers' },
  { id: 'coldmtn', swing: 10, name: 'Cold mountains', winter: [-20, 15], summer: [30, 55], wet: [40, 40], light: [8, 16], windy: true, feel: 'Snow on high passes even in summer' },
  { id: 'coldcoast', swing: 5, name: 'Cold ocean coast', winter: [25, 40], summer: [50, 65], wet: [55, 40], light: [8, 16], windy: true, feel: 'Fog, drizzle, gray skies, raw wind off the sea' },
  { id: 'tempcoast', swing: 5, name: 'Temperate coast', winter: [30, 45], summer: [55, 75], wet: [45, 30], light: [9, 15], windy: true, feel: 'Mild and damp, rarely extreme' },
  { id: 'tempinland', swing: 8, name: 'Temperate inland', winter: [10, 35], summer: [60, 85], wet: [30, 35], light: [9, 15], windy: false, feel: 'Four true seasons, summer thunderstorms' },
  { id: 'mediterranean', swing: 5, name: 'Mediterranean', winter: [40, 60], summer: [65, 90], wet: [35, 5], light: [10, 14], windy: false, feel: 'Rainy winters, dry golden summers' },
  { id: 'humidsub', swing: 5, name: 'Humid subtropical', winter: [40, 60], summer: [75, 95], wet: [30, 45], light: [10, 14], windy: false, feel: 'Sticky summers, afternoon storms' },
  { id: 'hotdesert', swing: 5, name: 'Hot desert', winter: [45, 70], summer: [80, 115], wet: [5, 3], light: [10.5, 13.5], windy: false, feel: 'Scorching days, cold nights, sandstorms' },
  { id: 'colddesert', swing: 10, name: 'Cold desert', winter: [0, 35], summer: [55, 95], wet: [10, 10], light: [9, 15], windy: false, feel: 'Dry year-round, bitter winters' },
  { id: 'rainforest', swing: 3, name: 'Tropical rainforest', winter: [72, 88], summer: [75, 92], wet: [60, 75], light: [12, 12], windy: false, feel: 'Hot, humid, rain most days' },
];
export const climateById = id => CLIMATES.find(c => c.id === id) || CLIMATES[6];

// Rime of the Frostmaiden: under Auril's rime, Icewind Dale is in perpetual twilight.
const RIME = { name: 'The Everlasting Rime', active: true, climate: 'tundra', lockWinter: true, wet: 40, daylight: null, twilight: true,
  note: "Auril's endless winter: no thaw and no summer. Turn this off when the Rime breaks." };

// Locations from the Omnithel Climate Guide. Fixed ids so every device creates the same list (no duplicates when syncing).
// wind: -1 sheltered (forests), 0 normal, 1 windy. Flags: fog = fog most days, overcast = sun never shows clearly.
const L = (id, name, region, climate, extra = {}) => ({ id: 'loc-' + id, name, region, climate, hemisphere: 'north', tempAdjust: 0, wind: 0, fog: false, overcast: false, notes: '', override: null, seed: true, ...extra });
export const SEED_LOCATIONS = [
  L('ten-towns', 'Ten-Towns', 'Faerûn: Icewind Dale', 'tundra', { override: { ...RIME }, notes: "Bryn Shander, Bremen, Caer-Dineval, Caer-Konig, Dougan's Hole, Easthaven, Good Mead, Lonelywood, Targos, Termalaine." }),
  L('icewind-dale', 'Icewind Dale wilderness', 'Faerûn: Icewind Dale', 'tundra', { override: { ...RIME } }),
  L('reghed-glacier', 'Reghed Glacier', 'Faerûn: Icewind Dale', 'icecap', { override: { ...RIME, climate: 'icecap', wet: 30 } }),
  L('sea-of-moving-ice', 'Sea of Moving Ice', 'Faerûn: Icewind Dale', 'icecap', { override: { ...RIME, climate: 'icecap', wet: 30 } }),
  L('spine-of-the-world', 'Spine of the World', 'Faerûn: the North', 'coldmtn'),
  L('luskan', 'Luskan', 'Faerûn: the North', 'coldcoast'),
  L('mirabar', 'Mirabar', 'Faerûn: the North', 'boreal'),
  L('neverwinter', 'Neverwinter', 'Faerûn: the North', 'tempcoast', { notes: 'SCAG: the river, warmed by Mount Hotenow, keeps the city from freezing.' }),
  L('silver-marches', 'Silverymoon and Sundabar (Silver Marches)', 'Faerûn: the North', 'boreal'),
  L('waterdeep', 'Waterdeep', 'Faerûn: Sword Coast', 'tempcoast'),
  L('high-moor', 'High Moor', 'Faerûn: Sword Coast', 'tempinland', { wind: 1 }),
  L('baldurs-gate', "Baldur's Gate", 'Faerûn: Sword Coast', 'tempcoast', { fog: true }),
  L('western-heartlands', 'Western Heartlands (Elturel, Daggerford)', 'Faerûn: Sword Coast', 'tempinland'),
  L('amn-tethyr', 'Amn and Tethyr', 'Faerûn: Lands of Intrigue', 'mediterranean'),
  L('calimshan', 'Calimshan coast', 'Faerûn: Lands of Intrigue', 'mediterranean'),
  L('calim-desert', 'Calim Desert', 'Faerûn: Lands of Intrigue', 'hotdesert'),
  L('moonshae', 'Moonshae Isles', 'Faerûn: Sword Coast', 'coldcoast'),
  L('great-glacier', 'Great Glacier', 'Faerûn: the East (not in your books)', 'icecap'),
  L('anauroch', 'Anauroch', 'Faerûn: the East (not in your books)', 'colddesert'),
  L('damara-vaasa', 'Damara and Vaasa', 'Faerûn: the East (not in your books)', 'boreal'),
  L('rashemen', 'Rashemen', 'Faerûn: the East (not in your books)', 'boreal'),
  L('cormyr', 'Cormyr, Sembia and the Dalelands', 'Faerûn: the East (not in your books)', 'tempinland'),
  L('cormanthor', 'Cormanthor', 'Faerûn: the East (not in your books)', 'tempinland', { wind: -1 }),
  L('thay', 'Thay', 'Faerûn: the East (not in your books)', 'tempinland'),
  L('aglarond', 'Aglarond', 'Faerûn: the East (not in your books)', 'tempcoast'),
  L('chessenta', 'Chessenta and the Vilhon Reach', 'Faerûn: the South (not in your books)', 'humidsub'),
  L('halruaa', 'Halruaa', 'Faerûn: the South (not in your books)', 'humidsub'),
  L('chult', 'Chult', 'Faerûn: the South (not in your books)', 'rainforest'),
  L('eiselcross', 'Eiselcross', 'Exandria: Wildemount', 'icecap'),
  L('greying-wildlands', 'Greying Wildlands', 'Exandria: Wildemount', 'boreal'),
  L('dwendalian', 'Dwendalian Empire (Rexxentrum, Zadash)', 'Exandria: Wildemount', 'tempinland'),
  L('marrow-valley', 'Marrow Valley', 'Exandria: Wildemount', 'tempinland'),
  L('xhorhas', 'Xhorhas', 'Exandria: Wildemount', 'tempinland'),
  L('menagerie-coast', 'Menagerie Coast (Nicodranas, Port Damali)', 'Exandria: Wildemount', 'humidsub'),
  L('emon', "Emon and central Tal'Dorei", "Exandria: Tal'Dorei", 'tempinland'),
  L('dividing-plains', 'Dividing Plains (Westruun)', "Exandria: Tal'Dorei", 'tempinland', { wind: 1 }),
  L('verdant-expanse', 'Verdant Expanse (Syngorn)', "Exandria: Tal'Dorei", 'tempinland', { wind: -1 }),
  L('bramblewood', 'Bramblewood', "Exandria: Tal'Dorei", 'tempinland'),
  L('stormcrest', 'Stormcrest Mountains', "Exandria: Tal'Dorei", 'coldmtn'),
  L('cliffkeep', 'Cliffkeep Mountains', "Exandria: Tal'Dorei", 'coldmtn'),
  L('lucidian-coast', 'Lucidian Coast', "Exandria: Tal'Dorei", 'tempcoast'),
  L('rifenmist', 'Rifenmist Peninsula', "Exandria: Tal'Dorei", 'humidsub'),
  L('ravnica', 'Ravnica', 'Ravnica', 'mediterranean', { tempAdjust: 5, notes: 'A city that size holds heat: +5°F.' }),
  L('barovia', 'Barovia', 'Domains of Dread', 'coldmtn', { overcast: true }),
  L('lamordia', 'Lamordia', 'Domains of Dread', 'coldcoast'),
  L('dementlieu', 'Dementlieu', 'Domains of Dread', 'tempcoast'),
  L('darkon', 'Darkon', 'Domains of Dread', 'tempinland'),
  L('falkovnia', 'Falkovnia', 'Domains of Dread', 'tempinland'),
  L('richemulot', 'Richemulot', 'Domains of Dread', 'tempinland'),
  L('kartakass', 'Kartakass', 'Domains of Dread', 'tempinland', { wind: -1 }),
  L('tepest', 'Tepest', 'Domains of Dread', 'tempinland', { fog: true }),
  L('kalakeri', 'Kalakeri', 'Domains of Dread', 'humidsub'),
  L('valachan', 'Valachan', 'Domains of Dread', 'rainforest'),
  L('har-akir', "Har'Akir", 'Domains of Dread', 'hotdesert'),
  L('sea-of-sorrows', 'Sea of Sorrows', 'Domains of Dread', 'coldcoast', { fog: true }),
];

// ---------- seeded dice, so every device rolls the same weather for the same day
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const die = (r, n) => 1 + Math.floor(r() * n);

// ---------- season math
const WINTER_SOL = monthOffset(12) + 14; // 15 Deepwatch, 0-based day of year
const LAG = 30; // the coldest days come about a month after the winter solstice
function yearFrac(epoch, hemisphere, offsetDays = 0) {
  let doy = ((epoch % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  if (hemisphere === 'south') doy = (doy + YEAR_DAYS / 2) % YEAR_DAYS;
  return (1 - Math.cos(2 * Math.PI * (doy - WINTER_SOL - offsetDays) / YEAR_DAYS)) / 2; // 0 = deep winter, 1 = high summer
}
const mix = (a, b, f) => a + (b - a) * f;

// The climate actually in force at a location (a magical override replaces it while active).
export function effectiveClimate(loc) {
  const base = climateById(loc.climate);
  const o = loc.override?.active ? loc.override : null;
  if (!o) return { ...base, lock: false, overrideName: null };
  const oc = climateById(o.climate || loc.climate);
  return { ...oc, wet: o.wet != null ? [o.wet, o.wet] : oc.wet, light: o.daylight != null ? [o.daylight, o.daylight] : base.light, lock: !!o.lockWinter, overrideName: o.name, twilight: !!o.twilight };
}

export function normals(loc, epoch) {
  const c = effectiveClimate(loc);
  const f = c.lock ? 0 : yearFrac(epoch, loc.hemisphere, LAG);
  const adj = +loc.tempAdjust || 0;
  return { low: mix(c.winter[0], c.summer[0], f) + adj, high: mix(c.winter[1], c.summer[1], f) + adj, wet: mix(c.wet[0], c.wet[1], f) / 100, climate: c };
}

export function daylight(loc, epoch) {
  const c = effectiveClimate(loc);
  if (c.twilight) return { hours: 0, rise: 0, set: 0, twilight: true };
  const f = yearFrac(epoch, loc.hemisphere, 0);
  const hours = mix(c.light[0], c.light[1], f);
  const rise = 12 - hours / 2, set = 12 + hours / 2;
  return { hours, rise: Math.round(rise * 60), set: Math.round(set * 60) };
}

// ---------- the daily roll
// prev: yesterday's weather at this location (or null). Returns a plain record (no id/timestamps).
export function rollDay(loc, epoch, prev, salt = '') {
  const r = rng(hashStr(`${loc.id}|${epoch}|${salt}`));
  const n = normals(loc, epoch);
  const windStep = Math.max(-1, Math.min(2, (n.climate.windy ? 1 : 0) + (+loc.wind || 0)));
  const swing = n.climate.swing || 10;
  const out = { epoch, held: false, rolls: {} };

  const streak = die(r, 20);
  out.rolls.streak = streak;
  const hold = prev && !prev.manualOnly && streak <= 10;

  if (hold) {
    out.held = true;
    out.tempKind = prev.tempKind;
    // Held weather drifts back toward normal a little each day.
    out.offset = Math.round((prev.offset || 0) * 0.7 + (die(r, 7) - 4));
    out.wind = prev.wind ?? 0;
    out.precip = prev.precip;
    out.heavyMax = prev.heavyMax || 0;
    out.heavyDays = prev.precip === 2 ? (prev.heavyDays || 1) + 1 : 0;
    if (out.precip === 2 && out.heavyDays > out.heavyMax) { out.precip = 1; out.heavyDays = 0; } // storms blow themselves out
    if (out.precip === 0 && prev.precip === 0 && r() < n.wet * 0.25) out.precip = 1; // a dry spell can still break
  } else {
    const t = die(r, 20);
    out.rolls.temp = t;
    if (t <= 14) { out.tempKind = 'normal'; out.offset = die(r, 7) - 4; }
    else if (t <= 17) { out.tempKind = 'colder'; out.offset = -swing * die(r, 4); }
    else { out.tempKind = 'warmer'; out.offset = swing * die(r, 4); }
    const w = die(r, 20);
    out.rolls.wind = w;
    // DMG: 1–12 calm, 13–17 light, 18–20 strong. Sheltered and windy places shift the bands (homebrew).
    const bands = { '-1': [15, 19], 0: [12, 17], 1: [6, 16], 2: [3, 14] }[windStep];
    out.wind = w <= bands[0] ? 0 : w <= bands[1] ? 1 : 2;
    const p = r();
    out.precip = p < n.wet ? (r() < 0.375 ? 2 : 1) : 0; // DMG ratio: 15 of every 40 wet days are heavy
    out.heavyDays = out.precip === 2 ? 1 : 0;
    out.heavyMax = out.precip === 2 ? die(r, 3) : 0;
  }
  out.offset = Math.max(-4 * swing, Math.min(3 * swing, out.offset)); // heat waves capped a little lower than cold snaps
  out.low = Math.round(n.low + out.offset);
  out.high = Math.round(n.high + out.offset);
  const mid = (out.low + out.high) / 2;
  out.precipType = out.precip ? (out.high <= 32 ? 'snow' : mid <= 34 ? 'sleet' : 'rain') : null;
  if (out.precip) out.sky = 'overcast';
  else if (loc.overcast) out.sky = 'overcast';
  else { const s = r(); out.sky = s < 0.45 - n.wet * 0.5 ? 'clear' : s < 0.8 ? 'partly' : 'overcast'; }
  out.fog = !out.precip && out.wind < 2 && (loc.fog ? r() < 0.6 : n.climate.id === 'coldcoast' ? r() < 0.3 : r() < 0.06);
  return out;
}

// ---------- describing it
const SKY = { clear: 'Clear skies', partly: 'Partly cloudy', overcast: 'Overcast' };
const WIND = ['Calm', 'Light wind', 'Strong wind'];
const PRECIP = { rain: ['Light rain', 'Heavy rain'], snow: ['Light snow', 'Heavy snow'], sleet: ['Sleet', 'Heavy sleet'] };

export function describe(w) {
  const parts = [];
  if (w.precip) parts.push(PRECIP[w.precipType][w.precip - 1]);
  else parts.push(SKY[w.sky] || 'Overcast');
  if (w.fog) parts.push('morning fog');
  parts.push(WIND[w.wind].toLowerCase());
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function feelsLike(w) {
  const h = w.high;
  if (h <= -10) return 'Killing cold';
  if (h <= 10) return 'Bitter cold';
  if (h <= 32) return 'Freezing';
  if (h <= 50) return 'Cold';
  if (h <= 65) return 'Cool';
  if (h <= 80) return 'Mild';
  if (h <= 95) return 'Hot';
  return 'Scorching';
}

export function weatherIcon(w) {
  if (w.precip && w.precipType === 'snow') return 'snow';
  if (w.precip) return 'rain';
  if (w.fog) return 'fog';
  if (w.wind === 2) return 'wind';
  return w.sky === 'clear' ? 'sun' : w.sky === 'partly' ? 'partly' : 'cloud';
}

// DMG chapter 5 weather effects, summarized in plain words.
export function effects(w, loc) {
  const out = [];
  if (loc && effectiveClimate(loc).twilight) out.push({ id: 'twilight', name: 'Perpetual twilight: dim light', src: 'PHB, Vision and Light',
    text: 'Outdoors it is never brighter than dim light. Dim light makes an area lightly obscured, so Perception checks that rely on sight have disadvantage. Darkvision treats dim light as bright light.' });
  if (w.low <= 0) out.push({ id: 'cold', name: w.high <= 0 ? 'Extreme cold all day' : 'Extreme cold at night',
    src: 'DMG, chapter 5', text: 'At 0°F or below: anyone exposed makes a DC 10 Constitution save at the end of each hour or gains a level of exhaustion. Automatic success with cold weather gear, resistance or immunity to cold, or natural adaptation to cold.' });
  if (w.high >= 100) out.push({ id: 'heat', name: 'Extreme heat in the afternoon',
    src: 'DMG, chapter 5', text: 'At 100°F or above without drinkable water: a Constitution save at the end of each hour (DC 5, +1 per extra hour) or gain a level of exhaustion. Disadvantage in medium or heavy armor or heavy clothing. Automatic success with fire resistance or immunity, or natural adaptation to heat.' });
  if (w.wind === 2) out.push({ id: 'wind', name: 'Strong wind', src: 'DMG, chapter 5',
    text: 'Disadvantage on ranged weapon attacks and on Perception checks that rely on hearing. Blows out open flames and scatters fog. Nonmagical flight is nearly impossible: a flyer must land at the end of its turn or fall.' });
  if (w.precip === 2) out.push({ id: 'precip', name: w.precipType === 'snow' ? 'Heavy snow' : 'Heavy rain', src: 'DMG, chapter 5',
    text: w.precipType === 'snow'
      ? 'The area is lightly obscured, so Perception checks that rely on sight have disadvantage.'
      : 'The area is lightly obscured, so Perception checks that rely on sight have disadvantage. Heavy rain also puts out open flames and gives disadvantage on Perception checks that rely on hearing.' });
  return out;
}

export const fmtF = n => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n))}°F`;
export function fmtClock(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60, h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function iconSVG(kind, size = 22) {
  const sun = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>';
  const cloud = '<path d="M7 18.5h10.2a4 4 0 00.4-8 5.6 5.6 0 00-10.8 1.4A3.3 3.3 0 007 18.5z"/>';
  const p = {
    sun, cloud,
    partly: '<circle cx="9" cy="8.5" r="3.2"/><path d="M9 2.6v1.4M3.2 8.5h1.4M4.9 4.4l1 1M13.1 4.4l-1 1"/><path d="M9.5 19h8.3a3.4 3.4 0 00.3-6.8 4.8 4.8 0 00-9.2 1.2A2.8 2.8 0 009.5 19z"/>',
    rain: '<path d="M7 14.5h10.2a4 4 0 00.4-8 5.6 5.6 0 00-10.8 1.4A3.3 3.3 0 007 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    snow: '<path d="M7 13.5h10.2a4 4 0 00.4-8 5.6 5.6 0 00-10.8 1.4A3.3 3.3 0 007 13.5z"/><path d="M8 17v3M6.6 18.5h2.8M12 17v3M10.6 18.5h2.8M16 17v3M14.6 18.5h2.8"/>',
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    wind: '<path d="M3 9h11a3 3 0 10-3-3"/><path d="M3 14h15a3 3 0 11-3 3"/>',
  }[kind] || cloud;
  return `<svg class="wx-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
