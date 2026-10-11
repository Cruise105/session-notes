import { db, uid, STORES } from './db.js';
import * as C from './calendar.js';
import { openInkEditor, renderThumb } from './ink.js';
import { initSync } from './sync.js';
import * as W from './weather.js';
import * as H from './health.js';

const APP_VERSION = '1.3.0';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtReal = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const state = {
  campaigns: [], pcs: [], sessions: [], ink: [], locations: [], weather: [], diseases: [], cases: [], outbreaks: [],
  campaignId: null, view: 'session', sessionId: null, calMonth: null, calDay: null, query: '',
};

// ---------- data helpers
const campaign = () => state.campaigns.find(c => c.id === state.campaignId);
const now = () => campaign().current;
const livePcs = () => state.pcs.filter(p => p.campaignId === state.campaignId && !p.deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
const activePcs = () => livePcs().filter(p => p.active !== false);
const campaignSessions = () => state.sessions.filter(s => s.campaignId === state.campaignId && !s.deleted).sort((a, b) => b.number - a.number || b.createdAt - a.createdAt);
const latestSession = () => campaignSessions()[0];
const inkFor = s => (s.inkIds || []).map(id => state.ink.find(i => i.id === id)).filter(i => i && !i.deleted);
const liveLocations = () => state.locations.filter(l => !l.deleted);
const locById = id => state.locations.find(l => l.id === id && !l.deleted);
const hereLoc = () => locById(campaign().locationId);

// ---------- weather records (one per campaign, location and day)
const wxId = (locId, epoch) => `${state.campaignId}:${locId}:${epoch}`;
const wxIndex = new Map();
function indexWeather() { wxIndex.clear(); for (const w of state.weather) wxIndex.set(w.id, w); }
let wxToSave = [];
let wxSaveT;
function queueWx(rec) { wxToSave.push(rec); clearTimeout(wxSaveT); wxSaveT = setTimeout(() => { const l = wxToSave; wxToSave = []; db.putMany('weather', l); }, 300); }

// Returns the weather for a location and day, rolling it (and any days in between, so streaks carry) if needed.
function weatherFor(loc, epoch) {
  if (!loc) return null;
  const hit = wxIndex.get(wxId(loc.id, epoch));
  if (hit) return hit;
  let start = epoch, prev = null;
  for (let e = epoch - 1; e >= epoch - 30; e--) { const r = wxIndex.get(wxId(loc.id, e)); if (r) { prev = r; start = e + 1; break; } }
  let rec;
  for (let e = start; e <= epoch; e++) {
    rec = { ...W.rollDay(loc, e, prev), id: wxId(loc.id, e), campaignId: state.campaignId, locationId: loc.id, updatedAt: 1 };
    state.weather.push(rec); wxIndex.set(rec.id, rec); queueWx(rec);
    prev = rec;
  }
  return rec;
}
const todayWx = () => weatherFor(hereLoc(), Math.floor(now() / C.DAY));

// ---------- health helpers
const liveDiseases = () => state.diseases.filter(d => !d.deleted).sort((a, b) => a.name.localeCompare(b.name));
const disById = id => state.diseases.find(d => d.id === id);
const OPEN_STATES = ['incubating', 'sick', 'declining'];
const openCases = pcId => state.cases.filter(c => c.campaignId === state.campaignId && !c.deleted && OPEN_STATES.includes(c.state) && (!pcId || c.pcId === pcId));
const dueCases = () => openCases().filter(c => c.state !== 'declining' && c.dueAt <= now());
function surv(p) {
  if (!p.survival) p.survival = H.defaultSurvival();
  const d = H.defaultSurvival();
  p.survival.exhausting = { ...d.exhausting, ...(p.survival.exhausting || {}) };
  p.survival.gear = { ...d.gear, ...(p.survival.gear || {}) };
  return p.survival;
}
const survivalOn = () => campaign().survivalOn !== false;
const supplies = () => campaign().supplies || 'plentiful';
function doublingFor(p) {
  const out = { hunger: false, thirst: false, fatigue: false };
  for (const c of openCases(p.id)) { if (c.state === 'incubating') continue; const d = H.rateDoubling(disById(c.diseaseId), c.stage); for (const k in out) out[k] ||= d[k]; }
  return out;
}
function tempNow(p) {
  const loc = hereLoc(); if (!loc) return null;
  const t = now(), ep = Math.floor(t / C.DAY), w = weatherFor(loc, ep);
  const air = H.tempAt(w, t - ep * C.DAY);
  return { air, ...H.tempStage(air, surv(p).gear, !!campaign().sheltered, w.wind) };
}
function refreshFlags(p) {
  const sv = surv(p); let changed = false;
  for (const k of ['hunger', 'thirst', 'fatigue']) { sv[k] = Math.max(0, Math.min(6, sv[k])); if (sv[k] >= 5 && !sv.exhausting[k]) { sv.exhausting[k] = true; changed = true; } }
  const tn = tempNow(p);
  if (tn && tn.stage >= 5 && !sv.exhausting.temp) { sv.exhausting.temp = true; changed = true; }
  return changed;
}
function conditionExhaustion(p) {
  const sv = surv(p), tn = tempNow(p);
  const plus = Math.min(3, Object.values(sv.exhausting).filter(Boolean).length);
  const zeros = ['hunger', 'thirst', 'fatigue'].filter(k => sv[k] === 0).length + (tn && tn.stage === 0 ? 1 : 0);
  return { plus, zeros };
}
// A rest clears exhaustion from any condition that's back to stage 4 or better.
function restClear(p) {
  const sv = surv(p), tn = tempNow(p);
  for (const k of ['hunger', 'thirst', 'fatigue']) if (sv[k] <= 4) sv.exhausting[k] = false;
  if (!tn || tn.stage <= 4) sv.exhausting.temp = false;
}

// Moving the clock: dawn, noon and dusk change hunger, thirst and fatigue (Darker Dungeons).
async function applyClock(t0, t1, { longRest = false } = {}) {
  const pcs = activePcs();
  const c = campaign();
  const msgs = [];
  if (survivalOn() && pcs.length) {
    const delta = t1 - t0, scarce = supplies() === 'scarce';
    if (delta >= C.DAY) {
      // Whole days passing: assume normal days of meals and sleep. Scarce supplies get used up.
      const days = Math.floor(delta / C.DAY);
      if (scarce) for (const p of pcs) {
        const sv = surv(p), need = 2 * days, f = Math.min(sv.food, need), w = Math.min(sv.water, need);
        sv.food -= f; sv.water -= w; sv.hunger += need - f; sv.thirst += need - w;
        if (need - f || need - w) msgs.push(`${p.name} ran short`);
      }
    } else if (delta > 0) {
      const marks = H.marksBetween(t0, t1);
      for (const m of marks) for (const p of pcs) {
        const sv = surv(p), dbl = doublingFor(p);
        sv.fatigue += m.fatigue * (dbl.fatigue ? 2 : 1);
        // With plenty of food and water they eat and drink as normal; only a disease's extra need shows.
        sv.hunger += m.hunger * (dbl.hunger ? 2 : 1) - (scarce ? 0 : m.hunger);
        sv.thirst += m.thirst * (dbl.thirst ? 2 : 1) - (scarce ? 0 : m.thirst);
      }
      const meal = [...marks].reverse().find(m => m.name !== 'noon');
      if (scarce && meal) c.mealPending = meal.name;
    } else if (delta < 0 && delta > -2 * C.DAY) {
      for (const m of H.marksBetween(t1, t0)) for (const p of pcs) {
        const sv = surv(p), dbl = doublingFor(p);
        sv.fatigue -= m.fatigue * (dbl.fatigue ? 2 : 1);
        sv.hunger -= m.hunger * (dbl.hunger ? 2 : 1) - (supplies() === 'scarce' ? 0 : m.hunger);
        sv.thirst -= m.thirst * (dbl.thirst ? 2 : 1) - (supplies() === 'scarce' ? 0 : m.thirst);
      }
    }
    for (const p of pcs) {
      const sv = surv(p);
      if (longRest) sv.fatigue -= 3;
      refreshFlags(p);
      if (longRest) restClear(p);
    }
    for (const p of pcs) await save('pcs', p);
  }
  await processCases();
  return msgs;
}

// Diseases in decline get better on their own each period (Darker Dungeons: automatic success).
async function processCases() {
  for (const cs of openCases()) {
    if (cs.state !== 'declining') continue;
    const d = disById(cs.diseaseId); let changed = false;
    while (cs.state === 'declining' && cs.dueAt <= now()) {
      cs.stage -= 1; changed = true;
      cs.log.push({ at: cs.dueAt, kind: 'decline', result: 'auto', stage: cs.stage });
      if (cs.stage <= 0) { cs.state = 'cured'; cs.curedAt = cs.dueAt; break; }
      cs.dueAt += H.incubationMins(d);
    }
    if (changed) await save('cases', cs);
  }
}

async function save(store, rec) {
  rec.updatedAt = Date.now();
  if (store !== 'campaigns' && rec.campaignId) {
    const c = state.campaigns.find(x => x.id === rec.campaignId);
    if (c?.seed && state.campaignId) { c.seed = false; c.updatedAt = Date.now(); await db.put('campaigns', c); }
  }
  const list = state[store === 'campaigns' ? 'campaigns' : store];
  const i = list.findIndex(r => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  await db.put(store, rec);
  return rec;
}

const pending = new Map();
function saveSoon(store, rec, ms = 600) {
  const p = pending.get(rec.id); if (p) clearTimeout(p.t);
  pending.set(rec.id, { store, rec, t: setTimeout(() => { pending.delete(rec.id); save(store, rec); }, ms) });
}
function flushSaves() {
  for (const [id, p] of pending) { clearTimeout(p.t); save(p.store, p.rec); }
  pending.clear();
}

// ---------- first run
async function seed() {
  const cid = uid();
  // `seed: true` marks the untouched starter campaign, so loading a backup on a new device replaces it instead of duplicating the party.
  const c = { id: cid, name: 'Rime of the Frostmaiden', current: C.toMinutes({ year: 301, month: 6, day: 3, hour: 8 }), createdAt: Date.now(), seed: true, locationId: 'loc-ten-towns' };
  await save('campaigns', c);
  const party = [
    ['Araxstoxinos', 'Triton', 'Paladin 7 (Oath of the Open Sea)'],
    ['Canary', 'Human', 'Bard 7 (College of Lore)'],
    ["Ce'Aren Liolen", 'Shadar-kai', 'Cleric 6 / Wizard 2'],
    ['Gustaf', 'Copper Dragonborn', 'Artificer 7 (Artillerist)'],
    ['Zenth', 'Gold Dragonborn', 'Monk 7 (Way of the Long Death)'],
  ];
  let order = 0;
  for (const [name, ancestry, classes] of party) {
    await save('pcs', newPc({ campaignId: cid, name, ancestry, classes, order: order++ }));
  }
  await db.setMeta('campaignId', cid);
}

function newPc(fields) {
  return { id: uid(), campaignId: state.campaignId, name: '', ancestry: '', classes: '', player: '', maxHp: null, ac: null, pp: null,
    active: true, deaths: [], favor: { spent: false }, order: livePcs().length, createdAt: Date.now(), ...fields };
}

async function load() {
  const [campaigns, pcs, sessions, ink, locations, weather, diseases, cases, outbreaks] = await Promise.all(STORES.map(s => db.all(s)));
  Object.assign(state, { campaigns, pcs, sessions, ink, locations, weather, diseases, cases, outbreaks });
  const haveD = new Set(state.diseases.map(d => d.id));
  const addD = H.SEED_DISEASES.filter(d => !haveD.has(d.id)).map(d => ({ ...d, stages: d.stages.slice(), updatedAt: 0 }));
  if (addD.length) { await db.putMany('diseases', addD); state.diseases.push(...addD); }
  if (!campaigns.filter(c => !c.deleted).length) { await seed(); }
  // Locations from the climate guide. Fixed ids and updatedAt 0, so every device adds the same list and any edit wins.
  const have = new Set(state.locations.map(l => l.id));
  const add = W.SEED_LOCATIONS.filter(l => !have.has(l.id)).map(l => ({ ...l, override: l.override ? { ...l.override } : null, updatedAt: 0 }));
  if (add.length) { await db.putMany('locations', add); state.locations.push(...add); }
  // Stage 2.1: the Rime brings perpetual twilight (Rime of the Frostmaiden). Fill it in on locations made before that.
  const fix = state.locations.filter(l => l.override?.name === 'The Everlasting Rime' && l.override.twilight === undefined);
  for (const l of fix) l.override.twilight = true;
  if (fix.length) await db.putMany('locations', fix);
  state.campaignId = (await db.getMeta('campaignId')) || state.campaigns[0].id;
  if (!campaign()) state.campaignId = state.campaigns.find(c => !c.deleted).id;
  const c = campaign();
  if (c.locationId === undefined) { c.locationId = /frostmaiden/i.test(c.name) ? 'loc-ten-towns' : null; await save('campaigns', c); }
}

// ---------- theme
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.themeResolved = dark ? 'dark' : 'light';
  document.querySelectorAll('#themeSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.theme === (t || 'system'))));
}
let themePref = 'system';
try { themePref = localStorage.getItem('sn-theme') || 'system'; } catch (_) {}
applyTheme(themePref);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(themePref));

// ---------- moons
function moonSVG(moon, epoch, size = 18) {
  const { frac, name } = C.moonPhase(moon, epoch);
  const r = 8, cx = 10, cy = 10, k = Math.cos(2 * Math.PI * frac), rx = Math.abs(k) * r;
  let d;
  if (frac <= 0.5) d = `M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${rx},${r} 0 0 ${k > 0 ? 0 : 1} ${cx},${cy - r}Z`;
  else d = `M${cx},${cy - r} A${r},${r} 0 0 0 ${cx},${cy + r} A${rx},${r} 0 0 ${k > 0 ? 1 : 0} ${cx},${cy - r}Z`;
  return `<svg class="moon" viewBox="0 0 20 20" width="${size}" height="${size}" role="img" aria-label="${esc(moon.name)}: ${name}"><title>${esc(moon.name)}: ${name}</title><circle cx="10" cy="10" r="8" class="moon-dark"/><path d="${d}" fill="${moon.color}"/><circle cx="10" cy="10" r="8" class="moon-rim"/></svg>`;
}

// ---------- header
function renderHeader() {
  const t = now(), d = C.fromMinutes(t);
  $('#campaignBtn').textContent = campaign().name;
  $('#clockDate').textContent = C.fmtDate(t);
  $('#clockTime').textContent = `${C.fmtTime(t)} · ${C.seasonOf(d.month, d.day)}`;
  $('#clockMoons').innerHTML = C.CAL.moons.map(m => moonSVG(m, d.epoch, 20)).join('');
  const loc = hereLoc(), w = todayWx();
  $('#wxBtn').innerHTML = loc && w
    ? `${W.iconSVG(W.weatherIcon(w), 24)}<span class="wx-chip-text"><b>${W.fmtF(w.low)} / ${W.fmtF(w.high)}</b><span>${esc(loc.name)}</span></span>`
    : `${W.iconSVG('cloud', 24)}<span class="wx-chip-text"><b>Weather</b><span>Pick a location</span></span>`;
  $('#wxBtn').setAttribute('aria-label', loc && w ? `${loc.name}: ${W.describe(w)}, ${W.fmtF(w.low)} to ${W.fmtF(w.high)}. Open World.` : 'Pick a location for weather');
  document.querySelectorAll('.tabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
}

// ---------- date picker (month/day/year/time)
function pickerHTML(id, t) {
  const d = C.fromMinutes(t);
  return `<div class="picker" id="${id}">
    <label class="field"><span>Day</span><input type="number" inputmode="numeric" data-k="day" min="1" max="30" value="${d.day}"></label>
    <label class="field grow"><span>Month</span><select data-k="month">${C.CAL.months.map((m, i) => `<option value="${i}" ${i === d.month ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Year (CR)</span><input type="number" inputmode="numeric" data-k="year" min="1" value="${d.year}"></label>
    <label class="field"><span>Time</span><input type="time" data-k="time" value="${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}"></label>
  </div>`;
}
function readPicker(id) {
  const el = document.getElementById(id);
  const v = k => el.querySelector(`[data-k="${k}"]`).value;
  const month = +v('month');
  const day = Math.min(Math.max(1, +v('day') || 1), C.CAL.months[month].length);
  const [hour, minute] = (v('time') || '00:00').split(':').map(Number);
  return C.toMinutes({ year: Math.max(1, +v('year') || 1), month, day, hour, minute });
}

// ---------- views
function render() {
  renderHeader();
  const v = $('#view');
  if (state.view === 'session') v.innerHTML = viewSession();
  if (state.view === 'party') v.innerHTML = viewParty();
  if (state.view === 'calendar') v.innerHTML = viewCalendar();
  if (state.view === 'history') v.innerHTML = viewHistory();
  if (state.view === 'world') v.innerHTML = viewWorld();
  afterRender();
}

function afterRender() {
  document.querySelectorAll('textarea.grow').forEach(autoGrow);
  document.querySelectorAll('canvas[data-ink]').forEach(cv => {
    const page = state.ink.find(i => i.id === cv.dataset.ink);
    renderThumb(cv, page?.strokes);
  });
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, +t.dataset.min || 0) + 'px'; }

function favorBadge(p) {
  return p.favor?.spent
    ? `<span class="badge spent" title="Spent ${p.favor.at != null ? esc(C.fmtShort(p.favor.at)) : ''}">Spent</span>`
    : `<span class="badge avail">Available</span>`;
}

// ---------- weather card (Session and World tabs)
function wxCard({ big = false } = {}) {
  const loc = hereLoc();
  if (!loc) return `<section class="card wx-card empty"><div><h2>Weather</h2><p class="muted">Choose where the party is to get the day's weather.</p></div><button class="btn primary" data-act="pick-loc">Choose a location</button></section>`;
  const t = now(), ep = Math.floor(t / C.DAY), w = weatherFor(loc, ep), dl = W.daylight(loc, ep), ec = W.effectiveClimate(loc);
  const mins = t - ep * C.DAY, isDay = mins >= dl.rise && mins < dl.set;
  const fx = W.effects(w, loc);
  return `<section class="card wx-card ${big ? 'big' : ''}">
    <div class="wx-main">
      <div class="wx-glyph">${W.iconSVG(W.weatherIcon(w), big ? 64 : 48)}</div>
      <div class="wx-text">
        <div class="wx-loc"><button class="link-btn wx-locname" data-act="pick-loc" title="Change location">${esc(loc.name)}</button>${ec.overrideName ? `<span class="badge rime">${esc(ec.overrideName)}</span>` : ''}</div>
        <div class="wx-temps"><b>${W.fmtF(w.low)}</b> at night · <b>${W.fmtF(w.high)}</b> by day <span class="muted">· ${W.feelsLike(w)}</span></div>
        <div class="wx-desc">${esc(W.describe(w))}${w.manual ? ' <span class="badge">Set by you</span>' : w.held ? ' <span class="muted small">(same as yesterday)</span>' : ''}</div>
        <div class="wx-sun muted small">${dl.twilight ? `Perpetual twilight: the sun never fully rises` : `Sunrise ${W.fmtClock(dl.rise)} · Sunset ${W.fmtClock(dl.set)} · ${dl.hours.toFixed(1)} hours of daylight · ${isDay ? 'Daytime now' : 'Dark now'}`}</div>
      </div>
      <div class="wx-btns">
        <button class="btn small" data-act="pick-loc">Change location</button>
        ${big ? `<button class="btn small" data-act="wx-reroll">Reroll today</button><button class="btn small" data-act="wx-set">Set today's weather</button>` : `<button class="btn small" data-act="goto-world">Weather tools</button>`}
      </div>
    </div>
    ${fx.length ? `<div class="wx-fx">${fx.map(f => `<details class="fx fx-${f.id}"><summary>${esc(f.name)}</summary><p>${esc(f.text)} <span class="muted">(${esc(f.src)})</span></p></details>`).join('')}</div>` : ''}
  </section>`;
}

// ---------- survival card (Session tab)
const condLevel = n => (n <= 1 ? 'good' : n === 2 ? 'ok' : n === 3 ? 'mild' : n === 4 ? 'warn' : 'bad');
function condCell(p, k) {
  const sv = surv(p), cond = H.CONDITIONS.find(c => c.id === k), n = sv[k];
  return `<div class="cond lv-${condLevel(n)}" data-k="${k}">
    <button class="cond-btn" data-act="cond-dec" aria-label="Better ${cond.name.toLowerCase()} for ${esc(p.name)}">−</button>
    <span class="cond-name">${cond.stages[n]}${sv.exhausting[k] ? ' <b class="ex" title="Causing exhaustion until a rest">+1</b>' : ''}</span>
    <button class="cond-btn" data-act="cond-inc" aria-label="Worse ${cond.name.toLowerCase()} for ${esc(p.name)}">+</button>
  </div>`;
}
function survivalCard() {
  if (!survivalOn()) return '';
  const pcs = activePcs(), c = campaign(), scarce = supplies() === 'scarce';
  for (const p of pcs) if (refreshFlags(p)) saveSoon('pcs', p, 200);
  const meal = scarce && c.mealPending ? `<div class="meal">
      <b>${c.mealPending === 'dawn' ? 'Breakfast' : 'Supper'} time: who's eating and drinking?</b>
      <div class="meal-grid">${pcs.map(p => { const sv = surv(p); return `<div class="meal-pc"><span>${esc(p.name)}</span>
        <label class="check small"><input type="checkbox" data-meal="food" data-pc="${p.id}" ${sv.food > 0 ? 'checked' : 'disabled'}> Food (${sv.food})</label>
        <label class="check small"><input type="checkbox" data-meal="water" data-pc="${p.id}" ${sv.water > 0 ? 'checked' : 'disabled'}> Water (${sv.water})</label></div>`; }).join('')}</div>
      <div class="row left"><button class="btn primary small" data-act="meal-eat">Eat and drink</button><button class="btn small" data-act="meal-skip">Skip this meal</button></div>
    </div>` : '';
  const rows = pcs.map(p => {
    const sv = surv(p), tn = tempNow(p), ex = conditionExhaustion(p);
    const best = Math.min(sv.hunger, sv.thirst, sv.fatigue, tn ? tn.stage : 6);
    const tempCell = tn ? `<div class="cond lv-${condLevel(tn.stage)} temp"><span class="cond-name">${tn.side === 'cold' ? '❄ ' : tn.side === 'hot' ? '☀ ' : ''}${H.CONDITIONS[3].stages[tn.stage]}${sv.exhausting.temp ? ' <b class="ex" title="Causing exhaustion until a rest">+1</b>' : ''}</span>
        <button class="cond-btn gear" data-act="gear" aria-label="Gear and protection for ${esc(p.name)}" title="Gear and protection">⚙</button></div>` : '<span class="muted small">Pick a location</span>';
    return `<tr data-pc="${p.id}">
      <th scope="row"><span class="pc-name">${esc(p.name)}</span></th>
      <td data-label="Hunger">${condCell(p, 'hunger')}</td><td data-label="Thirst">${condCell(p, 'thirst')}</td><td data-label="Fatigue">${condCell(p, 'fatigue')}</td><td data-label="Temperature">${tempCell}</td>
      <td class="exh" data-label="Exhaustion" title="Stage 5–6 conditions add 1 each (up to 3); top-stage conditions take 1 away">${ex.plus - ex.zeros > 0 ? `<b>+${ex.plus - ex.zeros}</b>` : '<span class="muted">0</span>'}${ex.plus && ex.zeros ? `<span class="muted small"> (+${ex.plus} −${ex.zeros})</span>` : ''}</td>
      <td data-label=""><button class="btn small" data-act="stamina">Stamina ${H.STAMINA_DC[best] ? `DC ${H.STAMINA_DC[best]}` : ''}</button></td>
      ${scarce ? `<td class="rations" data-label="Rations"><span>Food <button class="mini-btn" data-act="ration" data-r="food" data-d="-1">−</button><b>${sv.food}</b><button class="mini-btn" data-act="ration" data-r="food" data-d="1">+</button></span>
        <span>Water <button class="mini-btn" data-act="ration" data-r="water" data-d="-1">−</button><b>${sv.water}</b><button class="mini-btn" data-act="ration" data-r="water" data-d="1">+</button></span></td>` : ''}
    </tr>`;
  }).join('');
  return `<section class="card surv-card">
    <div class="card-head"><h2>Survival</h2>
      <div class="seg small-seg" role="radiogroup" aria-label="Supplies">
        <button type="button" role="radio" data-act="supplies" data-v="plentiful" aria-checked="${!scarce}">Plentiful supplies</button>
        <button type="button" role="radio" data-act="supplies" data-v="scarce" aria-checked="${scarce}">Scarce supplies</button>
      </div>
      <label class="check small shelter"><input type="checkbox" data-act-change="sheltered" ${c.sheltered ? 'checked' : ''}> Indoors or sheltered</label>
    </div>
    ${meal}
    <div class="table-wrap"><table class="surv">
      <thead><tr><th>PC</th><th>Hunger</th><th>Thirst</th><th>Fatigue</th><th>Temperature</th><th>Exhaustion</th><th></th>${scarce ? '<th>Rations</th>' : ''}</tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="muted">No active characters.</td></tr>'}</tbody>
    </table></div>
    <div class="surv-actions">
      <button class="btn small" data-act="sleep-good">Good night's sleep (−3 fatigue)</button>
      <button class="btn small" data-act="sleep-bad">Disturbed sleep (−1 fatigue)</button>
      <button class="btn small" data-act="short-rest">Short rest</button>
      ${scarce ? '<button class="btn small" data-act="ration-all">Give everyone rations</button>' : ''}
    </div>
    <p class="muted small">Darker Dungeons: dawn +1 hunger and thirst, noon +1 fatigue, dusk +1 to all three; stage 5–6 adds a level of exhaustion (up to 3) until it's better and they rest.${scarce ? '' : ' Plentiful supplies: they eat and drink as normal, so hunger and thirst only move for a disease or if you change them.'} Temperature comes from today's weather and the time of day <span class="flag">(homebrew conversion)</span>.</p>
  </section>`;
}

// ---------- disease card (Session tab)
function caseLine(cs) {
  const d = disById(cs.diseaseId), pc = state.pcs.find(p => p.id === cs.pcId);
  const due = cs.state !== 'declining' && cs.dueAt <= now();
  let status;
  if (cs.state === 'incubating') status = `Incubating · Infection check ${due ? 'due now' : `on ${C.fmtShort(cs.dueAt)}`}`;
  else if (cs.state === 'sick') status = `Stage ${cs.stage} of 4 · Escalation check ${due ? 'due now' : `on ${C.fmtShort(cs.dueAt)}`}`;
  else status = `Getting better · stage ${cs.stage} · improves again ${C.fmtShort(cs.dueAt)}`;
  let contagious = '';
  if (cs.state !== 'incubating' && d.transmission) {
    if (cs.stage >= 4) contagious = 'Always contagious';
    else { const share = H.CONTAGIOUS[cs.stage]; contagious = `Contagious below ${share * 100}% HP${pc?.maxHp ? ` (under ${Math.ceil(pc.maxHp * share)} HP)` : ''}`; }
  }
  const effects = cs.state === 'incubating' ? [] : H.activeEffects(d, cs.stage);
  return `<li class="case ${due ? 'due' : ''} st-${cs.state}" data-case="${cs.id}">
    <div class="case-top"><div><b>${esc(pc?.name || '?')}</b>: ${esc(d?.name || 'Unknown disease')} <span class="muted small">(DC ${d?.dc}, ${esc(d?.transmission || '')})</span></div>
      ${due ? '<span class="badge due-badge">Check due</span>' : ''}</div>
    <div class="case-status">${esc(status)}${cs.bedRest ? ' · <b>bed rest: advantage on the next check</b>' : ''}${cs.disadvantage && cs.state === 'incubating' ? ' · infection check at disadvantage' : ''}</div>
    ${effects.length ? `<ul class="case-fx">${effects.map((e, i) => `<li><span class="muted">Stage ${i + 1}:</span> ${esc(e)}</li>`).join('')}</ul>` : ''}
    ${contagious ? `<div class="muted small">${esc(contagious)} · Diagnosis: Medicine (Wisdom or Intelligence) DC ${H.RARITY_DC[d.rarity] || 10}</div>` : ''}
    <div class="case-btns">
      ${due ? `<button class="btn small primary" data-act="case-check">${cs.state === 'incubating' ? 'Roll infection check' : 'Roll escalation check'}</button>` : ''}
      ${cs.state === 'sick' ? `<button class="btn small" data-act="case-bedrest">${cs.bedRest ? 'Cancel bed rest' : 'Bed rest or first aid'}</button>` : ''}
      ${cs.state !== 'incubating' ? `<button class="btn small" data-act="case-magic">Treated with magic</button>` : ''}
      ${cs.state === 'declining' ? `<button class="btn small" data-act="case-relapse">Exposed again</button>` : ''}
      ${cs.state !== 'incubating' && cs.stage >= 4 ? `<button class="btn small danger-text" data-act="case-died">They died</button>` : ''}
      <button class="link-btn" data-act="case-remove">Remove</button>
    </div>
  </li>`;
}
function diseaseCard() {
  const list = openCases().sort((a, b) => a.dueAt - b.dueAt);
  const loc = hereLoc();
  const ob = loc ? state.outbreaks.filter(o => o.campaignId === state.campaignId && !o.deleted && !o.endedAt && o.locationId === loc.id) : [];
  return `<section class="card dis-card">
    <div class="card-head"><h2>Diseases</h2><span class="muted small">Darker Dungeons rules</span><button class="btn small push" data-act="exposure">Log an exposure</button></div>
    ${ob.map(o => `<p class="outbreak">Going around in ${esc(loc.name)}: <b>${esc(disById(o.diseaseId)?.name || '?')}</b> since ${esc(C.fmtShort(o.startAt))}${o.note ? ` · ${esc(o.note)}` : ''}</p>`).join('')}
    ${list.length ? `<ul class="case-list">${list.map(caseLine).join('')}</ul>` : '<p class="muted">No one is sick.</p>'}
  </section>`;
}

function diseaseSummary(pcId) {
  const cs = openCases(pcId);
  if (!cs.length) return '<span class="muted">—</span>';
  return cs.map(c => { const d = disById(c.diseaseId); const due = c.state !== 'declining' && c.dueAt <= now();
    return `<span class="dis-chip ${due ? 'due' : ''}">${esc(d?.name || '?')}${c.state === 'incubating' ? ' (incubating)' : c.state === 'declining' ? ` (better, ${c.stage})` : ` (${c.stage})`}</span>`; }).join(' ');
}

function worldDiseases() {
  const lib = liveDiseases();
  const obs = state.outbreaks.filter(o => o.campaignId === state.campaignId && !o.deleted).sort((a, b) => (a.endedAt ? 1 : 0) - (b.endedAt ? 1 : 0) || b.startAt - a.startAt);
  return `<section class="card">
      <div class="card-head"><h2>Outbreaks</h2><span class="muted small">Diseases going around a place. The Session tab shows them when the party is there.</span><button class="btn small push" data-act="outbreak-new">Start an outbreak</button></div>
      ${obs.length ? `<ul class="ob-list">${obs.map(o => `<li data-ob="${o.id}" class="${o.endedAt ? 'ended' : ''}"><span><b>${esc(disById(o.diseaseId)?.name || '?')}</b> in ${esc(locById(o.locationId)?.name || '?')} · since ${esc(C.fmtShort(o.startAt))}${o.endedAt ? ` · over ${esc(C.fmtShort(o.endedAt))}` : ''}${o.note ? ` · ${esc(o.note)}` : ''}</span>
        ${o.endedAt ? '<button class="link-btn" data-act="outbreak-del">Remove</button>' : '<button class="btn small" data-act="outbreak-end">It\'s over</button>'}</li>`).join('')}</ul>` : '<p class="muted">No outbreaks.</p>'}
    </section>
    <section class="card">
      <div class="card-head"><h2>Disease library</h2><span class="muted small">Darker Dungeons is third-party, not one of your WotC books.</span><button class="btn small push" data-act="disease-new">Create a disease</button></div>
      <div class="dis-lib">${lib.map(d => `<details class="dis-item" data-dis="${d.id}"><summary><b>${esc(d.name)}</b> <span class="muted small">${esc(d.rarity)} · DC ${d.dc} · ${H.fmtIncubation(d.incubation)} · ${esc(d.transmission)}</span> <span class="badge ${d.source === 'Homebrew' ? 'spent' : ''}">${esc(d.source)}</span></summary>
        <p>${esc(d.description)}</p>
        <ol class="dis-stages">${d.stages.map(st => `<li>${esc(st)}</li>`).join('')}</ol>
        <p><b>Cured:</b> ${esc(d.cured)}</p>
        <div class="row left"><button class="btn small" data-act="disease-edit">Edit</button></div>
      </details>`).join('')}</div>
    </section>`;
}

function viewWorld() {
  const loc = hereLoc();
  const ep = Math.floor(now() / C.DAY);
  let recent = '';
  if (loc) {
    weatherFor(loc, ep);
    const rows = [];
    for (let e = ep; e > ep - 10; e--) { const r = wxIndex.get(wxId(loc.id, e)); if (r) rows.push(r); }
    recent = `<section class="card"><h2>Recent weather in ${esc(loc.name)}</h2>
      <div class="table-wrap"><table class="wx-table"><thead><tr><th>Day</th><th>Weather</th><th>Night</th><th>Day</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(C.fmtDate(r.epoch * C.DAY))}</td><td><span class="wx-inline">${W.iconSVG(W.weatherIcon(r), 20)} ${esc(W.describe(r))}</span></td><td>${W.fmtF(r.low)}</td><td>${W.fmtF(r.high)}</td><td class="muted small">${r.manual ? 'Set by you' : r.held ? 'Held over' : 'New roll'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted small">Each morning there's a 50% chance yesterday's weather holds, so storms and cold snaps last a few days. Heavy rain or snow ends after 1–3 days.</p></section>`;
  }
  const groups = {};
  for (const l of liveLocations()) (groups[l.region || 'Other'] ||= []).push(l);
  const order = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const lib = order.map(g => `<details class="loc-group" ${groups[g].some(l => l.id === loc?.id) ? 'open' : ''}><summary>${esc(g)} <span class="muted">(${groups[g].length})</span></summary>
    <ul class="loc-list">${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map(l => `<li data-loc="${l.id}" class="${l.id === loc?.id ? 'here' : ''}">
      <div class="loc-info"><b>${esc(l.name)}</b><span class="muted small">${esc(W.climateById(l.climate).name)}${l.hemisphere === 'south' ? ' · southern hemisphere' : ''}${+l.tempAdjust ? ` · ${l.tempAdjust > 0 ? '+' : ''}${l.tempAdjust}°F` : ''}${l.wind > 0 ? ' · windy' : l.wind < 0 ? ' · sheltered' : ''}${l.fog ? ' · often foggy' : ''}${l.overcast ? ' · always overcast' : ''}</span>
        ${l.override ? `<span class="badge ${l.override.active ? 'rime' : ''}">${esc(l.override.name || 'Override')}${l.override.active ? '' : ' (off)'}</span>` : ''}</div>
      <div class="loc-btns">${l.id === loc?.id ? '<span class="pill live">Party is here</span>' : '<button class="btn small" data-act="go-loc">Go here</button>'}<button class="btn small" data-act="edit-loc">Edit</button></div>
    </li>`).join('')}</ul></details>`).join('');
  return `<div class="view-head"><h1>World</h1></div>
    ${wxCard({ big: true })}
    ${recent}
    <section class="card">
      <div class="card-head"><h2>Locations</h2><span class="muted small">From the Omnithel Climate Guide. Temperatures and rain chances are estimates, not from a sourcebook.</span>
        <button class="btn small push" data-act="add-loc">Add a location</button></div>
      ${lib}
    </section>
    ${worldDiseases()}`;
}

function viewSession() {
  const list = campaignSessions();
  if (!list.length) {
    return `<section class="welcome card">
      <h1>Your first session</h1>
      <p>Each session starts filled in: the party's stats, the session number, today's date and the current in-game date. You only change what's different.</p>
      <p class="muted">The party is set up from Rime of the Frostmaiden. Fill in Max HP, AC and Passive Perception on the Party tab or straight in the table once the session starts.</p>
      <div class="welcome-row">
        <label class="field"><span>Session number</span><input id="firstNum" type="number" inputmode="numeric" min="1" value="1"></label>
        <button class="btn primary big" data-act="start-first">Start session</button>
      </div>
    </section>`;
  }
  let s = list.find(x => x.id === state.sessionId) || list[0];
  state.sessionId = s.id;
  const isLatest = s.id === list[0].id;
  const open = s.endAt == null;
  const rows = open ? activePcs().map(p => ({ pc: p, v: p })) : (s.party || []).map(sp => ({ pc: state.pcs.find(p => p.id === sp.pcId), v: sp }));
  const pages = inkFor(s);
  const idx = list.indexOf(s);

  return `<article class="session">
    <div class="session-head">
      <div class="session-title">
        <button class="icon-btn" data-act="sess-older" ${idx >= list.length - 1 ? 'disabled' : ''} aria-label="Previous session">‹</button>
        <h1>Session <input class="num-input" data-field="number" type="number" inputmode="numeric" value="${s.number}" aria-label="Session number"></h1>
        <button class="icon-btn" data-act="sess-newer" ${idx === 0 ? 'disabled' : ''} aria-label="Next session">›</button>
        ${open ? '<span class="pill live">In progress</span>' : '<span class="pill">Ended</span>'}
      </div>
      <div class="session-meta">
        <label class="meta-item"><span>Played</span><input type="date" data-field="realDate" value="${esc(s.realDate)}"></label>
        <div class="meta-item"><span>In game, started</span><b>${esc(C.fmtDateTime(s.startAt))}</b>
          ${open ? (now() > s.startAt ? `<em>Now ${esc(C.fmtDateTime(now()))} (${esc(C.fmtSpan(now() - s.startAt))} later)</em>` : '<em>No in-game time has passed yet</em>')
                 : `<em>Ended ${esc(C.fmtDateTime(s.endAt))} (${esc(C.fmtSpan(s.endAt - s.startAt))} later)</em>`}</div>
      </div>
    </div>

    ${open ? wxCard() : (s.locationId && locById(s.locationId) ? `<p class="muted small sess-loc">Started in ${esc(locById(s.locationId).name)}${(s.visited || []).length ? `, then ${(s.visited || []).map(v => esc(locById(v.locationId)?.name || '?')).join(', ')}` : ''}.</p>` : '')}

    <section class="card">
      <h2>Party</h2>
      <div class="table-wrap"><table class="party">
        <thead><tr><th>PC</th><th>Max HP</th><th>AC</th><th>Pass. Perc.</th><th>Diseases</th><th>Deaths</th><th>Favor of Fate</th></tr></thead>
        <tbody>${rows.map(({ pc, v }) => `<tr data-pc="${pc?.id || ''}">
          <th scope="row"><span class="pc-name">${esc(v.name ?? pc?.name)}</span><span class="pc-sub">${esc(pc?.classes || '')}</span></th>
          ${['maxHp', 'ac', 'pp'].map(k => `<td>${open && pc
            ? `<input class="cell-input" type="number" inputmode="numeric" data-stat="${k}" value="${v[k] ?? ''}" placeholder="—" aria-label="${k}">`
            : `<span class="cell-val">${v[k] ?? '—'}</span>`}</td>`).join('')}
          <td class="dis-cell">${open && pc ? diseaseSummary(pc.id) : esc(v.diseases || '—')}</td>
          <td><span class="deaths">${open && pc ? pc.deaths.length : (v.deaths ?? 0)}</span>${open && pc ? `<button class="mini-btn" data-act="death" title="Log a death" aria-label="Log a death for ${esc(pc.name)}">+</button>` : ''}</td>
          <td>${open && pc ? favorBadge(pc) : (v.favorSpent ? '<span class="badge spent">Spent</span>' : '<span class="badge avail">Available</span>')}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="muted">No active characters. Add them on the Party tab.</td></tr>`}</tbody>
      </table></div>
      ${open ? '' : '<p class="muted small">Stats as they were when this session ended.</p>'}
    </section>
    ${open ? diseaseCard() + survivalCard() : ''}

    <section class="card notes-card">
      <div class="card-head"><h2>Notes</h2><span class="muted small">Write with the S Pen; it turns into text you can search.</span></div>
      <textarea class="ruled grow" data-field="notes" data-min="420" placeholder="What happened this session…">${esc(s.notes)}</textarea>
    </section>

    <section class="card">
      <div class="card-head"><h2>Ink pages</h2><span class="muted small">Freehand pages for sketches and quick scribbles.</span></div>
      <div class="ink-grid">
        ${pages.map((pg, i) => `<button class="ink-thumb" data-act="open-ink" data-id="${pg.id}" aria-label="Open ink page ${i + 1}"><canvas data-ink="${pg.id}"></canvas><span>Page ${i + 1}</span></button>`).join('')}
        <button class="ink-thumb add" data-act="new-ink"><span class="plus">+</span><span>New ink page</span></button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Shopping</h2><span class="muted small">Items to make cards for, dealer requests. A proper tracker comes in a later update.</span></div>
      <textarea class="ruled grow" data-field="shopping" data-min="140" placeholder="Bought, ordered, or waiting on…">${esc(s.shopping)}</textarea>
    </section>

    <div class="session-actions">
      ${open && isLatest ? `<button class="btn" data-act="end-session">End session</button>` : ''}
      ${isLatest ? `<button class="btn primary" data-act="next-session">${open ? 'End and start' : 'Start'} session ${s.number + 1}</button>` : ''}
      ${!open && isLatest ? `<button class="btn" data-act="reopen-session">Reopen</button>` : ''}
      <span class="spacer"></span>
      <button class="btn danger-text" data-act="delete-session">Delete session</button>
    </div>
  </article>`;
}

function viewParty() {
  const pcs = livePcs();
  const card = p => {
    const deaths = p.deaths.slice().sort((a, b) => a.at - b.at);
    return `<article class="card pc-card ${p.active === false ? 'retired' : ''}" data-pc="${p.id}">
      <div class="pc-top">
        <div><h2>${esc(p.name)}</h2><p class="muted">${esc([p.ancestry, p.classes].filter(Boolean).join(' · ') || 'No details yet')}${p.player ? ` · played by ${esc(p.player)}` : ''}</p></div>
        <div class="pc-btns">
          <button class="btn small" data-act="edit-pc">Edit</button>
          <button class="btn small" data-act="toggle-active">${p.active === false ? 'Bring back' : 'Retire'}</button>
        </div>
      </div>
      <div class="stat-row">
        ${[['maxHp', 'Max HP'], ['ac', 'AC'], ['pp', 'Pass. Perc.']].map(([k, l]) => `<label class="stat"><span>${l}</span><input class="cell-input" type="number" inputmode="numeric" data-stat="${k}" value="${p[k] ?? ''}" placeholder="—"></label>`).join('')}
        <div class="stat"><span>Deaths</span><b class="deaths big">${p.deaths.length}</b></div>
        <div class="stat"><span>Favor of Fate</span>${favorBadge(p)}</div>
      </div>
      <div class="pc-cols">
        <div>
          <h3>Deaths</h3>
          ${deaths.length ? `<ol class="death-list">${deaths.map(d => `<li><b>${esc(C.fmtShort(d.at))}</b> ${esc(d.note || 'No details')}${d.favor ? ' <span class="badge spent">Revived by Favor of Fate</span>' : ''} <button class="link-btn" data-act="del-death" data-id="${d.id}" aria-label="Remove this death">Remove</button></li>`).join('')}</ol>` : '<p class="muted small">None yet.</p>'}
          <button class="btn small" data-act="death">Log a death</button>
        </div>
        <div>
          <h3>Favor of Fate</h3>
          ${p.favor?.spent
            ? `<p class="small">Spent on ${p.favor.at != null ? esc(C.fmtShort(p.favor.at)) : 'an unrecorded date'}${p.favor.note ? `: ${esc(p.favor.note)}` : ''}.</p><button class="btn small" data-act="favor-restore">Give the coin back</button>`
            : `<p class="small">Their coin is unspent: one revival, once.</p><button class="btn small" data-act="favor-spend">Mark as spent</button>`}
        </div>
      </div>
    </article>`;
  };
  const active = pcs.filter(p => p.active !== false), retired = pcs.filter(p => p.active === false);
  return `<div class="view-head"><h1>Party</h1><button class="btn primary" data-act="add-pc">Add a character</button></div>
    <p class="muted shared-note">This roster is shared: the Bestiary's combat tracker will read the party from here.</p>
    ${active.map(card).join('') || '<p class="muted">No active characters.</p>'}
    ${retired.length ? `<details class="retired-list"><summary>Retired or departed (${retired.length})</summary>${retired.map(card).join('')}</details>` : ''}`;
}

function viewCalendar() {
  const cur = C.fromMinutes(now());
  if (!state.calMonth) state.calMonth = { year: cur.year, month: cur.month };
  const { year, month } = state.calMonth;
  const m = C.CAL.months[month];
  const first = C.epochOf(year, month, 1);
  const lead = C.weekdayOf(first);
  const sessByEpoch = {};
  for (const s of campaignSessions()) (sessByEpoch[Math.floor(s.startAt / C.DAY)] ||= []).push(s);
  // Weather already recorded for this campaign: prefer where the party is now, otherwise any place that day.
  const wxByEpoch = {};
  const hereId = campaign().locationId;
  if (hereLoc()) weatherFor(hereLoc(), cur.epoch);
  for (const w of state.weather) if (w.campaignId === state.campaignId && (!wxByEpoch[w.epoch] || w.locationId === hereId)) wxByEpoch[w.epoch] = w;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell empty" aria-hidden="true"></div>');
  for (let d = 1; d <= m.length; d++) {
    const ep = first + d - 1;
    const isToday = ep === cur.epoch;
    const moons = C.CAL.moons.map(mo => {
      const ph = C.moonPhase(mo, ep).name, prev = C.moonPhase(mo, ep - 1).name;
      return (ph === 'Full' || ph === 'New') && ph !== prev ? `<span class="cal-moon" title="${esc(mo.name)} ${ph}">${moonSVG(mo, ep, 14)}</span>` : '';
    }).join('');
    const evs = C.eventsOn(month, d);
    const ss = sessByEpoch[ep] || [];
    const sel = state.calDay === d;
    cells.push(`<button class="cal-cell${isToday ? ' today' : ''}${sel ? ' sel' : ''}" data-act="cal-day" data-day="${d}" aria-label="${d} ${esc(m.name)}${isToday ? ', current in-game day' : ''}">
      <span class="cal-num">${d}${isToday ? '<span class="cal-now">Now</span>' : ''}</span><span class="cal-moons">${moons}</span>
      ${evs.map(e => `<span class="cal-ev ${e.kind}">${esc(e.name)}</span>`).join('')}
      ${ss.map(s => `<span class="cal-sess">Session ${s.number}</span>`).join('')}
      ${wxByEpoch[ep] && ep <= cur.epoch ? `<span class="cal-wx" title="${esc(W.describe(wxByEpoch[ep]))}">${W.iconSVG(W.weatherIcon(wxByEpoch[ep]), 16)}${W.fmtF(wxByEpoch[ep].high)}</span>` : ''}
    </button>`);
  }
  let detail = '';
  if (state.calDay) {
    const d = state.calDay, ep = first + d - 1;
    const t = ep * C.DAY + cur.hour * 60 + cur.minute;
    const evs = C.eventsOn(month, d);
    const ss = sessByEpoch[ep] || [];
    detail = `<section class="card day-detail">
      <h2>${esc(C.fmtDate(t))}</h2>
      <p class="muted">${C.seasonOf(month, d)}</p>
      <ul class="moon-list">${C.CAL.moons.map(mo => { const ph = C.moonPhase(mo, ep); return `<li>${moonSVG(mo, ep, 22)} <b>${esc(mo.name)}</b> ${ph.name} <span class="muted">(day ${ph.day} of ${mo.cycle})</span></li>`; }).join('')}</ul>
      ${wxByEpoch[ep] && ep <= cur.epoch ? `<p class="wx-inline">${W.iconSVG(W.weatherIcon(wxByEpoch[ep]), 22)} ${esc(locById(wxByEpoch[ep].locationId)?.name || '')}: ${esc(W.describe(wxByEpoch[ep]))}, ${W.fmtF(wxByEpoch[ep].low)} to ${W.fmtF(wxByEpoch[ep].high)}</p>` : ''}
      ${evs.map(e => `<div class="ev-detail"><b>${esc(e.label)}</b>${e.description ? `<p class="small">${esc(e.description)}</p>` : ''}</div>`).join('')}
      ${ss.map(s => `<button class="link-btn" data-act="goto-session" data-id="${s.id}">Session ${s.number} started this day</button>`).join(' ')}
      ${ep !== cur.epoch ? `<div class="row left"><button class="btn" data-act="cal-set" data-epoch="${ep}">Make this the current in-game day</button></div>` : '<p class="small"><b>This is the current in-game day.</b></p>'}
    </section>`;
  }
  return `<div class="view-head cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="Previous month">‹</button>
      <h1>${esc(m.name)} <span class="muted">${year} ${C.CAL.era}</span></h1>
      <button class="icon-btn" data-act="cal-next" aria-label="Next month">›</button>
      <span class="spacer"></span>
      <button class="btn" data-act="cal-today">Current day</button>
    </div>
    <div class="cal-grid" role="grid">
      ${C.CAL.weekdays.map(w => `<div class="cal-wd" role="columnheader">${esc(w)}</div>`).join('')}
      ${cells.join('')}
    </div>
    <p class="muted small cal-legend">Moon icons mark the day each moon turns full or new. Weekdays run straight through the year, so each month starts on a different day.</p>
    ${detail}`;
}

function snippet(text, q) {
  const f = fold(text), i = f.indexOf(q);
  if (i < 0) return null;
  const start = Math.max(0, i - 60), end = Math.min(text.length, i + q.length + 80);
  return (start > 0 ? '…' : '') + esc(text.slice(start, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, end)) + (end < text.length ? '…' : '');
}

function viewHistory() {
  const q = fold(state.query.trim());
  const list = campaignSessions();
  let body;
  if (q) {
    const hits = [];
    for (const s of list) {
      const parts = [['Notes', s.notes], ['Shopping', s.shopping]].map(([l, t]) => [l, snippet(t || '', q)]).filter(x => x[1]);
      if (parts.length) hits.push(`<button class="hist-item" data-act="goto-session" data-id="${s.id}">
        <span class="hist-title">Session ${s.number}<span class="muted"> · ${esc(fmtReal(s.realDate))} · ${esc(C.fmtShort(s.startAt))}</span></span>
        ${parts.map(([l, sn]) => `<span class="hist-snip"><b>${l}:</b> ${sn}</span>`).join('')}</button>`);
    }
    for (const p of livePcs()) for (const d of p.deaths) {
      const sn = snippet(d.note || '', q);
      const nameHit = fold(p.name).includes(q);
      if (sn || nameHit) hits.push(`<div class="hist-item static"><span class="hist-title">${esc(p.name)} died<span class="muted"> · ${esc(C.fmtShort(d.at))}</span></span><span class="hist-snip">${sn || esc(d.note || 'No details')}</span></div>`);
    }
    body = hits.join('') || `<p class="muted">Nothing found for “${esc(state.query)}”.</p>`;
  } else {
    body = list.map(s => `<button class="hist-item" data-act="goto-session" data-id="${s.id}">
      <span class="hist-title">Session ${s.number}<span class="muted"> · ${esc(fmtReal(s.realDate))}</span></span>
      <span class="hist-sub">${esc(C.fmtShort(s.startAt))}${s.endAt != null ? ` → ${esc(C.fmtShort(s.endAt))}` : ' · in progress'}${inkFor(s).length ? ` · ${inkFor(s).length} ink page${inkFor(s).length > 1 ? 's' : ''}` : ''}</span>
      <span class="hist-snip">${esc((s.notes || '').slice(0, 180)) || '<i class="muted">No notes</i>'}</span></button>`).join('') || '<p class="muted">No sessions yet.</p>';
  }
  return `<div class="view-head"><h1>History</h1></div>
    <label class="search"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input id="searchInput" type="search" placeholder="Search notes, shopping and deaths" value="${esc(state.query)}" autocomplete="off" aria-label="Search"></label>
    <div class="hist-list">${body}</div>`;
}

// ---------- actions
async function startSession(number) {
  const s = { id: uid(), campaignId: state.campaignId, number, realDate: todayISO(), startAt: now(), endAt: null, locationId: campaign().locationId || null, visited: [],
    party: snapshotParty(), notes: '', shopping: '', inkIds: [], createdAt: Date.now() };
  await save('sessions', s);
  state.sessionId = s.id;
}
function snapshotParty() {
  return activePcs().map(p => ({ pcId: p.id, name: p.name, maxHp: p.maxHp, ac: p.ac, pp: p.pp, deaths: p.deaths.length, favorSpent: !!p.favor?.spent,
    diseases: openCases(p.id).map(c => `${disById(c.diseaseId)?.name || '?'}${c.state === 'incubating' ? ' (incubating)' : ` (stage ${c.stage})`}`).join(', ') || '—' }));
}
async function endSession(s) { s.endAt = now(); s.party = snapshotParty(); await save('sessions', s); }

function curSession() { return state.sessions.find(s => s.id === state.sessionId); }

let deathPc = null;
function openDeath(pc) {
  deathPc = pc;
  const f = $('#deathForm');
  f.reset();
  $('#deathTitle').textContent = `Log a death: ${pc.name}`;
  $('#deathPicker').innerHTML = pickerHTML('dp', now());
  $('#deathFavorRow').hidden = !!pc.favor?.spent;
  $('#deathDlg').returnValue = '';
  $('#deathDlg').showModal();
}
$('#deathDlg').addEventListener('close', async () => {
  if ($('#deathDlg').returnValue !== 'save' || !deathPc) return;
  const f = $('#deathForm');
  const d = { id: uid(), at: readPicker('dp'), note: f.note.value.trim(), favor: !deathPc.favor?.spent && f.favor.checked };
  deathPc.deaths.push(d);
  if (d.favor) deathPc.favor = { spent: true, at: d.at, deathId: d.id, note: d.note ? `undid "${d.note}"` : 'undid a death' };
  await save('pcs', deathPc);
  toast(d.favor ? `${deathPc.name} died, and the Favor of Fate brought them back.` : `Death logged for ${deathPc.name}.`);
  render();
});

let editPc = null;
function openPc(pc) {
  editPc = pc;
  const f = $('#pcForm');
  f.reset();
  $('#pcTitle').textContent = pc ? `Edit ${pc.name}` : 'Add a character';
  for (const k of ['name', 'ancestry', 'classes', 'player', 'maxHp', 'ac', 'pp', 'immunity']) f[k].value = pc?.[k] ?? '';
  $('#pcDlg').returnValue = '';
  $('#pcDlg').showModal();
}
$('#pcDlg').addEventListener('close', async () => {
  if ($('#pcDlg').returnValue !== 'save') return;
  const f = $('#pcForm');
  const pc = editPc || newPc({});
  for (const k of ['name', 'ancestry', 'classes', 'player']) pc[k] = f[k].value.trim();
  for (const k of ['maxHp', 'ac', 'pp', 'immunity']) pc[k] = f[k].value === '' ? null : +f[k].value;
  if (!pc.name) return;
  await save('pcs', pc);
  render();
});

function confirmBox(title, body, yes) {
  return new Promise(res => {
    $('#confirmTitle').textContent = title; $('#confirmBody').textContent = body; $('#confirmYes').textContent = yes;
    const dlg = $('#confirmDlg');
    dlg.returnValue = '';
    dlg.addEventListener('close', () => res(dlg.returnValue === 'yes'), { once: true });
    dlg.showModal();
  });
}

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

async function setTime(t, opts = {}) {
  const c = campaign(), old = c.current; c.current = Math.max(0, t);
  await applyClock(old, c.current, opts);
  await save('campaigns', c);
  renderHeader(); $('#timeNow').innerHTML = timeNowHTML();
  if ($('#inkView').hidden) render();
}
function timeNowHTML() {
  const t = now(), d = C.fromMinutes(t);
  return `<div class="tn-date">${esc(C.fmtDate(t))}</div><div class="tn-time">${esc(C.fmtTime(t))} · ${C.seasonOf(d.month, d.day)}</div>
    <div class="tn-moons">${C.CAL.moons.map(m => `<span>${moonSVG(m, d.epoch, 22)} ${esc(m.name)}: ${C.moonPhase(m, d.epoch).name}</span>`).join('')}</div>
    ${C.eventsOn(d.month, d.day).map(e => `<div class="tn-ev">${esc(e.label)}</div>`).join('')}
    ${hereLoc() ? (() => { const dl = W.daylight(hereLoc(), d.epoch); return `<div class="tn-sun">In ${esc(hereLoc().name)}: ${dl.twilight ? 'perpetual twilight' : `sunrise ${W.fmtClock(dl.rise)}, sunset ${W.fmtClock(dl.set)}`}</div>`; })() : ''}`;
}

// ---------- locations
async function moveTo(locId) {
  const c = campaign();
  if (c.locationId === locId) return;
  c.locationId = locId; await save('campaigns', c);
  const s = latestSession();
  if (s && s.endAt == null) { s.visited = [...(s.visited || []), { locationId: locId, at: now() }]; await save('sessions', s); }
  const loc = locById(locId), w = weatherFor(loc, Math.floor(now() / C.DAY));
  toast(`The party is in ${loc.name}. ${W.describe(w)}, ${W.fmtF(w.low)} to ${W.fmtF(w.high)}.`);
}

function openLocPicker() {
  const dlg = $('#locPickDlg');
  const draw = q => {
    const f = fold(q.trim());
    const list = liveLocations().filter(l => !f || fold(l.name + ' ' + l.region + ' ' + (l.notes || '')).includes(f));
    const groups = {};
    for (const l of list) (groups[l.region || 'Other'] ||= []).push(l);
    $('#locPickList').innerHTML = Object.keys(groups).sort().map(g => `<div class="pick-group"><h3>${esc(g)}</h3>${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map(l =>
      `<button type="button" class="pick-item ${l.id === campaign().locationId ? 'here' : ''}" data-pick="${l.id}"><b>${esc(l.name)}</b><span class="muted small">${esc(W.climateById(l.climate).name)}${l.override?.active ? ` · ${esc(l.override.name)}` : ''}</span></button>`).join('')}</div>`).join('') || '<p class="muted">No locations match. You can add one on the World tab.</p>';
  };
  $('#locSearch').value = '';
  $('#locSearch').oninput = e => draw(e.target.value);
  draw('');
  dlg.returnValue = '';
  dlg.showModal();
}
$('#locPickList').addEventListener('click', async e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  $('#locPickDlg').close();
  await moveTo(b.dataset.pick); render();
});

let editLoc = null;
function openLocEditor(loc) {
  editLoc = loc;
  const f = $('#locForm');
  f.reset();
  $('#locTitle').textContent = loc ? `Edit ${loc.name}` : 'Add a location';
  $('#locClimate').innerHTML = W.CLIMATES.map(c => `<option value="${c.id}">${esc(c.name)}: ${esc(c.feel)}</option>`).join('');
  $('#ovClimate').innerHTML = W.CLIMATES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#regionList').innerHTML = [...new Set(liveLocations().map(l => l.region))].sort().map(r => `<option value="${esc(r)}">`).join('');
  const L = loc || { name: '', region: '', climate: 'tempinland', hemisphere: 'north', tempAdjust: 0, wind: 0, fog: false, overcast: false, notes: '', override: null };
  f.name.value = L.name; f.region.value = L.region; f.climate.value = L.climate; f.hemisphere.value = L.hemisphere || 'north';
  f.tempAdjust.value = L.tempAdjust || 0; f.wind.value = String(L.wind || 0); f.fog.checked = !!L.fog; f.overcast.checked = !!L.overcast; f.notes.value = L.notes || '';
  const o = L.override;
  f.hasOverride.checked = !!o;
  f.ovName.value = o?.name || ''; f.ovActive.checked = o ? !!o.active : true; f.ovClimate.value = o?.climate || L.climate;
  f.ovLock.checked = o ? !!o.lockWinter : true; f.ovWet.value = o?.wet ?? ''; f.ovDaylight.value = o?.daylight ?? ''; f.ovTwilight.checked = !!o?.twilight;
  $('#ovFields').hidden = !o;
  $('#locDelete').hidden = !loc;
  $('#locDlg').returnValue = '';
  $('#locDlg').showModal();
}
$('#locForm').hasOverride.addEventListener('change', e => { $('#ovFields').hidden = !e.target.checked; });
$('#locDelete').addEventListener('click', async () => {
  if (!editLoc) return;
  if (editLoc.id === campaign().locationId) { toast("The party is here. Move them somewhere else before deleting it."); return; }
  $('#locDlg').close();
  if (!(await confirmBox(`Delete ${editLoc.name}?`, 'It disappears from your location list. Weather already recorded there stays in your history.', 'Delete'))) return;
  editLoc.deleted = true; await save('locations', editLoc); render();
});
$('#locDlg').addEventListener('close', async () => {
  if ($('#locDlg').returnValue !== 'save') return;
  const f = $('#locForm');
  const loc = editLoc || { id: 'loc-' + uid(), createdAt: Date.now() };
  loc.name = f.name.value.trim() || loc.name || 'Unnamed place';
  loc.region = f.region.value.trim() || 'My locations';
  loc.climate = f.climate.value; loc.hemisphere = f.hemisphere.value;
  loc.tempAdjust = +f.tempAdjust.value || 0; loc.wind = +f.wind.value || 0;
  loc.fog = f.fog.checked; loc.overcast = f.overcast.checked; loc.notes = f.notes.value.trim();
  loc.override = f.hasOverride.checked ? {
    name: f.ovName.value.trim() || 'Magical weather', active: f.ovActive.checked, climate: f.ovClimate.value, lockWinter: f.ovLock.checked,
    wet: f.ovWet.value === '' ? null : Math.max(0, Math.min(100, +f.ovWet.value)), daylight: f.ovDaylight.value === '' ? null : Math.max(0, Math.min(24, +f.ovDaylight.value)), twilight: f.ovTwilight.checked,
  } : null;
  await save('locations', loc);
  toast(`${loc.name} saved. New settings apply from the next day that gets rolled.`);
  render();
});

function openWxSet() {
  const loc = hereLoc(), ep = Math.floor(now() / C.DAY), w = weatherFor(loc, ep), f = $('#wxForm');
  f.low.value = w.low; f.high.value = w.high; f.precip.value = String(w.precip); f.wind.value = String(w.wind);
  f.sky.value = w.sky || 'overcast'; f.fog.checked = !!w.fog;
  $('#wxDlg').returnValue = '';
  $('#wxDlg').showModal();
}
$('#wxDlg').addEventListener('close', async () => {
  if ($('#wxDlg').returnValue !== 'save') return;
  const f = $('#wxForm'), loc = hereLoc(), ep = Math.floor(now() / C.DAY), cur = weatherFor(loc, ep);
  const low = +f.low.value, high = Math.max(+f.high.value, low), precip = +f.precip.value;
  const n = W.normals(loc, ep);
  const rec = { ...cur, low, high, precip, wind: +f.wind.value, sky: precip ? 'overcast' : f.sky.value, fog: !precip && f.fog.checked, manual: true, held: false,
    offset: Math.round(((low - n.low) + (high - n.high)) / 2), heavyDays: precip === 2 ? 1 : 0, heavyMax: precip === 2 ? 2 : 0 };
  const mid = (low + high) / 2;
  rec.precipType = precip ? (high <= 32 ? 'snow' : mid <= 34 ? 'sleet' : 'rain') : null;
  await save('weather', rec); wxIndex.set(rec.id, rec);
  toast("Today's weather set. Tomorrow may carry it on."); render();
});

// ---------- disease dialogs
const caseOf = el => state.cases.find(c => c.id === el.closest('[data-case]').dataset.case);
function diseaseOptions(sel) {
  const groups = {};
  for (const d of liveDiseases()) (groups[d.source || 'Other'] ||= []).push(d);
  return Object.keys(groups).sort().map(g => `<optgroup label="${esc(g)}">${groups[g].map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)} (${esc(d.rarity)}, DC ${d.dc}, ${H.fmtIncubation(d.incubation)})</option>`).join('')}</optgroup>`).join('');
}
function openExposure() {
  const f = $('#expForm'); f.reset();
  $('#expPcs').innerHTML = activePcs().map(p => `<label class="check"><input type="checkbox" value="${p.id}"> <span>${esc(p.name)}</span></label>`).join('');
  $('#expDisease').innerHTML = diseaseOptions();
  const loc = hereLoc();
  const ob = loc ? state.outbreaks.find(o => o.campaignId === state.campaignId && !o.deleted && !o.endedAt && o.locationId === loc.id) : null;
  if (ob) $('#expDisease').value = ob.diseaseId;
  $('#expNote').textContent = `Exposure time: ${C.fmtDateTime(now())}.`;
  $('#expDlg').returnValue = ''; $('#expDlg').showModal();
}
$('#expDlg').addEventListener('close', async () => {
  if ($('#expDlg').returnValue !== 'save') return;
  const f = $('#expForm'), d = disById(f.disease.value);
  const ids = [...$('#expPcs').querySelectorAll('input:checked')].map(i => i.value);
  if (!ids.length || !d) { toast('Pick at least one character and a disease.'); return; }
  const immune = [], logged = [];
  for (const id of ids) {
    const p = state.pcs.find(x => x.id === id);
    if (H.immunityDC(+p.immunity || 0) >= d.dc) { immune.push(p.name); continue; }
    const cs = { id: uid(), campaignId: state.campaignId, pcId: id, diseaseId: d.id, contactAt: now(), route: f.route.value.split(':')[0], disadvantage: f.disadv.checked,
      state: 'incubating', stage: 0, dueAt: now() + H.incubationMins(d), bedRest: false, log: [{ at: now(), kind: 'exposed' }], createdAt: Date.now() };
    await save('cases', cs); logged.push(p.name);
  }
  toast([logged.length ? `${logged.join(', ')} exposed to ${d.name}. Infection check on ${C.fmtShort(now() + H.incubationMins(d))}.` : '', immune.length ? `${immune.join(', ')} ${immune.length > 1 ? 'are' : 'is'} immune.` : ''].filter(Boolean).join(' '));
  render();
});

let checkCase = null;
function openCheck(cs) {
  checkCase = cs;
  const d = disById(cs.diseaseId), p = state.pcs.find(x => x.id === cs.pcId);
  const infection = cs.state === 'incubating';
  $('#checkTitle').textContent = `${infection ? 'Infection' : 'Escalation'} check: ${p?.name}`;
  const adv = infection ? (cs.disadvantage ? 'with <b>disadvantage</b> (open wounds or repeated exposure)' : '') : (cs.bedRest ? 'with <b>advantage</b> (bed rest or first aid)' : '');
  $('#checkBody').innerHTML = `<p>${esc(d.name)}: <b>DC ${d.dc} Constitution saving throw</b> ${adv}.</p>
    <p class="muted small">${infection ? 'Success: not infected. Failure: infected, and the first symptoms (stage 1) begin.' : `Success: the symptoms have peaked; it improves a stage and starts getting better. Failure: it gets worse, to stage ${Math.min(4, cs.stage + 1)}.`}</p>`;
  $('#checkDlg').returnValue = ''; $('#checkDlg').showModal();
}
$('#checkDlg').addEventListener('close', async () => {
  const r = $('#checkDlg').returnValue, cs = checkCase;
  if (!cs || (r !== 'success' && r !== 'failure')) return;
  const d = disById(cs.diseaseId), inc = H.incubationMins(d), p = state.pcs.find(x => x.id === cs.pcId);
  let msg;
  if (cs.state === 'incubating') {
    cs.log.push({ at: now(), kind: 'infection', result: r });
    if (r === 'success') { cs.state = 'resisted'; msg = `${p.name} fought it off: not infected.`; }
    else { cs.state = 'sick'; cs.stage = 1; cs.dueAt += inc; msg = `${p.name} has ${d.name}: stage 1.`; }
  } else {
    cs.log.push({ at: now(), kind: 'escalation', result: r, adv: cs.bedRest });
    cs.bedRest = false;
    if (r === 'success') {
      cs.stage -= 1; cs.dueAt += inc;
      if (cs.stage <= 0) { cs.state = 'cured'; cs.curedAt = now(); msg = `${p.name} has recovered from ${d.name}. ${d.cured}`; }
      else { cs.state = 'declining'; msg = `${p.name}'s ${d.name} is getting better: stage ${cs.stage}.`; }
    } else { cs.stage = Math.min(4, cs.stage + 1); cs.dueAt += inc; msg = `${p.name}'s ${d.name} gets worse: stage ${cs.stage}.`; }
  }
  if (cs.state === 'cured') { p.healthNotes = [...(p.healthNotes || []), { at: now(), text: `Recovered from ${d.name}: ${d.cured}` }]; await save('pcs', p); }
  await save('cases', cs); toast(msg); render();
});

