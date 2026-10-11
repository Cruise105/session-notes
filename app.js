import { db, uid, STORES } from './db.js';
import * as C from './calendar.js';
import { openInkEditor, renderThumb } from './ink.js';

const APP_VERSION = '1.0.0';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtReal = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const state = {
  campaigns: [], pcs: [], sessions: [], ink: [],
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
  const c = { id: cid, name: 'Rime of the Frostmaiden', current: C.toMinutes({ year: 301, month: 6, day: 3, hour: 8 }), createdAt: Date.now(), seed: true };
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
  const [campaigns, pcs, sessions, ink] = await Promise.all(STORES.map(s => db.all(s)));
  Object.assign(state, { campaigns, pcs, sessions, ink });
  if (!campaigns.filter(c => !c.deleted).length) { await seed(); }
  state.campaignId = (await db.getMeta('campaignId')) || state.campaigns[0].id;
  if (!campaign()) state.campaignId = state.campaigns.find(c => !c.deleted).id;
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

    <section class="card">
      <h2>Party</h2>
      <div class="table-wrap"><table class="party">
        <thead><tr><th>PC</th><th>Max HP</th><th>AC</th><th>Pass. Perc.</th><th>Deaths</th><th>Favor of Fate</th></tr></thead>
        <tbody>${rows.map(({ pc, v }) => `<tr data-pc="${pc?.id || ''}">
          <th scope="row"><span class="pc-name">${esc(v.name ?? pc?.name)}</span><span class="pc-sub">${esc(pc?.classes || '')}</span></th>
          ${['maxHp', 'ac', 'pp'].map(k => `<td>${open && pc
            ? `<input class="cell-input" type="number" inputmode="numeric" data-stat="${k}" value="${v[k] ?? ''}" placeholder="—" aria-label="${k}">`
            : `<span class="cell-val">${v[k] ?? '—'}</span>`}</td>`).join('')}
          <td><span class="deaths">${open && pc ? pc.deaths.length : (v.deaths ?? 0)}</span>${open && pc ? `<button class="mini-btn" data-act="death" title="Log a death" aria-label="Log a death for ${esc(pc.name)}">+</button>` : ''}</td>
          <td>${open && pc ? favorBadge(pc) : (v.favorSpent ? '<span class="badge spent">Spent</span>' : '<span class="badge avail">Available</span>')}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="muted">No active characters. Add them on the Party tab.</td></tr>`}</tbody>
      </table></div>
      ${open ? '' : '<p class="muted small">Stats as they were when this session ended.</p>'}
    </section>

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
  const s = { id: uid(), campaignId: state.campaignId, number, realDate: todayISO(), startAt: now(), endAt: null,
    party: snapshotParty(), notes: '', shopping: '', inkIds: [], createdAt: Date.now() };
  await save('sessions', s);
  state.sessionId = s.id;
}
function snapshotParty() {
  return activePcs().map(p => ({ pcId: p.id, name: p.name, maxHp: p.maxHp, ac: p.ac, pp: p.pp, deaths: p.deaths.length, favorSpent: !!p.favor?.spent }));
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
  for (const k of ['name', 'ancestry', 'classes', 'player', 'maxHp', 'ac', 'pp']) f[k].value = pc?.[k] ?? '';
  $('#pcDlg').returnValue = '';
  $('#pcDlg').showModal();
}
$('#pcDlg').addEventListener('close', async () => {
  if ($('#pcDlg').returnValue !== 'save') return;
  const f = $('#pcForm');
  const pc = editPc || newPc({});
  for (const k of ['name', 'ancestry', 'classes', 'player']) pc[k] = f[k].value.trim();
  for (const k of ['maxHp', 'ac', 'pp']) pc[k] = f[k].value === '' ? null : +f[k].value;
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

async function setTime(t) {
  const c = campaign(); c.current = Math.max(0, t); await save('campaigns', c);
  renderHeader(); $('#timeNow').innerHTML = timeNowHTML();
  if (state.view === 'session' || state.view === 'calendar') render();
}
function timeNowHTML() {
  const t = now(), d = C.fromMinutes(t);
  return `<div class="tn-date">${esc(C.fmtDate(t))}</div><div class="tn-time">${esc(C.fmtTime(t))} · ${C.seasonOf(d.month, d.day)}</div>
    <div class="tn-moons">${C.CAL.moons.map(m => `<span>${moonSVG(m, d.epoch, 22)} ${esc(m.name)}: ${C.moonPhase(m, d.epoch).name}</span>`).join('')}</div>
    ${C.eventsOn(d.month, d.day).map(e => `<div class="tn-ev">${esc(e.label)}</div>`).join('')}`;
}

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
$('#clockBtn').addEventListener('click', () => {
  $('#timeNow').innerHTML = timeNowHTML();
  $('#timePicker').innerHTML = pickerHTML('tp', now());
  $('#timeDlg').showModal();
});
$('#timeDlg').addEventListener('click', async e => {
  const b = e.target.closest('[data-adv]'); if (!b) return;
  const v = b.dataset.adv;
  if (v === 'dawn') { const d = C.fromMinutes(now()); let t = d.epoch * C.DAY + 360; if (t <= now()) t += C.DAY; await setTime(t); }
  else await setTime(now() + +v);
  $('#timePicker').innerHTML = pickerHTML('tp', now());
});
$('#timeSetBtn').addEventListener('click', async () => { await setTime(readPicker('tp')); toast('In-game date set.'); });

// Settings
function openSettings() {
  const sel = $('#campaignSel');
  sel.innerHTML = state.campaigns.filter(c => !c.deleted).map(c => `<option value="${c.id}" ${c.id === state.campaignId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('#campaignName').value = campaign().name;
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

$('#saveBackupBtn').addEventListener('click', async () => {
  const data = { app: 'session-notes', version: 1, exported: new Date().toISOString(), campaignId: state.campaignId };
  for (const s of STORES) data[s] = await db.all(s);
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
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'session-notes') throw new Error('not ours');
    // A brand-new device still has the untouched starter campaign: drop it so the party isn't duplicated.
    const starter = state.campaigns.find(c => c.seed && !state.sessions.some(x => x.campaignId === c.id));
    if (starter && (data.campaigns || []).length && !(data.campaigns || []).some(c => c.id === starter.id)) {
      for (const pc of state.pcs.filter(x => x.campaignId === starter.id)) await db.del('pcs', pc.id);
      await db.del('campaigns', starter.id);
      await db.setMeta('campaignId', data.campaignId || data.campaigns[0].id);
    }
    let added = 0, updated = 0;
    for (const s of STORES) {
      for (const rec of data[s] || []) {
        const cur = await db.get(s, rec.id);
        if (!cur) { await db.put(s, rec); added++; } else if ((rec.updatedAt || 0) > (cur.updatedAt || 0)) { await db.put(s, rec); updated++; }
      }
    }
    await load(); render();
    toast(`Backup loaded: ${added} added, ${updated} updated.`);
  } catch (err) { toast("That file isn't a Session Notes backup."); }
});

// Never lose the last few words: save right away when the app is switched away or closed.
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSaves(); });
window.addEventListener('pagehide', flushSaves);

// ---------- boot
(async function boot() {
  await load();
  state.sessionId = latestSession()?.id || null;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