let magicCase = null;
function openMagic(cs) { magicCase = cs; $('#magicForm').reset(); $('#magicDlg').returnValue = ''; $('#magicDlg').showModal(); }
$('#magicDlg').addEventListener('close', async () => {
  if ($('#magicDlg').returnValue !== 'save' || !magicCase) return;
  const cs = magicCase, d = disById(cs.diseaseId), max = H.magicMaxDC(+$('#magicForm').level.value);
  if (d.dc > max) { toast(`Not strong enough: ${d.name} is DC ${d.dc}, and that magic only works up to DC ${max}.`); return; }
  cs.state = 'declining'; cs.log.push({ at: now(), kind: 'magic' });
  await save('cases', cs); toast(`The magic works: ${d.name} is now getting better, a stage at a time.`); render();
});

function openOutbreak() {
  $('#obForm').reset();
  $('#obLoc').innerHTML = liveLocations().sort((a, b) => a.name.localeCompare(b.name)).map(l => `<option value="${l.id}" ${l.id === campaign().locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('#obDisease').innerHTML = diseaseOptions();
  $('#obDlg').returnValue = ''; $('#obDlg').showModal();
}
$('#obDlg').addEventListener('close', async () => {
  if ($('#obDlg').returnValue !== 'save') return;
  const f = $('#obForm');
  await save('outbreaks', { id: uid(), campaignId: state.campaignId, locationId: f.loc.value, diseaseId: f.disease.value, startAt: now(), endedAt: null, note: f.note.value.trim(), createdAt: Date.now() });
  render();
});

let editDis = null;
function openDisease(d) {
  editDis = d;
  const f = $('#disForm'); f.reset();
  $('#disTitle').textContent = d ? `Edit ${d.name}` : 'Create a disease';
  const D = d || { name: '', transmission: 'Touch', rarity: 'Common', dc: 15, incubation: 2, description: '', stages: ['', '', '', ''], cured: '' };
  f.name.value = D.name; f.transmission.value = D.transmission; f.rarity.value = D.rarity; f.dc.value = String(D.dc);
  const weeks = D.incubation % 7 === 0; f.incN.value = weeks ? D.incubation / 7 : D.incubation; f.incU.value = weeks ? '7' : '1';
  f.description.value = D.description; f.cured.value = D.cured;
  ['s1', 's2', 's3', 's4'].forEach((k, i) => { f[k].value = D.stages[i] || ''; });
  $('#disDelete').hidden = !d;
  $('#disDlg').returnValue = ''; $('#disDlg').showModal();
}
$('#disDelete').addEventListener('click', async () => {
  if (!editDis) return;
  $('#disDlg').close();
  if (!(await confirmBox(`Delete ${editDis.name}?`, 'It leaves the library. Anyone sick with it stays sick until you resolve it.', 'Delete'))) return;
  editDis.deleted = true; await save('diseases', editDis); render();
});
$('#disDlg').addEventListener('close', async () => {
  if ($('#disDlg').returnValue !== 'save') return;
  const f = $('#disForm');
  const d = editDis || { id: 'dis-' + uid(), source: 'Homebrew', createdAt: Date.now() };
  d.name = f.name.value.trim() || 'Unnamed disease'; d.transmission = f.transmission.value.trim(); d.rarity = f.rarity.value; d.dc = +f.dc.value;
  d.incubation = Math.max(1, +f.incN.value || 1) * +f.incU.value; d.description = f.description.value.trim(); d.cured = f.cured.value.trim();
  d.stages = ['s1', 's2', 's3', 's4'].map(k => f[k].value.trim());
  await save('diseases', d); render();
});

// ---------- survival dialogs
let gearPc = null;
function openGear(p) {
  gearPc = p; const g = surv(p).gear, f = $('#gearForm');
  $('#gearTitle').textContent = `${p.name}: protection`;
  for (const k of Object.keys(g)) f[k].checked = !!g[k];
  f.everyone.checked = false;
  $('#gearDlg').returnValue = ''; $('#gearDlg').showModal();
}
$('#gearDlg').addEventListener('close', async () => {
  if ($('#gearDlg').returnValue !== 'save' || !gearPc) return;
  const g = surv(gearPc).gear, f = $('#gearForm');
  for (const k of Object.keys(g)) g[k] = f[k].checked;
  const who = f.everyone.checked ? activePcs() : [gearPc];
  for (const p of who) { surv(p).gear = { ...g }; refreshFlags(p); await save('pcs', p); }
  render();
});

let stamPc = null;
function openStamina(p) {
  stamPc = p; const sv = surv(p), tn = tempNow(p);
  const stages = { hunger: sv.hunger, thirst: sv.thirst, fatigue: sv.fatigue, ...(tn ? { temperature: tn.stage } : {}) };
  const best = Math.min(...Object.values(stages)), dc = H.STAMINA_DC[best];
  $('#stamTitle').textContent = `Stamina check: ${p.name}`;
  $('#stamBody').innerHTML = dc
    ? `<p><b>DC ${dc} Constitution saving throw</b>, from their best condition.</p><p class="muted small">After a strenuous event. On a failure, roll a d6 to see which condition gets worse.</p>`
    : `<p>Their best condition is at its top stage, so there's no check to make.</p>`;
  $('#stamRow').hidden = false; $('#stamD6').hidden = true; $('#stamFail').hidden = !dc;
  $('#stamDlg').returnValue = ''; $('#stamDlg').showModal();
}
$('#stamFail').addEventListener('click', () => { $('#stamRow').hidden = true; $('#stamD6').hidden = false; });
$('#stamD6').addEventListener('click', async e => {
  const b = e.target.closest('[data-d6]'); if (!b || !stamPc) return;
  const sv = surv(stamPc); sv[b.dataset.d6] = Math.min(6, sv[b.dataset.d6] + 1); refreshFlags(stamPc);
  await save('pcs', stamPc); $('#stamDlg').close(); toast(`${stamPc.name}: +1 ${b.dataset.d6}.`); render();
});

// ---------- ink
async function openInk(page) {
  const view = $('#inkView');
  view.hidden = false;
  document.body.classList.add('ink-open');
  openInkEditor(view, page, {
    onChange: async (strokes, { color, size }) => { page.strokes = strokes; page.lastColor = color; page.lastSize = size; await save('ink', page); },
    onClose: () => { view.hidden = true; view.innerHTML = ''; document.body.classList.remove('ink-open'); render(); },
    onDelete: async () => {
      if (!(await confirmBox('Delete this ink page?', 'Everything written on it will be removed.', 'Delete page'))) return;
      page.deleted = true; await save('ink', page);
      const s = curSession(); s.inkIds = s.inkIds.filter(id => id !== page.id); await save('sessions', s);
      view.hidden = true; view.innerHTML = ''; document.body.classList.remove('ink-open'); render();
    },
  });
}

// ---------- events
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  state.view = b.dataset.view;
  if (state.view === 'session') state.sessionId = latestSession()?.id;
  render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0);
});

$('#view').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  const pcEl = b.closest('[data-pc]');
  const pc = pcEl ? state.pcs.find(p => p.id === pcEl.dataset.pc) : null;
  const s = curSession();
  switch (act) {
    case 'start-first': await startSession(Math.max(1, +$('#firstNum').value || 1)); break;
    case 'sess-older': { const l = campaignSessions(); state.sessionId = l[l.indexOf(s) + 1]?.id || s.id; break; }
    case 'sess-newer': { const l = campaignSessions(); state.sessionId = l[l.indexOf(s) - 1]?.id || s.id; break; }
    case 'end-session': await endSession(s); toast(`Session ${s.number} ended at ${C.fmtShort(s.endAt)}, ${C.fmtTime(s.endAt)}.`); break;
    case 'reopen-session': s.endAt = null; await save('sessions', s); break;
    case 'next-session': if (s.endAt == null) await endSession(s); await startSession(s.number + 1); window.scrollTo(0, 0); break;
    case 'delete-session':
      if (!(await confirmBox(`Delete session ${s.number}?`, 'Its notes, shopping and ink pages will be removed. The party and calendar are not affected.', 'Delete session'))) return;
      s.deleted = true; await save('sessions', s); state.sessionId = latestSession()?.id; break;
    case 'death': openDeath(pc); return;
    case 'del-death': {
      if (!(await confirmBox('Remove this death?', 'Use this to fix a mistake. If the Favor of Fate was used on it, the coin is given back.', 'Remove'))) return;
      const id = b.dataset.id;
      pc.deaths = pc.deaths.filter(d => d.id !== id);
      if (pc.favor?.deathId === id) pc.favor = { spent: false };
      await save('pcs', pc); break;
    }
    case 'favor-spend': pc.favor = { spent: true, at: now(), note: '' }; await save('pcs', pc); break;
    case 'favor-restore':
      if (!(await confirmBox(`Give ${pc.name} their coin back?`, 'Their Favor of Fate will show as available again.', 'Give it back'))) return;
      pc.favor = { spent: false }; await save('pcs', pc); break;
    case 'edit-pc': openPc(pc); return;
    case 'add-pc': openPc(null); return;
    case 'toggle-active': pc.active = pc.active === false; await save('pcs', pc); break;
    case 'new-ink': {
      const page = { id: uid(), sessionId: s.id, strokes: [], createdAt: Date.now() };
      await save('ink', page); s.inkIds = [...(s.inkIds || []), page.id]; await save('sessions', s);
      openInk(page); return;
    }
    case 'open-ink': openInk(state.ink.find(i => i.id === b.dataset.id)); return;
    case 'cal-prev': case 'cal-next': {
      let { year, month } = state.calMonth; month += act === 'cal-next' ? 1 : -1;
      if (month < 0) { month = C.CAL.months.length - 1; year--; } if (month >= C.CAL.months.length) { month = 0; year++; }
      state.calMonth = { year: Math.max(1, year), month }; state.calDay = null; break;
    }
    case 'cal-today': { const d = C.fromMinutes(now()); state.calMonth = { year: d.year, month: d.month }; state.calDay = d.day; break; }
    case 'cal-day': state.calDay = +b.dataset.day; break;
    case 'cal-set': {
      const cur = C.fromMinutes(now());
      const t = +b.dataset.epoch * C.DAY + cur.hour * 60 + cur.minute;
      if (!(await confirmBox('Change the current in-game day?', `The campaign's date moves to ${C.fmtDate(t)}, keeping the time of day.`, 'Change date'))) return;
      await setTime(t); break;
    }
    case 'goto-session': state.view = 'session'; state.sessionId = b.dataset.id; window.scrollTo(0, 0); break;
    case 'goto-world': state.view = 'world'; window.scrollTo(0, 0); break;
    case 'pick-loc': openLocPicker(); return;
    case 'go-loc': await moveTo(b.closest('[data-loc]').dataset.loc); break;
    case 'edit-loc': openLocEditor(locById(b.closest('[data-loc]').dataset.loc)); return;
    case 'add-loc': openLocEditor(null); return;
    case 'wx-reroll': {
      const loc = hereLoc(), ep = Math.floor(now() / C.DAY), cur = weatherFor(loc, ep);
      const prev = wxIndex.get(wxId(loc.id, ep - 1)) || null;
      const n = (cur.rerolls || 0) + 1;
      const rec = { ...W.rollDay(loc, ep, prev, 'r' + n), id: cur.id, campaignId: cur.campaignId, locationId: loc.id, rerolls: n };
      await save('weather', rec); wxIndex.set(rec.id, rec);
      toast(`New weather: ${W.describe(rec)}, ${W.fmtF(rec.low)} to ${W.fmtF(rec.high)}.`); break;
    }
    case 'wx-set': openWxSet(); return;
    // ----- survival
    case 'cond-inc': case 'cond-dec': {
      const k = b.closest('[data-k]').dataset.k, sv = surv(pc);
      sv[k] = Math.max(0, Math.min(6, sv[k] + (act === 'cond-inc' ? 1 : -1))); refreshFlags(pc); await save('pcs', pc); break;
    }
    case 'supplies': { const c = campaign(); c.supplies = b.dataset.v; if (c.supplies === 'plentiful') c.mealPending = null; await save('campaigns', c); break; }
    case 'sleep-good': case 'sleep-bad': {
      for (const p of activePcs()) { const sv = surv(p); sv.fatigue = Math.max(0, sv.fatigue - (act === 'sleep-good' ? 3 : 1)); restClear(p); await save('pcs', p); }
      toast(act === 'sleep-good' ? 'Everyone slept well: −3 fatigue.' : 'A disturbed night: −1 fatigue.'); break;
    }
    case 'short-rest': for (const p of activePcs()) { restClear(p); await save('pcs', p); } toast('Short rest: exhaustion from conditions that are better now is gone.'); break;
    case 'ration': { const sv = surv(pc); sv[b.dataset.r] = Math.max(0, sv[b.dataset.r] + +b.dataset.d); await save('pcs', pc); break; }
    case 'ration-all': for (const p of activePcs()) { const sv = surv(p); sv.food += 2; sv.water += 2; await save('pcs', p); } toast('Everyone got 2 rations of food and 2 of water.'); break;
    case 'meal-eat': {
      for (const p of activePcs()) {
        const sv = surv(p);
        if (document.querySelector(`[data-meal="food"][data-pc="${p.id}"]`)?.checked && sv.food > 0) { sv.food--; sv.hunger = Math.max(0, sv.hunger - 1); }
        if (document.querySelector(`[data-meal="water"][data-pc="${p.id}"]`)?.checked && sv.water > 0) { sv.water--; sv.thirst = Math.max(0, sv.thirst - 1); }
        await save('pcs', p);
      }
      const c = campaign(); c.mealPending = null; await save('campaigns', c); break;
    }
    case 'meal-skip': { const c = campaign(); c.mealPending = null; await save('campaigns', c); break; }
    case 'gear': openGear(pc); return;
    case 'stamina': openStamina(pc); return;
    // ----- diseases
    case 'exposure': openExposure(); return;
    case 'case-check': openCheck(caseOf(b)); return;
    case 'case-bedrest': { const cs = caseOf(b); cs.bedRest = !cs.bedRest; await save('cases', cs); break; }
    case 'case-magic': openMagic(caseOf(b)); return;
    case 'case-relapse': {
      const cs = caseOf(b); cs.state = 'sick'; cs.log.push({ at: now(), kind: 'relapse', stage: cs.stage });
      await save('cases', cs); toast('Relapse: it stops getting better, and the next check is rolled as normal.'); break;
    }
    case 'case-died': {
      const cs = caseOf(b), pcx = state.pcs.find(p => p.id === cs.pcId), d = disById(cs.diseaseId);
      cs.state = 'ended'; cs.log.push({ at: now(), kind: 'died', stage: cs.stage }); await save('cases', cs);
      openDeath(pcx); $('#deathForm').note.value = `Died of ${d?.name || 'disease'}`; return;
    }
    case 'case-remove': {
      if (!(await confirmBox('Remove this case?', 'Use this to fix a mistake. It disappears from the list and the party table.', 'Remove'))) return;
      const cs = caseOf(b); cs.deleted = true; await save('cases', cs); break;
    }
    case 'outbreak-new': openOutbreak(); return;
    case 'outbreak-end': { const o = state.outbreaks.find(x => x.id === b.closest('[data-ob]').dataset.ob); o.endedAt = now(); await save('outbreaks', o); break; }
    case 'outbreak-del': { const o = state.outbreaks.find(x => x.id === b.closest('[data-ob]').dataset.ob); o.deleted = true; await save('outbreaks', o); break; }
    case 'disease-new': openDisease(null); return;
    case 'disease-edit': openDisease(disById(b.closest('[data-dis]').dataset.dis)); return;
    default: return;
  }
  render();
});

$('#view').addEventListener('input', e => {
  const t = e.target;
  if (t.matches('textarea.grow')) autoGrow(t);
  if (t.id === 'searchInput') {
    state.query = t.value;
    const pos = t.selectionStart;
    $('#view').innerHTML = viewHistory();
    const n = $('#searchInput'); n.focus(); n.setSelectionRange(pos, pos);
    return;
  }
  const s = curSession();
  if (t.dataset.field && s) {
    if (t.dataset.field === 'notes' || t.dataset.field === 'shopping') { s[t.dataset.field] = t.value; saveSoon('sessions', s); }
  }
});

$('#view').addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.actChange === 'sheltered') { const c = campaign(); c.sheltered = t.checked; await save('campaigns', c); render(); return; }
  const s = curSession();
  if (t.dataset.field === 'number' && s) { s.number = Math.max(1, +t.value || s.number); await save('sessions', s); render(); return; }
  if (t.dataset.field === 'realDate' && s) { s.realDate = t.value; await save('sessions', s); return; }
  if (t.dataset.stat) {
    const pc = state.pcs.find(p => p.id === t.closest('[data-pc]').dataset.pc);
    pc[t.dataset.stat] = t.value === '' ? null : Math.max(0, +t.value);
    await save('pcs', pc);
  }
});

// Header
$('#wxBtn').addEventListener('click', () => { if (!hereLoc()) { openLocPicker(); return; } state.view = 'world'; render(); window.scrollTo(0, 0); });
$('#clockBtn').addEventListener('click', () => {
  $('#timeNow').innerHTML = timeNowHTML();
  $('#timePicker').innerHTML = pickerHTML('tp', now());
  $('#timeDlg').showModal();
});
$('#timeDlg').addEventListener('click', async e => {
  const b = e.target.closest('[data-adv]'); if (!b) return;
  const v = b.dataset.adv;
  if (v === 'dawn') { const d = C.fromMinutes(now()); let t = d.epoch * C.DAY + 360; if (t <= now()) t += C.DAY; await setTime(t); }
  else await setTime(now() + +v, { longRest: v === '480' });
  $('#timePicker').innerHTML = pickerHTML('tp', now());
});
$('#timeSetBtn').addEventListener('click', async () => { await setTime(readPicker('tp')); toast('In-game date set.'); });

// Settings
function openSettings() {
  const sel = $('#campaignSel');
  sel.innerHTML = state.campaigns.filter(c => !c.deleted).map(c => `<option value="${c.id}" ${c.id === state.campaignId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('#campaignName').value = campaign().name;
  $('#survivalToggle').checked = survivalOn();
  applyTheme(themePref);
  let last = null; try { last = localStorage.getItem('sn-lastBackup'); } catch (_) {}
  $('#lastBackup').textContent = last ? `Last backup saved ${new Date(+last).toLocaleString()}.` : 'No backup saved from this device yet.';
  navigator.storage?.estimate?.().then(({ usage }) => { $('#storageInfo').textContent = `Version ${APP_VERSION}. Using ${(usage / 1048576).toFixed(1)} MB on this device.`; })
    .catch(() => { $('#storageInfo').textContent = `Version ${APP_VERSION}.`; });
  $('#settingsDlg').showModal();
}
$('#settingsBtn').addEventListener('click', openSettings);
$('#campaignBtn').addEventListener('click', openSettings);
$('#campaignSel').addEventListener('change', async e => {
  state.campaignId = e.target.value; await db.setMeta('campaignId', state.campaignId);
  state.sessionId = null; state.calMonth = null; state.calDay = null;
  $('#campaignName').value = campaign().name; render();
});
$('#campaignName').addEventListener('change', async e => {
  const c = campaign(); c.name = e.target.value.trim() || c.name; await save('campaigns', c); openSettings(); renderHeader();
});
$('#survivalToggle').addEventListener('change', async e => { const c = campaign(); c.survivalOn = e.target.checked; await save('campaigns', c); render(); });
$('#newCampaignBtn').addEventListener('click', async () => {
  const c = { id: uid(), name: 'New campaign', current: now(), createdAt: Date.now() };
  await save('campaigns', c); state.campaignId = c.id; await db.setMeta('campaignId', c.id);
  state.sessionId = null; state.calMonth = null; openSettings(); render();
  toast('New campaign created. It starts on the same in-game date; change it from the clock.');
});
$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme]'); if (!b) return;
  themePref = b.dataset.theme; try { localStorage.setItem('sn-theme', themePref); } catch (_) {}
  applyTheme(themePref); render();
});

// Everything worth carrying between devices (the backup file and the Drive sync file are the same thing).
async function buildBackupData() {
  const data = { app: 'session-notes', version: 1, exported: new Date().toISOString() };
  for (const s of STORES) data[s] = await db.all(s);
  return data;
}

// Merge another device's data in; the newest edit of each record wins. Returns a short summary.
async function mergeBackupData(data) {
  if (data?.app !== 'session-notes') throw new Error('not ours');
  flushSaves();
  // A brand-new device still has the untouched starter campaign: drop it so the party isn't duplicated.
  const starter = state.campaigns.find(c => c.seed && !state.sessions.some(x => x.campaignId === c.id));
  let switched = false;
  if (starter && (data.campaigns || []).length && !data.campaigns.some(c => c.id === starter.id)) {
    for (const pc of state.pcs.filter(x => x.campaignId === starter.id)) await db.del('pcs', pc.id);
    await db.del('campaigns', starter.id);
    const keep = data.campaigns.find(c => !c.deleted && !c.seed) || data.campaigns[0];
    await db.setMeta('campaignId', keep.id);
    switched = true;
  }
  let added = 0, updated = 0;
  for (const s of STORES) {
    for (const rec of data[s] || []) {
      if (!rec?.id) continue;
      const cur = await db.get(s, rec.id);
      if (!cur) { await db.put(s, rec); added++; } else if ((rec.updatedAt || 0) > (cur.updatedAt || 0)) { await db.put(s, rec); updated++; }
    }
  }
  const changed = switched || added > 0 || updated > 0;
  if (changed) {
    await load();
    indexWeather();
    if (!state.sessions.some(x => x.id === state.sessionId && !x.deleted && x.campaignId === state.campaignId)) state.sessionId = latestSession()?.id || null;
    refreshAfterSync();
  }
  const parts = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} updated`);
  return { changed, parts: parts.length ? parts : ['party set up from your other device'] };
}

// Don't yank the page out from under the pen: if you're writing, refresh once you stop.
let refreshPending = false;
function refreshAfterSync() {
  const a = document.activeElement;
  const busy = !$('#inkView').hidden || (a && $('#view').contains(a) && a.matches('input, textarea, select'));
  if (busy) { refreshPending = true; renderHeader(); return; }
  refreshPending = false; render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (refreshPending && !(a && $('#view').contains(a) && a.matches('input, textarea, select')) && $('#inkView').hidden) { refreshPending = false; render(); }
}, 50));

$('#saveBackupBtn').addEventListener('click', async () => {
  const data = await buildBackupData();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `session-notes-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { localStorage.setItem('sn-lastBackup', String(Date.now())); } catch (_) {}
  openSettings(); toast('Backup file saved to your downloads.');
});
$('#loadBackupBtn').addEventListener('click', () => $('#backupFile').click());
$('#backupFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (_) { return toast("That file isn't a Session Notes backup."); }
  try {
    const r = await mergeBackupData(data);
    render();
    toast(r.changed ? `Backup loaded: ${r.parts.join(', ')}.` : 'Backup loaded: everything was already up to date.');
  } catch (_) { toast("That file isn't a Session Notes backup."); }
});

// Never lose the last few words: save right away when the app is switched away or closed.
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSaves(); });
window.addEventListener('pagehide', flushSaves);

// ---------- app updates: restart into the new version, but never in the middle of writing
function updateReady() {
  flushSaves();
  const a = document.activeElement;
  const busy = !$('#inkView').hidden || (a && a.matches && a.matches('input, textarea, select')) || document.querySelector('dialog[open]');
  if (!busy) { toast('Updating to the new version…'); setTimeout(() => location.reload(), 900); return; }
  const bar = $('#updateBar');
  bar.hidden = false;
  bar.querySelector('button').onclick = () => { flushSaves(); setTimeout(() => location.reload(), 300); };
}

// ---------- boot
(async function boot() {
  await load();
  indexWeather();
  await processCases();
  state.sessionId = latestSession()?.id || null;
  render();
  initSync({ toast, build: buildBackupData, merge: mergeBackupData });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; } // first install, nothing to refresh
      updateReady();
    });
  }
})();
