# Cisco Musky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline iPhone web app that is the musky expert for the Cisco Chain: lessons, lake facts, a planner with reasons, and a veteran-standard trip log, published tomorrow.

**Architecture:** One static page, plain ES modules, JSON content, a service worker that precaches everything, IndexedDB for the log. A rule engine reads pattern data and ranks windows, spots, and lures with readable reasons. Spots never enter the repo; they arrive on the phone as a file.

**Tech Stack:** HTML, CSS, JavaScript ES modules. suncalc 2.1.0 vendored (BSD-2). Open-Meteo and NWS APIs. Node 22 `node --test` for tests. GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-01-cisco-musky-design.md`

## Global Constraints

- No framework, no bundler, no npm dependencies. `package.json` exists only for `"type": "module"` and the test script.
- Target: iPhone Safari, installed to the home screen. Everything must work with the network off after first load.
- Vendored library: suncalc at commit `ecb6bb0b0f3a5003298cfb536e46176117caf4e5`, file `index.js`, sha256 `65169cd1f50e6d1020d0672778fb544ebd2b799d5dc1d5fe90054e7392a27eda`, with its LICENSE.
- Units: °F, mph, feet, inches. Pressure shown in inHg, stored in hPa. Timezone `America/Chicago`.
- Chain center `lat 46.22, lon -89.41`. Bounding box `lat 46.15 to 46.30, lon -89.50 to -89.33`.
- Privacy: `private/` is gitignored. No file under `content/` may contain a spot location. Repo name `fieldbook`, description "Offline fishing planner".
- Every chain fact in content carries `sources: [id]` into `content/sources.json`, or the text says "reasoning, not sourced".
- Two voices everywhere: `pro` and `yourJob`.
- Rules in the app: Michigan inland musky 42", 1 per license year, register within 24 h, catch-and-release all year, possession first Saturday in June to March 15. Boundary lakes Big, Mamie, West Bay: 50", first Saturday in June to December 31. Never show 46".
- Commit after every task with `scripts/precache.js` run first once it exists.

## Review Focus

1. The DST change on 2026-11-01: the local day is 25 hours. Windows and moon events must not be duplicated or skipped. Test in Task 2.
2. Water temperature typed as Celsius or nonsense (12, 212): the planner must refuse values outside 32 to 90 °F and say why. Test in Task 8.
3. Open-Meteo hourly arrays with `null` holes: pressure trend and front detection must skip nulls, never produce NaN. Test in Task 3.
4. Importing a spots pack when the user already edited a seeded spot: user edits must survive. Test in Task 10.
5. A trip where "Here" was never tapped: rates must still compute per hour using trip duration, not divide by zero. Test in Task 9.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | `"type": "module"`, `npm test` runs `node --test test/` |
| `.gitignore` | `private/`, `.DS_Store` |
| `index.html` | shell: header, five tabs, `<main id="view">`, update banner, loads `js/app.js` |
| `manifest.webmanifest` | name, short name, icons, `display: standalone`, `start_url: ./` |
| `css/app.css` | layout, large tap targets, sunlight contrast, dark mode |
| `js/ui/dom.js` | `h(tag, attrs, ...children)` element helper, `clear(el)` |
| `js/app.js` | hash router, tab nav, content load, update banner, service worker registration |
| `js/vendor/suncalc.js` | vendored ES module |
| `js/vendor/LICENSE-suncalc` | BSD-2 license text |
| `js/astro.js` | timezone helpers, sun and moon times, windows, nearest moon event |
| `js/weather.js` | Open-Meteo URL and parser, NWS parser, pressure trend, front detection, conditions at a time |
| `js/store.js` | storage adapter interface, memory adapter, IndexedDB adapter |
| `js/content.js` | load content JSON, index it, validate it |
| `js/engine.js` | pattern matching and ranking |
| `js/log.js` | trips, events, snapshots, effort, rates, verification |
| `js/export.js` | backup JSON, Lunge Log CSV, events CSV, import of backup and spots pack |
| `js/photos.js` | camera capture, downscale, store |
| `js/ui/plan.js` | plan view |
| `js/ui/trip.js` | trip and event views |
| `js/ui/learn.js` | lessons and lakes views |
| `js/ui/settings.js` | settings, export, import, storage |
| `js/precache-manifest.js` | generated: `PRECACHE` array and `VERSION` |
| `scripts/precache.js` | regenerates the manifest from the tree |
| `sw.js` | precache on install, cache-first for app, network-first for weather |
| `content/sources.json` | every cited source |
| `content/rules.json` | rulebooks and lake-to-rulebook map |
| `content/lakes.json` | 15 lake records |
| `content/spot-types.json` | structure vocabulary |
| `content/lures.json` | lure catalog |
| `content/patterns.json` | planner rules |
| `content/lessons.json` | 12 chapters |
| `maps/<lake>.jpg` | DNR depth maps, downscaled |
| `private/spots-seed.json` | seeded spots, never committed |
| `test/*.test.js` | one test file per module |

---

### Task 1: Scaffold and DOM helper

**Files:**
- Create: `package.json`, `.gitignore`, `index.html`, `manifest.webmanifest`, `css/app.css`, `js/ui/dom.js`, `js/app.js`
- Test: `test/dom.test.js`

**Interfaces:**
- Produces: `h(tag, attrs = {}, ...children) → HTMLElement` where `attrs` keys are attributes, `on*` keys are listeners, `class` is a string; children may be strings, nodes, arrays, or null. `clear(el)` removes all children. `app.js` exposes `window.app = { navigate(hash), content, db }` after load.

- [ ] **Step 1: Write the failing test**

`test/dom.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-in so dom.js can be tested without a browser.
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.textContent = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  appendChild(c) { this.children.push(c); return c; }
  get firstChild() { return this.children[0] || null; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); }
}
globalThis.document = {
  createElement: t => new El(t),
  createTextNode: s => ({ nodeType: 3, textContent: String(s) }),
};
const { h, clear } = await import('../js/ui/dom.js');

test('h builds an element with attrs, listeners, and nested children', () => {
  let clicked = false;
  const el = h('div', { class: 'row', 'data-id': 7, onclick: () => { clicked = true; } },
    'text', null, [h('span', {}, 'a'), h('span', {}, 'b')]);
  assert.equal(el.tagName, 'DIV');
  assert.equal(el.attrs.class, 'row');
  assert.equal(el.attrs['data-id'], '7');
  assert.equal(el.children.length, 3);
  assert.equal(el.children[0].textContent, 'text');
  assert.equal(el.children[1].tagName, 'SPAN');
  el.listeners.click();
  assert.equal(clicked, true);
});

test('clear removes every child', () => {
  const el = h('ul', {}, h('li'), h('li'));
  clear(el);
  assert.equal(el.children.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/dom.test.js`
Expected: FAIL, cannot find module `../js/ui/dom.js`

- [ ] **Step 3: Write the scaffold**

`package.json`:
```json
{
  "name": "fieldbook",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "precache": "node scripts/precache.js"
  }
}
```

`.gitignore`:
```
private/
.DS_Store
```

`js/ui/dom.js`:
```js
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    el.appendChild(typeof c === 'object' && 'tagName' in c ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0b2a1f">
<title>Cisco Musky</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<div id="banner" class="banner" hidden>New version ready. <button id="reload">Reload</button></div>
<header class="top"><h1>Cisco Musky</h1><span id="status" class="status"></span></header>
<main id="view" class="view"></main>
<nav class="tabs">
  <a href="#plan">Plan</a>
  <a href="#trip">Trip</a>
  <a href="#learn">Learn</a>
  <a href="#lakes">Lakes</a>
  <a href="#settings">Settings</a>
</nav>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

`manifest.webmanifest`:
```json
{
  "name": "Cisco Musky",
  "short_name": "Musky",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0b2a1f",
  "theme_color": "#0b2a1f",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Icons: make three PNGs with a short script, no design tool needed:
```bash
mkdir -p icons && node -e '
const { createCanvas } = (()=>{ throw new Error("no canvas in node") })();
' 2>/dev/null || true
# Use sips (macOS) to rasterize an SVG:
cat > icons/icon.svg <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0b2a1f"/><path d="M80 300 Q256 120 432 300 L400 330 Q256 200 112 330 Z" fill="#9fd3b1"/><circle cx="380" cy="270" r="12" fill="#0b2a1f"/></svg>
SVG
for s in 180 192 512; do sips -s format png -z $s $s icons/icon.svg --out icons/icon-$s.png >/dev/null; done
ls icons
```
If `sips` cannot read SVG on this macOS, open `icons/icon.svg` in Safari, screenshot, and export the three sizes with Preview. Any square PNG works.

`css/app.css`:
```css
:root { --bg:#0b2a1f; --fg:#f2f7f3; --card:#133d2d; --muted:#9fb8aa; --accent:#f5c542; --danger:#ff6b6b; --tap:56px; }
@media (prefers-color-scheme: light) { :root { --bg:#f4f7f4; --fg:#0b2a1f; --card:#ffffff; --muted:#4d6b5c; } }
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg); color:var(--fg); font:17px/1.4 -apple-system, system-ui, sans-serif; -webkit-text-size-adjust:100%; }
.top { display:flex; justify-content:space-between; align-items:center; padding:max(12px, env(safe-area-inset-top)) 16px 8px; }
.top h1 { font-size:20px; margin:0; }
.status { font-size:13px; color:var(--muted); }
.view { padding:0 16px calc(var(--tap) + 24px + env(safe-area-inset-bottom)); }
.tabs { position:fixed; bottom:0; left:0; right:0; display:flex; background:var(--card); padding-bottom:env(safe-area-inset-bottom); border-top:1px solid rgba(255,255,255,.08); }
.tabs a { flex:1; text-align:center; padding:14px 0; min-height:var(--tap); color:var(--muted); text-decoration:none; font-weight:600; }
.tabs a.active { color:var(--accent); }
.card { background:var(--card); border-radius:14px; padding:14px 16px; margin:12px 0; }
.card h2, .card h3 { margin:0 0 8px; font-size:18px; }
.reason { color:var(--muted); font-size:15px; margin:4px 0; }
.job { color:var(--accent); font-size:15px; margin:4px 0; }
button, .btn { min-height:var(--tap); font-size:18px; font-weight:700; border:0; border-radius:12px; padding:12px 18px; background:var(--accent); color:#000; width:100%; margin:6px 0; }
button.secondary { background:var(--card); color:var(--fg); border:1px solid var(--muted); }
button.danger { background:var(--danger); color:#000; }
label { display:block; margin:10px 0 4px; color:var(--muted); font-size:14px; }
input, select, textarea { width:100%; min-height:48px; font-size:18px; padding:10px 12px; border-radius:10px; border:1px solid var(--muted); background:var(--bg); color:var(--fg); }
textarea { min-height:96px; }
.row { display:flex; gap:10px; }
.row > * { flex:1; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.banner { background:var(--accent); color:#000; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; }
.banner button { width:auto; min-height:40px; margin:0; background:#000; color:var(--accent); }
.badge { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.12); color:var(--muted); margin-left:6px; }
.badge.warn { background:rgba(255,107,107,.2); color:var(--danger); }
.big { font-size:26px; font-weight:800; }
.unverified { border-left:4px solid var(--danger); }
.verified { border-left:4px solid var(--accent); }
```

`js/app.js` (minimal for this task; later tasks replace the view functions):
```js
import { h, clear } from './ui/dom.js';

const views = {
  plan: () => h('div', { class: 'card' }, h('h2', {}, 'Plan'), h('p', {}, 'Planner arrives in Task 11.')),
  trip: () => h('div', { class: 'card' }, h('h2', {}, 'Trip')),
  learn: () => h('div', { class: 'card' }, h('h2', {}, 'Learn')),
  lakes: () => h('div', { class: 'card' }, h('h2', {}, 'Lakes')),
  settings: () => h('div', { class: 'card' }, h('h2', {}, 'Settings')),
};

export function navigate(hash) {
  const name = (hash || '#plan').replace('#', '').split('/')[0] || 'plan';
  const view = document.getElementById('view');
  clear(view);
  view.appendChild((views[name] || views.plan)());
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + name));
}

window.addEventListener('hashchange', () => navigate(location.hash));
navigate(location.hash);
window.app = { navigate, views };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/dom.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Open the shell in a browser and check the tabs**

Run: `python3 -m http.server 8140 --directory . >/dev/null 2>&1 &` then open `http://localhost:8140/` in the in-app browser. Tap each tab. Expected: the heading changes, the active tab turns gold, no console errors. Stop the server afterward: `kill %1`.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore index.html manifest.webmanifest css/app.css js/ui/dom.js js/app.js icons test/dom.test.js
git commit -m "feat: app shell, manifest, styles, DOM helper"
```

### Task 2: Astronomy: sun, moon, windows

**Files:**
- Create: `js/vendor/suncalc.js`, `js/vendor/LICENSE-suncalc`, `js/astro.js`
- Test: `test/astro.test.js`

**Interfaces:**
- Produces:
  - `CHAIN = { lat: 46.22, lon: -89.41, tz: 'America/Chicago' }`
  - `tzOffsetMinutes(date: Date, tz = CHAIN.tz) → number` minutes east of UTC (CDT -300, CST -360)
  - `localDayBounds(date, tz) → { start: Date, end: Date, ymd: 'YYYY-MM-DD' }` local calendar day
  - `fmtTime(date, tz) → 'h:mm am'`
  - `sunTimes(date, lat, lon, tz) → { dawn, sunrise, sunset, dusk, solarNoon }` Dates or null
  - `moonPhase(date) → { phase, fraction, name, waxing }`
  - `moonEvents(date, lat, lon, tz) → [{ kind: 'moonrise'|'moonset'|'overhead'|'underfoot', at: Date }]` sorted, for the local day
  - `windows(date, lat, lon, tz) → [{ kind: 'dawn'|'dusk'|'major'|'minor', label, anchor: Date, start: Date, end: Date }]` sorted by start
  - `nearestMoonEvent(at, lat, lon, tz) → { kind, at, minutes }` signed minutes from the event to `at`, searching the day before and after too

- [ ] **Step 1: Vendor suncalc at the pinned commit and verify the hash**

```bash
mkdir -p js/vendor
gh api "repos/mourner/suncalc/contents/index.js?ref=ecb6bb0b0f3a5003298cfb536e46176117caf4e5" -H 'Accept: application/vnd.github.raw' > js/vendor/suncalc.js
gh api "repos/mourner/suncalc/contents/LICENSE?ref=ecb6bb0b0f3a5003298cfb536e46176117caf4e5" -H 'Accept: application/vnd.github.raw' > js/vendor/LICENSE-suncalc
shasum -a 256 js/vendor/suncalc.js
```
Expected hash: `65169cd1f50e6d1020d0672778fb544ebd2b799d5dc1d5fe90054e7392a27eda`. If it differs, stop and report; do not continue with an unverified file. Prepend one comment line to the file: `// suncalc 2.1.0, https://github.com/mourner/suncalc, commit ecb6bb0, BSD-2-Clause, see LICENSE-suncalc`.

- [ ] **Step 2: Write the failing test**

`test/astro.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN, tzOffsetMinutes, localDayBounds, sunTimes, moonPhase, moonEvents, windows, nearestMoonEvent, fmtTime } from '../js/astro.js';

const { lat, lon, tz } = CHAIN;
const minutesOff = (d, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const hh = +p.find(x => x.type === 'hour').value, mm = +p.find(x => x.type === 'minute').value;
  return Math.abs((hh * 60 + mm) - (h * 60 + m));
};

test('timezone offset is CDT before and CST after 2026-11-01', () => {
  assert.equal(tzOffsetMinutes(new Date('2026-10-31T17:00:00Z')), -300);
  assert.equal(tzOffsetMinutes(new Date('2026-11-01T18:00:00Z')), -360);
});

test('local day bounds on the DST change day span 25 hours', () => {
  const b = localDayBounds(new Date('2026-11-01T18:00:00Z'), tz);
  assert.equal(b.ymd, '2026-11-01');
  assert.equal((b.end - b.start) / 3600000, 25);
});

test('sunrise and sunset on 2026-10-01 match Open-Meteo within 3 minutes', () => {
  const s = sunTimes(new Date('2026-10-01T12:00:00-05:00'), lat, lon, tz);
  assert.ok(minutesOff(s.sunrise, '06:56') <= 3);
  assert.ok(minutesOff(s.sunset, '18:37') <= 3);
  assert.ok(s.dawn < s.sunrise && s.sunset < s.dusk);
});

test('moon phase names the known 2026 full and new moons', () => {
  assert.ok(moonPhase(new Date('2026-10-26T12:00:00Z')).fraction > 0.97);
  assert.equal(moonPhase(new Date('2026-10-26T12:00:00Z')).name, 'Full Moon');
  assert.ok(moonPhase(new Date('2026-10-10T12:00:00Z')).fraction < 0.03);
  assert.equal(moonPhase(new Date('2026-10-10T12:00:00Z')).name, 'New Moon');
  assert.ok(moonPhase(new Date('2026-11-24T12:00:00Z')).fraction > 0.97);
});

test('moon events on 2026-10-02 include underfoot near 6:20 pm', () => {
  const ev = moonEvents(new Date('2026-10-02T12:00:00-05:00'), lat, lon, tz);
  const kinds = ev.map(e => e.kind);
  assert.ok(kinds.includes('underfoot') && kinds.includes('moonrise') && kinds.includes('moonset'));
  const under = ev.find(e => e.kind === 'underfoot');
  assert.ok(minutesOff(under.at, '18:20') <= 5);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].at >= ev[i - 1].at);
});

test('windows are sorted, each 60 or 120 minutes, and include dawn and dusk', () => {
  const w = windows(new Date('2026-10-02T12:00:00-05:00'), lat, lon, tz);
  assert.ok(w.some(x => x.kind === 'dawn') && w.some(x => x.kind === 'dusk'));
  for (const x of w) {
    const len = (x.end - x.start) / 60000;
    assert.ok(len === 60 || len === 120, `window ${x.kind} is ${len} min`);
    assert.ok(x.label.length > 0);
  }
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].start);
});

test('windows on the DST day are not duplicated', () => {
  const w = windows(new Date('2026-11-01T18:00:00Z'), lat, lon, tz);
  const keys = w.map(x => x.kind + ':' + x.anchor.toISOString());
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(w.filter(x => x.kind === 'dawn').length, 1);
});

test('nearestMoonEvent is signed and finds events across midnight', () => {
  const at = new Date('2026-10-02T18:30:00-05:00'); // 10 min after underfoot
  const n = nearestMoonEvent(at, lat, lon, tz);
  assert.equal(n.kind, 'underfoot');
  assert.ok(n.minutes >= 5 && n.minutes <= 15, `got ${n.minutes}`);
  const late = new Date('2026-10-02T23:50:00-05:00'); // moonrise 10:18 pm this day; next day's events are also candidates
  const n2 = nearestMoonEvent(late, lat, lon, tz);
  assert.ok(Math.abs(n2.minutes) < 120);
});

test('fmtTime renders local time', () => {
  assert.equal(fmtTime(new Date('2026-10-02T23:20:00Z'), tz), '6:20 pm');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/astro.test.js`
Expected: FAIL, cannot find module `../js/astro.js`

- [ ] **Step 4: Write astro.js**

```js
import { getTimes, getMoonTimes, getMoonIllumination } from './vendor/suncalc.js';

export const CHAIN = { lat: 46.22, lon: -89.41, tz: 'America/Chicago' };
const MIN = 60000;

function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = +p.value;
  if (o.hour === 24) o.hour = 0;
  return o;
}

export function tzOffsetMinutes(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / MIN);
}

function pad(n) { return String(n).padStart(2, '0'); }

export function localDayBounds(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  const ymd = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  // local midnight: guess UTC midnight, correct by the offset at that instant, correct once more for DST edges
  let start = new Date(Date.UTC(p.year, p.month - 1, p.day));
  start = new Date(start.getTime() - tzOffsetMinutes(start, tz) * MIN);
  start = new Date(Date.UTC(p.year, p.month - 1, p.day) - tzOffsetMinutes(start, tz) * MIN);
  let end = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  end = new Date(end.getTime() - tzOffsetMinutes(end, tz) * MIN);
  end = new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - tzOffsetMinutes(end, tz) * MIN);
  return { start, end, ymd };
}

export function fmtTime(date, tz = CHAIN.tz) {
  if (!date) return '';
  const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return s.replace(' AM', ' am').replace(' PM', ' pm');
}

function noonOf(date, tz) {
  const { start } = localDayBounds(date, tz);
  return new Date(start.getTime() + 12 * 60 * MIN);
}

export function sunTimes(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const noon = noonOf(date, tz);
  const t = getTimes(noon, lat, lon, 0, tzOffsetMinutes(noon, tz));
  return { dawn: t.dawn || null, sunrise: t.sunrise || null, sunset: t.sunset || null, dusk: t.dusk || null, solarNoon: t.solarNoon || null };
}

const PHASE_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

export function moonPhase(date) {
  const i = getMoonIllumination(date);
  return { phase: i.phase, fraction: i.fraction, waxing: i.waxing, name: PHASE_NAMES[Math.round(i.phase * 8) % 8] };
}

export function moonEvents(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const noon = noonOf(date, tz);
  const m = getMoonTimes(noon, lat, lon, tzOffsetMinutes(noon, tz));
  const ev = [];
  if (m.rise) ev.push({ kind: 'moonrise', at: m.rise });
  if (m.set) ev.push({ kind: 'moonset', at: m.set });
  if (m.transit) ev.push({ kind: 'overhead', at: m.transit });
  if (m.lowerTransit) ev.push({ kind: 'underfoot', at: m.lowerTransit });
  return ev.sort((a, b) => a.at - b.at);
}

const LABEL = { moonrise: 'Moonrise', moonset: 'Moonset', overhead: 'Moon overhead', underfoot: 'Moon underfoot' };

export function windows(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const s = sunTimes(date, lat, lon, tz);
  const out = [];
  const mk = (kind, label, anchor, halfMin) => {
    if (!anchor) return;
    out.push({ kind, label, anchor, start: new Date(anchor.getTime() - halfMin * MIN), end: new Date(anchor.getTime() + halfMin * MIN) });
  };
  mk('dawn', 'Dawn', s.sunrise, 60);
  mk('dusk', 'Dusk', s.sunset, 60);
  for (const e of moonEvents(date, lat, lon, tz)) {
    if (e.kind === 'overhead' || e.kind === 'underfoot') mk('major', LABEL[e.kind] + ' (major)', e.at, 60);
    else mk('minor', LABEL[e.kind] + ' (minor)', e.at, 30);
  }
  return out.sort((a, b) => a.start - b.start);
}

export function nearestMoonEvent(at, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const day = 24 * 60 * MIN;
  const cands = [-1, 0, 1].flatMap(d => moonEvents(new Date(at.getTime() + d * day), lat, lon, tz));
  const seen = new Set();
  let best = null;
  for (const e of cands) {
    const key = e.kind + e.at.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    const minutes = Math.round((at - e.at) / MIN);
    if (!best || Math.abs(minutes) < Math.abs(best.minutes)) best = { kind: e.kind, at: e.at, minutes };
  }
  return best;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/astro.test.js`
Expected: PASS, 9 tests. If `windows on the DST day` fails with a duplicate dawn, the cause is `noonOf` landing on the wrong day; check `localDayBounds` with `console.log` for 2026-11-01 and confirm `start` is `2026-11-01T05:00:00Z` and `end` is `2026-11-02T06:00:00Z`.

- [ ] **Step 6: Commit**

```bash
git add js/vendor js/astro.js test/astro.test.js
git commit -m "feat: astronomy with vendored suncalc, windows, nearest moon event"
```

### Task 3: Weather: Open-Meteo, NWS fallback, pressure trend, fronts

**Files:**
- Create: `js/weather.js`
- Test: `test/weather.test.js`

**Interfaces:**
- Produces:
  - `buildForecastUrl({ lat, lon, pastDays = 2, forecastDays = 3 }) → string`
  - `parseOpenMeteo(json) → Forecast` where `Forecast = { source, fetchedAt: ISO string, hourly: Hour[] }` and `Hour = { time: 'YYYY-MM-DDTHH:MM' local, tempF, pressureHpa, windMph, windDir, gustMph, cloudPct, precipIn, code }`, any field may be `null`
  - `parseNws(json) → Forecast` with `pressureHpa: null`
  - `pressureTrend(hourly, timeIso, hours = 3) → { deltaHpa: number|null, label: 'falling'|'steady'|'rising'|'unknown' }`
  - `hoursSinceFront(hourly, timeIso) → number|null`
  - `conditionsAt(forecast, timeIso) → Conditions` where `Conditions = { tempF, pressureHpa, pressureInHg, trend, windMph, windDir, windCompass, gustMph, cloudPct, sky: 'sun'|'partly'|'overcast', precipIn, hoursSinceFront, forecastAgeMin }`
  - `hpaToInHg(hpa) → number`, `degToCompass(deg) → string`
  - `fetchForecast(fetchFn, { lat, lon }) → Promise<Forecast>` tries Open-Meteo then NWS, throws if both fail
  - `NWS_HOURLY_URL = 'https://api.weather.gov/gridpoints/MQT/86,54/forecast/hourly'`

- [ ] **Step 1: Write the failing test**

`test/weather.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastUrl, parseOpenMeteo, parseNws, pressureTrend, hoursSinceFront, conditionsAt, hpaToInHg, degToCompass, fetchForecast } from '../js/weather.js';

const times = [];
for (let h = 0; h < 48; h++) times.push(`2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00`);
const fixture = {
  timezone: 'America/Chicago',
  hourly: {
    time: times,
    temperature_2m: times.map((_, i) => 60 + (i % 10)),
    pressure_msl: times.map((_, i) => i < 24 ? 1012 - i * 0.5 : 1000 + (i - 24) * 0.6), // falls 12 hPa over day 1, rises on day 2
    surface_pressure: times.map(() => 990),
    wind_speed_10m: times.map((_, i) => 5 + (i % 7)),
    wind_direction_10m: times.map((_, i) => (i * 15) % 360),
    wind_gusts_10m: times.map((_, i) => 8 + (i % 7)),
    cloud_cover: times.map((_, i) => (i * 10) % 101),
    precipitation: times.map(() => 0),
    weather_code: times.map(() => 1),
  },
};

test('buildForecastUrl asks for the fields the planner needs, in US units', () => {
  const u = buildForecastUrl({ lat: 46.22, lon: -89.41 });
  for (const k of ['latitude=46.22', 'longitude=-89.41', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cloud_cover', 'precipitation', 'weather_code', 'temperature_2m', 'past_days=2', 'forecast_days=3', 'timezone=America%2FChicago', 'wind_speed_unit=mph', 'temperature_unit=fahrenheit', 'precipitation_unit=inch']) {
    assert.ok(u.includes(k), 'missing ' + k);
  }
});

test('parseOpenMeteo normalizes hourly rows', () => {
  const f = parseOpenMeteo(fixture);
  assert.equal(f.source, 'open-meteo');
  assert.equal(f.hourly.length, 48);
  assert.equal(f.hourly[0].time, '2026-10-01T00:00');
  assert.equal(f.hourly[0].pressureHpa, 1012);
  assert.equal(f.hourly[3].windMph, 8);
  assert.ok(typeof f.fetchedAt === 'string');
});

test('pressureTrend labels falling, rising, steady, and unknown', () => {
  const f = parseOpenMeteo(fixture);
  assert.equal(pressureTrend(f.hourly, '2026-10-01T12:00').label, 'falling');
  assert.equal(pressureTrend(f.hourly, '2026-10-02T12:00').label, 'rising');
  const flat = f.hourly.map(h => ({ ...h, pressureHpa: 1010 }));
  assert.equal(pressureTrend(flat, '2026-10-01T12:00').label, 'steady');
  assert.equal(pressureTrend(f.hourly, '2026-10-01T01:00').label, 'unknown'); // not enough history
});

test('pressureTrend and hoursSinceFront skip null holes and never return NaN', () => {
  const f = parseOpenMeteo(fixture);
  const holey = f.hourly.map((h, i) => (i % 4 === 0 ? { ...h, pressureHpa: null } : h));
  const t = pressureTrend(holey, '2026-10-01T12:00');
  assert.ok(!Number.isNaN(t.deltaHpa));
  assert.equal(t.label, 'falling');
  const hs = hoursSinceFront(holey, '2026-10-02T12:00');
  assert.ok(hs === null || (typeof hs === 'number' && !Number.isNaN(hs)));
});

test('hoursSinceFront finds the pressure minimum after a 12 hPa fall', () => {
  const f = parseOpenMeteo(fixture);
  const hs = hoursSinceFront(f.hourly, '2026-10-02T12:00');
  // minimum is at 2026-10-02T00:00 (1000 hPa), 12 hours before
  assert.equal(hs, 12);
  assert.equal(hoursSinceFront(f.hourly, '2026-10-01T06:00'), null);
});

test('conditionsAt converts units and classifies sky', () => {
  const f = parseOpenMeteo(fixture);
  const c = conditionsAt(f, '2026-10-01T12:00');
  assert.equal(c.tempF, 62);
  assert.equal(c.windCompass, degToCompass(180));
  assert.ok(Math.abs(c.pressureInHg - hpaToInHg(1006)) < 0.001);
  assert.ok(['sun', 'partly', 'overcast'].includes(c.sky));
  assert.ok(typeof c.forecastAgeMin === 'number');
});

test('hpaToInHg and degToCompass', () => {
  assert.ok(Math.abs(hpaToInHg(1013.25) - 29.92) < 0.01);
  assert.equal(degToCompass(0), 'N');
  assert.equal(degToCompass(292), 'WNW');
  assert.equal(degToCompass(359), 'N');
});

test('parseNws reads temperature, wind, and sky, with pressure null', () => {
  const nws = { properties: { periods: [
    { startTime: '2026-10-01T12:00:00-05:00', temperature: 61, temperatureUnit: 'F', windSpeed: '10 mph', windDirection: 'NW', shortForecast: 'Mostly Cloudy', probabilityOfPrecipitation: { value: 20 } },
    { startTime: '2026-10-01T13:00:00-05:00', temperature: 62, temperatureUnit: 'F', windSpeed: '5 to 10 mph', windDirection: 'W', shortForecast: 'Sunny', probabilityOfPrecipitation: { value: null } },
  ] } };
  const f = parseNws(nws);
  assert.equal(f.source, 'nws');
  assert.equal(f.hourly[0].time, '2026-10-01T12:00');
  assert.equal(f.hourly[0].pressureHpa, null);
  assert.equal(f.hourly[1].windMph, 10);
  assert.equal(f.hourly[0].windDir, 315);
  assert.equal(conditionsAt(f, '2026-10-01T13:00').sky, 'sun');
  assert.equal(conditionsAt(f, '2026-10-01T13:00').trend, 'unknown');
});

test('fetchForecast falls back to NWS when Open-Meteo fails', async () => {
  const calls = [];
  const fetchFn = async url => {
    calls.push(url);
    if (url.includes('open-meteo')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ properties: { periods: [] } }) };
  };
  const f = await fetchForecast(fetchFn, { lat: 46.22, lon: -89.41 });
  assert.equal(f.source, 'nws');
  assert.equal(calls.length, 2);
  await assert.rejects(fetchForecast(async () => ({ ok: false, status: 500 }), { lat: 1, lon: 1 }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/weather.test.js`
Expected: FAIL, cannot find module `../js/weather.js`

- [ ] **Step 3: Write weather.js**

```js
export const NWS_HOURLY_URL = 'https://api.weather.gov/gridpoints/MQT/86,54/forecast/hourly';
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function hpaToInHg(hpa) { return hpa == null ? null : Math.round(hpa * 0.02953 * 100) / 100; }
export function degToCompass(deg) { if (deg == null) return ''; return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }
const compassToDeg = s => { const i = COMPASS.indexOf(s); return i < 0 ? null : i * 22.5; };

export function buildForecastUrl({ lat, lon, pastDays = 2, forecastDays = 3 }) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'temperature_2m,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code',
    past_days: pastDays, forecast_days: forecastDays, timezone: 'America/Chicago',
    wind_speed_unit: 'mph', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q.toString();
}

const num = v => (v === null || v === undefined || Number.isNaN(+v)) ? null : +v;

export function parseOpenMeteo(json) {
  const h = json.hourly || {};
  const hourly = (h.time || []).map((time, i) => ({
    time,
    tempF: num(h.temperature_2m?.[i]),
    pressureHpa: num(h.pressure_msl?.[i]),
    windMph: num(h.wind_speed_10m?.[i]),
    windDir: num(h.wind_direction_10m?.[i]),
    gustMph: num(h.wind_gusts_10m?.[i]),
    cloudPct: num(h.cloud_cover?.[i]),
    precipIn: num(h.precipitation?.[i]),
    code: num(h.weather_code?.[i]),
  }));
  return { source: 'open-meteo', fetchedAt: new Date().toISOString(), hourly };
}

export function parseNws(json) {
  const periods = json?.properties?.periods || [];
  const hourly = periods.map(p => {
    const mph = (p.windSpeed || '').match(/(\d+)\s*mph\s*$/);
    const sf = (p.shortForecast || '').toLowerCase();
    const cloudPct = /sunny|clear/.test(sf) && !/mostly cloudy|partly/.test(sf) ? 10 : /partly|mostly sunny/.test(sf) ? 45 : /cloudy|overcast|rain|snow|fog/.test(sf) ? 90 : null;
    return {
      time: p.startTime.slice(0, 16),
      tempF: num(p.temperature), pressureHpa: null,
      windMph: mph ? +mph[1] : null, windDir: compassToDeg(p.windDirection), gustMph: null,
      cloudPct, precipIn: null, code: null,
    };
  });
  return { source: 'nws', fetchedAt: new Date().toISOString(), hourly };
}

function idx(hourly, timeIso) {
  const key = timeIso.slice(0, 13);
  let best = -1;
  for (let i = 0; i < hourly.length; i++) if (hourly[i].time.slice(0, 13) <= key) best = i;
  return best;
}

export function pressureTrend(hourly, timeIso, hours = 3) {
  const i = idx(hourly, timeIso);
  if (i < 0) return { deltaHpa: null, label: 'unknown' };
  const now = hourly[i].pressureHpa ?? hourly[i - 1]?.pressureHpa ?? null;
  const j = i - hours;
  if (j < 0) return { deltaHpa: null, label: 'unknown' };
  const then = hourly[j].pressureHpa ?? hourly[j - 1]?.pressureHpa ?? hourly[j + 1]?.pressureHpa ?? null;
  if (now == null || then == null) return { deltaHpa: null, label: 'unknown' };
  const delta = Math.round((now - then) * 10) / 10;
  return { deltaHpa: delta, label: delta <= -1 ? 'falling' : delta >= 1 ? 'rising' : 'steady' };
}

export function hoursSinceFront(hourly, timeIso) {
  const i = idx(hourly, timeIso);
  if (i < 12) return null;
  const p = k => hourly[k]?.pressureHpa ?? null;
  for (let m = i; m >= 6; m--) {
    const pm = p(m);
    if (pm == null) continue;
    if (pm > (p(m - 1) ?? pm) || pm > (p(m + 1) ?? pm)) continue; // only a local minimum is a front
    let fell = false, rose = false;
    for (let k = m - 1; k >= Math.max(0, m - 12); k--) { const v = p(k); if (v != null && v - pm >= 4) { fell = true; break; } }
    for (let k = m + 1; k <= Math.min(i, m + 6); k++) { const v = p(k); if (v != null && v - pm >= 2) { rose = true; break; } }
    if (fell && rose) return i - m;
  }
  return null;
}

export function conditionsAt(forecast, timeIso) {
  const hourly = forecast.hourly;
  const i = idx(hourly, timeIso);
  const h = i >= 0 ? hourly[i] : {};
  const trend = pressureTrend(hourly, timeIso);
  const cloud = h.cloudPct;
  return {
    tempF: h.tempF ?? null,
    pressureHpa: h.pressureHpa ?? null, pressureInHg: hpaToInHg(h.pressureHpa ?? null), trend: trend.label, pressureDeltaHpa: trend.deltaHpa,
    windMph: h.windMph ?? null, windDir: h.windDir ?? null, windCompass: degToCompass(h.windDir), gustMph: h.gustMph ?? null,
    cloudPct: cloud ?? null, sky: cloud == null ? 'partly' : cloud < 30 ? 'sun' : cloud < 70 ? 'partly' : 'overcast',
    precipIn: h.precipIn ?? null,
    hoursSinceFront: hoursSinceFront(hourly, timeIso),
    forecastAgeMin: Math.max(0, Math.round((Date.now() - new Date(forecast.fetchedAt).getTime()) / 60000)),
  };
}

export async function fetchForecast(fetchFn, { lat, lon }) {
  try {
    const r = await fetchFn(buildForecastUrl({ lat, lon }));
    if (r.ok) return parseOpenMeteo(await r.json());
  } catch (e) { /* fall through to NWS */ }
  const r2 = await fetchFn(NWS_HOURLY_URL, { headers: { 'User-Agent': 'fieldbook (trmnmc@gmail.com)', Accept: 'application/geo+json' } });
  if (!r2.ok) throw new Error('weather unavailable');
  return parseNws(await r2.json());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/weather.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Hit the live API once to confirm the URL still works**

Run: `node -e "import('./js/weather.js').then(async w => { const f = await w.fetchForecast(fetch, { lat: 46.22, lon: -89.41 }); console.log(f.source, f.hourly.length, w.conditionsAt(f, new Date().toISOString().slice(0,16))); })"`
Expected: `open-meteo 120 { tempF: ..., trend: 'falling'|'steady'|'rising', ... }` with no nulls in tempF or pressureHpa.

- [ ] **Step 6: Commit**

```bash
git add js/weather.js test/weather.test.js
git commit -m "feat: weather from Open-Meteo with NWS fallback, pressure trend, fronts"
```

### Task 4: Storage adapter and content loader

**Files:**
- Create: `js/store.js`, `js/content.js`, `content/spot-types.json`
- Test: `test/store.test.js`, `test/content.test.js` (first version; later tasks extend it)

**Interfaces:**
- Produces:
  - `STORES = ['trips', 'events', 'spots', 'photos', 'forecasts', 'settings']`
  - Adapter: `{ get(store, id), put(store, record), del(store, id), all(store), clear(store) }`, all async, records must have `id`
  - `createMemoryStore() → Adapter`
  - `createIndexedDBStore(name = 'fieldbook', version = 1) → Promise<Adapter>` (browser only)
  - `newId(prefix) → string` like `evt_1759400000000_k3j9`
  - `loadContent(fetchFn, base = 'content/') → Promise<Content>` where `Content = { sources, rules, lakes, spotTypes, lures, patterns, lessons }`
  - `indexContent(content) → { lakeById, lureById, lessonById, patternById, sourceById, spotTypeById, rulesForLake(lakeId) }`
  - `validateContent(content, spots = []) → string[]` empty when valid
  - `CHAIN_BBOX = { latMin: 46.15, latMax: 46.30, lonMin: -89.50, lonMax: -89.33 }`

- [ ] **Step 1: Write the failing tests**

`test/store.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, STORES, newId } from '../js/store.js';

test('memory store put/get/all/del/clear', async () => {
  const db = createMemoryStore();
  await db.put('spots', { id: 's1', name: 'A' });
  await db.put('spots', { id: 's2', name: 'B' });
  assert.equal((await db.get('spots', 's1')).name, 'A');
  assert.equal((await db.all('spots')).length, 2);
  await db.del('spots', 's1');
  assert.equal(await db.get('spots', 's1'), undefined);
  await db.clear('spots');
  assert.equal((await db.all('spots')).length, 0);
  await assert.rejects(db.put('nope', { id: 'x' }));
  await assert.rejects(db.put('spots', { name: 'no id' }));
});

test('STORES and newId', () => {
  assert.deepEqual(STORES, ['trips', 'events', 'spots', 'photos', 'forecasts', 'settings']);
  const a = newId('evt'), b = newId('evt');
  assert.ok(a.startsWith('evt_') && a !== b);
});
```

`test/content.test.js` (first version):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadContent, indexContent, validateContent, CHAIN_BBOX } from '../js/content.js';

const fetchFn = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../' + url, import.meta.url), 'utf8')) });

test('spot-types.json loads and has the vocabulary from the spec', async () => {
  const c = await loadContent(fetchFn);
  const ids = c.spotTypes.map(t => t.id);
  for (const t of ['weed_flat', 'weed_edge', 'point', 'inside_turn', 'saddle', 'hump', 'break', 'neck', 'inlet', 'outlet', 'rock', 'wood', 'island', 'shoal']) assert.ok(ids.includes(t), t);
});

test('validateContent reports a spot outside the chain and a missing source', async () => {
  const c = await loadContent(fetchFn);
  const errs = validateContent(c, [{ id: 'x', lakeId: c.lakes[0]?.id || 'thousand-island', name: 'Far', lat: 45.0, lon: -89.4, type: 'point', addedBy: 'seed', verified: false, source: 'nope' }]);
  assert.ok(errs.some(e => e.includes('outside')), errs.join('\n'));
  assert.ok(CHAIN_BBOX.latMin < CHAIN_BBOX.latMax);
});

test('private spots seed validates when present', async () => {
  const p = new URL('../private/spots-seed.json', import.meta.url);
  if (!existsSync(p)) return;
  const c = await loadContent(fetchFn);
  const pack = JSON.parse(await readFile(p, 'utf8'));
  assert.equal(pack.kind, 'spots-pack');
  assert.deepEqual(validateContent(c, pack.spots), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/store.test.js test/content.test.js`
Expected: FAIL, cannot find module

- [ ] **Step 3: Write store.js**

```js
export const STORES = ['trips', 'events', 'spots', 'photos', 'forecasts', 'settings'];

export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function check(store, record) {
  if (!STORES.includes(store)) throw new Error('unknown store ' + store);
  if (record && (record.id === undefined || record.id === null)) throw new Error('record needs id');
}

export function createMemoryStore() {
  const maps = Object.fromEntries(STORES.map(s => [s, new Map()]));
  return {
    async get(store, id) { check(store); return maps[store].get(id); },
    async put(store, record) { check(store, record); maps[store].set(record.id, structuredClone(record)); return record; },
    async del(store, id) { check(store); maps[store].delete(id); },
    async all(store) { check(store); return [...maps[store].values()].map(structuredClone); },
    async clear(store) { check(store); maps[store].clear(); },
  };
}

export function createIndexedDBStore(name = 'fieldbook', version = 1) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = (store, mode, fn) => new Promise((res, rej) => {
        check(store);
        const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      resolve({
        get: (s, id) => tx(s, 'readonly', o => o.get(id)),
        put: (s, rec) => { check(s, rec); return tx(s, 'readwrite', o => o.put(rec)).then(() => rec); },
        del: (s, id) => tx(s, 'readwrite', o => o.delete(id)),
        all: s => tx(s, 'readonly', o => o.getAll()),
        clear: s => tx(s, 'readwrite', o => o.clear()),
      });
    };
  });
}
```

- [ ] **Step 4: Write content/spot-types.json and content.js**

`content/spot-types.json`:
```json
[
  { "id": "weed_flat", "name": "Weed flat", "pro": "Broad shallow weed growth, 3 to 10 ft. Fish roam it in low light and when wind pushes bait onto it.", "yourJob": "Watch for the weed tops under the boat and say when they change." },
  { "id": "weed_edge", "name": "Weed edge", "pro": "Where the weeds stop against deeper water. The outside edge is the ambush line most of the year.", "yourJob": "Keep the boat on the edge; call out when the sonar shows weeds ending." },
  { "id": "point", "name": "Point", "pro": "Structure that reaches into deep water. Fish stage on the sides the wind loads.", "yourJob": "Cast across the point, not down it." },
  { "id": "inside_turn", "name": "Inside turn", "pro": "A pocket in the breakline. Bait collects in it. Big fish sit in the corner.", "yourJob": "Slow the boat; the fish is in the corner, not the open side." },
  { "id": "saddle", "name": "Saddle", "pro": "A shallow ridge between two deeper areas. Fish cross it on travel routes.", "yourJob": "Fish both sides before leaving." },
  { "id": "hump", "name": "Hump", "pro": "A sunken island. Fish circle it; the deep side is the fall side.", "yourJob": "Mark the top with the sonar so we fish the whole rim." },
  { "id": "break", "name": "Break", "pro": "A sharp depth change. Suspended fish hold off it in fall.", "yourJob": "Watch the depth number; say when it drops fast." },
  { "id": "neck", "name": "Neck", "pro": "A channel between lakes. Current, bait, and travel. The chain's necks are its signature structure.", "yourJob": "Keep the boat out of the channel so we do not spook it." },
  { "id": "inlet", "name": "Inlet", "pro": "Where a creek or lake enters. Cooler, oxygenated water in late summer; bait in fall.", "yourJob": "Look for current lines on the surface." },
  { "id": "outlet", "name": "Outlet", "pro": "Where the lake drains. Current pulls bait; the dam end of Cisco is one.", "yourJob": "Watch for the no-boat line near a dam." },
  { "id": "rock", "name": "Rock", "pro": "Gravel and boulders. Cisco spawn on it in late fall. Holds heat in spring.", "yourJob": "Say when the sonar bottom goes hard." },
  { "id": "wood", "name": "Wood", "pro": "Logs and flooded timber from the 1931 raise. Ambush cover.", "yourJob": "Keep the lure above the wood; count it down." },
  { "id": "island", "name": "Island", "pro": "An island's shoreline is a point and a weed edge in one.", "yourJob": "Fish the wind side first." },
  { "id": "shoal", "name": "Shoal", "pro": "A shallow bar off a shoreline. Steep on this chain: sand, gravel, peat.", "yourJob": "Watch the trolling motor in the shallows." }
]
```

`js/content.js`:
```js
export const CHAIN_BBOX = { latMin: 46.15, latMax: 46.30, lonMin: -89.50, lonMax: -89.33 };
const FILES = ['sources', 'rules', 'lakes', 'spot-types', 'lures', 'patterns', 'lessons'];

export async function loadContent(fetchFn, base = 'content/') {
  const out = {};
  for (const f of FILES) {
    const r = await fetchFn(base + f + '.json');
    if (!r.ok) throw new Error('content load failed: ' + f);
    out[f === 'spot-types' ? 'spotTypes' : f] = await r.json();
  }
  return out;
}

const byId = arr => Object.fromEntries((arr || []).map(x => [x.id, x]));

export function indexContent(c) {
  const lakeById = byId(c.lakes), ruleById = byId(c.rules?.rulebooks || []);
  return {
    lakeById, lureById: byId(c.lures), lessonById: byId(c.lessons), patternById: byId(c.patterns), sourceById: byId(c.sources), spotTypeById: byId(c.spotTypes),
    rulesForLake: lakeId => ruleById[lakeById[lakeId]?.rulesId],
  };
}

export function validateContent(c, spots = []) {
  const errs = [];
  const src = new Set((c.sources || []).map(s => s.id));
  const needSources = (rec, label) => {
    if (!Array.isArray(rec.sources) || rec.sources.length === 0) {
      if (!(rec.reasoning === true)) errs.push(`${label} has no sources and is not marked reasoning`);
    } else for (const s of rec.sources) if (!src.has(s)) errs.push(`${label} cites unknown source ${s}`);
  };
  for (const s of c.sources || []) for (const k of ['id', 'title', 'publisher', 'url']) if (!s[k]) errs.push(`source ${s.id} missing ${k}`);
  const rb = new Set((c.rules?.rulebooks || []).map(r => r.id));
  for (const r of c.rules?.rulebooks || []) { for (const k of ['id', 'name', 'minSizeIn', 'season', 'verified']) if (r[k] === undefined) errs.push(`rulebook ${r.id} missing ${k}`); needSources(r, 'rulebook ' + r.id); }
  const lakeIds = new Set();
  for (const l of c.lakes || []) {
    lakeIds.add(l.id);
    for (const k of ['id', 'name', 'states', 'boundaryWater', 'lat', 'lon', 'rulesId']) if (l[k] === undefined) errs.push(`lake ${l.id} missing ${k}`);
    if (!rb.has(l.rulesId)) errs.push(`lake ${l.id} has unknown rulesId ${l.rulesId}`);
    needSources(l, 'lake ' + l.id);
  }
  const types = new Set((c.spotTypes || []).map(t => t.id));
  for (const t of c.spotTypes || []) if (!t.pro || !t.yourJob) errs.push(`spot type ${t.id} missing pro or yourJob`);
  for (const l of c.lures || []) { for (const k of ['id', 'family', 'example', 'tempBandsF', 'retrieve', 'speed', 'yourJob']) if (l[k] === undefined) errs.push(`lure ${l.id} missing ${k}`); }
  for (const p of c.patterns || []) { for (const k of ['id', 'name', 'when', 'favor', 'pro', 'yourJob']) if (p[k] === undefined) errs.push(`pattern ${p.id} missing ${k}`); needSources(p, 'pattern ' + p.id); }
  const lessonIds = new Set((c.lessons || []).map(l => l.id));
  for (const l of c.lessons || []) {
    for (const k of ['id', 'order', 'title', 'track', 'sections']) if (l[k] === undefined) errs.push(`lesson ${l.id} missing ${k}`);
    for (const s of l.sections || []) { if (!s.heading || !s.pro || !s.yourJob) errs.push(`lesson ${l.id} section "${s.heading}" missing heading, pro, or yourJob`); needSources(s, `lesson ${l.id} section "${s.heading}"`); for (const ref of s.links || []) if (!lessonIds.has(ref)) errs.push(`lesson ${l.id} links to unknown lesson ${ref}`); }
  }
  for (const s of spots) {
    for (const k of ['id', 'lakeId', 'name', 'lat', 'lon', 'type', 'addedBy', 'verified']) if (s[k] === undefined) errs.push(`spot ${s.id} missing ${k}`);
    if (!lakeIds.has(s.lakeId)) errs.push(`spot ${s.id} has unknown lake ${s.lakeId}`);
    if (!types.has(s.type)) errs.push(`spot ${s.id} has unknown type ${s.type}`);
    if (s.lat < CHAIN_BBOX.latMin || s.lat > CHAIN_BBOX.latMax || s.lon < CHAIN_BBOX.lonMin || s.lon > CHAIN_BBOX.lonMax) errs.push(`spot ${s.id} is outside the chain`);
    if (s.addedBy === 'seed' && !s.source) errs.push(`seed spot ${s.id} has no source`);
  }
  return errs;
}
```
Also create empty placeholders so `loadContent` works before Tasks 5 to 7 fill them: `content/sources.json` as `[]`, `content/rules.json` as `{ "rulebooks": [] }`, `content/lakes.json` as `[]`, `content/lures.json` as `[]`, `content/patterns.json` as `[]`, `content/lessons.json` as `[]`. Tasks 5 to 7 replace them.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/store.test.js test/content.test.js`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add js/store.js js/content.js content test/store.test.js test/content.test.js
git commit -m "feat: storage adapters, content loader and validator, spot types"
```

### Task 5: Content: sources, rules, lakes

**Files:**
- Create: `content/sources.json`, `content/rules.json`, `content/lakes.json`, `maps/README.md`
- Modify: `test/content.test.js` (add the three tests below)

**Interfaces:**
- Produces: lake ids `thousand-island, cisco, big, west-bay, east-bay, mamie, indian, poor, fishhawk, lindsley, clearwater, big-african, little-african, record, morley`; rulebook ids `mi-inland`, `mi-wi-boundary`; source ids listed in sources.json below. Later tasks cite only these source ids or add new ones to sources.json.

- [ ] **Step 1: Add the failing tests to test/content.test.js**

```js
test('rules: 15 lakes map to two rulebooks with the verified sizes', async () => {
  const c = await loadContent(fetchFn);
  assert.equal(c.lakes.length, 15);
  const ix = indexContent(c);
  assert.equal(ix.rulesForLake('thousand-island').minSizeIn, 42);
  assert.equal(ix.rulesForLake('fishhawk').minSizeIn, 42);
  for (const id of ['big', 'mamie', 'west-bay']) { assert.equal(ix.rulesForLake(id).minSizeIn, 50); assert.equal(ix.lakeById[id].boundaryWater, true); }
  assert.equal(c.lakes.filter(l => l.boundaryWater).length, 3);
  assert.ok(c.rules.rulebooks.every(r => r.minSizeIn !== 46), 'the 46 inch Master Angler figure must never be a rule');
  assert.ok(JSON.stringify(c.rules.notes).includes('Master Angler'));
});

test('lakes: every lake sits inside the bounding box and cites sources', async () => {
  const c = await loadContent(fetchFn);
  for (const l of c.lakes) {
    assert.ok(l.lat > CHAIN_BBOX.latMin && l.lat < CHAIN_BBOX.latMax && l.lon > CHAIN_BBOX.lonMin && l.lon < CHAIN_BBOX.lonMax, l.id);
    assert.ok(l.sources.length > 0, l.id);
  }
  assert.deepEqual(validateContent(c), []);
});

test('no content file contains a spot location', async () => {
  const c = await loadContent(fetchFn);
  assert.ok(!('spots' in c));
  for (const l of c.lakes) assert.ok(!('spots' in l), l.id);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/content.test.js`
Expected: FAIL on `c.lakes.length` (0 vs 15)

- [ ] **Step 3: Write content/sources.json**

```json
[
  { "id": "lakelubbers", "title": "Cisco Chain of Lakes", "publisher": "LakeLubbers", "url": "https://lakelubbers.com/lake/cisco-chain-of-lakes-wisconsin-michigan-usa/", "date": "2026", "fetched": "2026-10-01", "note": "15 lakes, acreages, 1931 dam raised levels 4 to 5 ft, Clearwater has no navigable channel, 1980 record musky" },
  { "id": "mi-dnr-1993-thousand-island", "title": "Status of the Fishery Resource Report: Thousand Island Lake", "publisher": "Michigan DNR Fisheries Division, W. L. Deephouse", "url": "https://www.michigandnr.com/publications/pdfs/DNRFishLibrary/StatusoftheFisheryResourceReports/0040_1993_ThousandIslandLake.pdf", "date": "1993-02-05", "fetched": "2026-10-01", "note": "1,078 acres, 81 ft, Secchi 12 ft, thermocline 17 to 26 ft, cisco present, two large musky seen 1988, no natural musky reproduction documented" },
  { "id": "mi-dnr-sr47", "title": "Special Report 47", "publisher": "Michigan DNR Fisheries Division", "url": "https://www.dnr.state.mi.us/publications/pdfs/IFR/ifrlibra/Special/Reports/SR47.pdf", "date": "unknown", "fetched": "2026-10-01", "note": "Cisco Chain lakes list; muskellunge, tiger muskellunge, and lake trout stocked in the chain; northern strain in Thousand Island" },
  { "id": "mi-dnr-musky-stocking", "title": "Muskie rearing, stocking create fishing opportunities statewide", "publisher": "Michigan DNR", "url": "https://content.govdelivery.com/accounts/MIDNR/bulletins/1749d2d", "date": "unknown", "fetched": "2026-10-01", "note": "Great Lakes and northern strains; northern strain program" },
  { "id": "mi-regs-2026", "title": "2026 Michigan Fishing Regulations", "publisher": "Michigan DNR", "url": "https://www.michigan.gov/dnr/-/media/Project/Websites/dnr/Documents/LED/digests/2026-Michigan-Fishing-Regulations_web_accessible.pdf", "date": "2026-04-01", "fetched": "2026-10-01", "note": "Inland musky 42 in, 1 per license year, registration 24 h, CIR all year, 1st Sat June to Mar 15. Boundary waters 50 in, 1st Sat June to Dec 31, 3 lines. Master Angler minimum 46 in is an entry size, not a rule. Northern musky record 49.75 lb." },
  { "id": "wi-musky-waters-2018", "title": "Wisconsin Muskellunge Waters", "publisher": "Wisconsin DNR", "url": "https://dnr.wisconsin.gov/sites/default/files/topic/Fishing/Musky_WisconsinMuskellungeWaters2018.pdf", "date": "2018", "fetched": "2026-10-01", "note": "Big Lake (WI-MI) Cisco Chain 771 ac Class A1 Category 1; Mamie Lake 400 ac A1 Cat 1; West Bay Lake 368 ac A1 Cat 1. A1 = trophy water, low abundance, large average size. Category 1 = self-sustaining, no stocking." },
  { "id": "wi-dnr-big-lake-map", "title": "Big Lake lake map", "publisher": "Wisconsin DNR", "url": "https://apps.dnr.wi.gov/doclink/lakes_maps/2334700a.pdf", "date": "1973-08", "fetched": "2026-10-01", "note": "Depth contour map" },
  { "id": "lake-link-gogebic", "title": "Gogebic County Lakes", "publisher": "Lake-Link", "url": "https://www.lake-link.com/michigan-lakes/gogebic-county/378/", "date": "2026", "fetched": "2026-10-01", "note": "Fishhawk 77 ac 8 ft; Cisco 506 ac 20 ft; Lindsley 156 ac 46 ft; Record 68 ac 16 ft; Clearwater 172 ac 10 ft; Indian 129 ac" },
  { "id": "wikipedia-mamie", "title": "Mamie Lake (Wisconsin)", "publisher": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Mamie_Lake_(Wisconsin)", "date": "2026", "fetched": "2026-10-01", "note": "376 acres, max depth 10 ft" },
  { "id": "anglers-isle", "title": "Fishing and boating on the Cisco Chain", "publisher": "Angler's Isle Resort", "url": "http://www.anglersisle.com/about/aboutAI_ChainFishNBoat.html", "date": "unknown", "fetched": "2026-10-01", "note": "Four public landings: Big, Cisco, Thousand Island, Mamie. Mamie launch is gravel at the Spring Creek inlet." },
  { "id": "fishweb-ramp", "title": "Public Access Ramp, Thousand Island Lake", "publisher": "Fishweb", "url": "https://www.fishweb.com/maps/gogebic/thousand_island_lake/ramp/index.html", "date": "unknown", "fetched": "2026-10-01", "note": "Concrete DNR ramp, dock, vault toilets, east side, deep water at the ramp" },
  { "id": "allnorthwoods-2026-09-24", "title": "Cisco Chain Fishing Report 9/24/26", "publisher": "All Northwoods, Bill", "url": "https://www.allnorthwoods.com/cisco-chain-fishing-report-9-24-26/", "date": "2026-09-24", "fetched": "2026-10-01", "note": "Water 63 to 71 F. Musky bite picking up. Shallow weed flats, topwater early and late. Suckers in the bait shop and being tried." },
  { "id": "allnorthwoods-2026-09-10", "title": "Cisco Chain Fishing Report 9/10/26", "publisher": "All Northwoods, Bill", "url": "https://www.allnorthwoods.com/cisco-chain-fishing-report-9-10-26/", "date": "2026-09-10", "fetched": "2026-10-01", "note": "Suckers arrive in the bait shop" },
  { "id": "vinson-angradi-2014", "title": "Muskie Lunacy: Does the Lunar Cycle Influence Angler Catch of Muskellunge?", "publisher": "PLOS ONE, Vinson and Angradi", "url": "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098046", "date": "2014", "fetched": "2026-10-01", "note": "341,959 Muskies Inc records 1970 to 2013. About 5% more catch around full and new moon. Stronger for fish over 102 cm. Night catch peaks at full moon." },
  { "id": "dettloff-moon", "title": "Dettloff moon data, Chippewa Flowage (forum summary)", "publisher": "MuskieFIRST", "url": "https://muskie.outdoorsfirst.com/board/forums/thread-view.asp?tid=48021", "date": "unknown", "fetched": "2026-10-01", "note": "Full moon period 34.7% of 40 in plus fish against 25% expected" },
  { "id": "muskies-inc-lunge-log", "title": "MOFC and Lunge Log Policy", "publisher": "Muskies, Inc.", "url": "https://muskiesinc.org/indy_files/pandp/documentation/MOFC%20and%20Lunge%20Log%20Policy%202-12-2020.pdf", "date": "2020-02-12", "fetched": "2026-10-01", "note": "Length measured in the boat on a board, lower jaw tip to tail tip. Weight estimate L x G x G / 800. Girth at the true widest point." },
  { "id": "muskies-inc-fields", "title": "Lunge Log fields (forum summary)", "publisher": "MuskieFIRST", "url": "https://muskie.outdoorsfirst.com/board/forums/thread-view.asp?tid=55299", "date": "unknown", "fetched": "2026-10-01", "note": "Sky, water clarity, water depth, depth fish hit at, lure, lure color, weed type, bottom; pressure and moon auto-filled" },
  { "id": "open-meteo", "title": "Open-Meteo forecast API", "publisher": "Open-Meteo", "url": "https://open-meteo.com/en/docs", "date": "2026", "fetched": "2026-10-01", "note": "Hourly pressure_msl, wind, gusts, cloud, temperature; past_days history; free, no key" },
  { "id": "nws-mqt", "title": "NWS Marquette hourly forecast grid 86,54", "publisher": "National Weather Service", "url": "https://api.weather.gov/gridpoints/MQT/86,54/forecast/hourly", "date": "2026", "fetched": "2026-10-01", "note": "Fallback forecast, no pressure" },
  { "id": "nominatim", "title": "Lake centroids", "publisher": "OpenStreetMap Nominatim", "url": "https://nominatim.openstreetmap.org/", "date": "2026-10-01", "fetched": "2026-10-01", "note": "Centroid coordinates for the 15 lakes" }
]
```

- [ ] **Step 4: Write content/rules.json**

```json
{
  "rulebooks": [
    {
      "id": "mi-inland",
      "name": "Michigan inland waters",
      "appliesTo": "All Cisco Chain lakes that lie entirely in Michigan",
      "minSizeIn": 42,
      "season": "Possession season: first Saturday in June (June 6, 2026) through March 15. Catch-and-immediate-release is open all year.",
      "limit": "One muskellunge per angler per license year, April 1 to March 31.",
      "registration": "Register any harvested muskellunge within 24 hours at Michigan.gov/RegisterFish, in the DNR Hunt Fish app, or by phone 888-636-7778.",
      "license": "Michigan fishing license.",
      "pike": "Northern pike rules on these lakes are listed in the 2026 digest county list; confirm the current pike size rule for each lake before keeping one.",
      "verified": "2026-10-01",
      "sources": ["mi-regs-2026"]
    },
    {
      "id": "mi-wi-boundary",
      "name": "Michigan-Wisconsin boundary waters",
      "appliesTo": "Big Lake, Mamie Lake, West Bay Lake",
      "minSizeIn": 50,
      "season": "Possession season: first Saturday in June through December 31. Catch-and-immediate-release is open all year.",
      "limit": "One muskellunge per angler per year. Mandatory registration.",
      "registration": "Register harvest within 24 hours with the state whose water you were in.",
      "license": "A valid Michigan or Wisconsin license is good on these three lakes. Follow the rules of the state whose water you are in. Up to 3 lines per person.",
      "pike": "Boundary water pike rules differ from inland; check the boundary section of the digest.",
      "verified": "2026-10-01",
      "sources": ["mi-regs-2026"]
    }
  ],
  "notes": [
    "Three different minimum sizes exist on one chain: 42 inches on the Michigan-only lakes, 50 inches on Big, Mamie, and West Bay. The Master Angler entry minimum of 46 inches is an award size, not a rule, and is never shown as a rule.",
    "Michigan's state record northern muskellunge, 49.75 lb, came from Thousand Island Lake in 1980."
  ]
}
```

- [ ] **Step 5: Write content/lakes.json**

Fifteen records. Fields with no verified value are `null`. Connections are listed only where a source names them. Coordinates are OpenStreetMap centroids. Write exactly this, then fill `mapImage` paths for any map obtained in Task 13.

```json
[
  { "id": "thousand-island", "name": "Thousand Island Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2327, "lon": -89.3905, "acres": 1078, "acresNote": "DNR 1993 report; other sources 1,009 to 1,020", "maxDepthFt": 81, "maxDepthNote": "DNR survey; some sites say 40 ft", "secchiFt": 12, "thermoclineFt": [17, 26], "character": "deep_basin", "connections": [{ "to": "big-african", "kind": "inlet" }, { "to": "lindsley", "kind": "inlet" }, { "to": "cisco", "kind": "outlet" }], "launches": [{ "name": "DNR access, east shore", "lat": null, "lon": null, "surface": "concrete", "notes": "Wide ramp, dock, vault toilets, deep water at the ramp" }], "structureSummary": "Steep shoals of sand, gravel, and peat. Abundant submergent and floating weeds. Logs and sunken islands. Thermocline 17 to 26 ft in summer; no oxygen below 50 ft in summer. The chain's deep basin.", "forage": ["cisco", "yellow perch", "bluegill", "white sucker", "rock bass"], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": "Northern strain muskellunge stocked by Michigan; tiger musky and lake trout stocked historically", "notes": "Low density, big fish. Two large musky seen in the 1988 survey, one about 25 lb. No natural reproduction documented. State record northern musky 49.75 lb, 1980." }, "rulesId": "mi-inland", "mapImage": null, "sources": ["mi-dnr-1993-thousand-island", "mi-dnr-sr47", "mi-regs-2026", "lakelubbers", "fishweb-ramp", "nominatim"] },
  { "id": "cisco", "name": "Cisco Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2387, "lon": -89.4447, "acres": 506, "acresNote": "Lake-Link 506; LakeLubbers 567", "maxDepthFt": 20, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [{ "to": "thousand-island", "kind": "inlet" }], "launches": [{ "name": "Public landing", "lat": null, "lon": null, "surface": null, "notes": "One of the chain's four public landings" }], "structureSummary": "Receives Thousand Island's outflow; drains through the water-level dam to the Cisco Branch of the Ontonagon. Most water under 20 ft.", "forage": ["yellow perch", "white sucker", "bluegill"], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": "Chain stocked historically; lake-specific records to be pulled from the DNR stocking database", "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "lakelubbers", "mi-dnr-1993-thousand-island", "anglers-isle", "nominatim"] },
  { "id": "big", "name": "Big Lake", "states": ["MI", "WI"], "boundaryWater": true, "lat": 46.2003, "lon": -89.4439, "acres": 771, "acresNote": "WI DNR 771; LakeLubbers 733", "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [{ "name": "Public landing", "lat": null, "lon": null, "surface": null, "notes": "Marina on the south end" }], "structureSummary": "Largest boundary lake. Depth map on file with Wisconsin DNR (1973).", "forage": ["yellow perch", "white sucker", "bluegill"], "muskyStatus": { "wiClass": "A1", "wiCategory": 1, "miStocking": null, "notes": "Wisconsin trophy classification with self-sustaining natural reproduction and no stocking." }, "rulesId": "mi-wi-boundary", "mapImage": null, "sources": ["wi-musky-waters-2018", "wi-dnr-big-lake-map", "lakelubbers", "anglers-isle", "nominatim"] },
  { "id": "west-bay", "name": "West Bay Lake", "states": ["MI", "WI"], "boundaryWater": true, "lat": 46.2036, "lon": -89.4282, "acres": 368, "acresNote": "WI DNR 368; LakeLubbers 362", "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [], "structureSummary": null, "forage": ["yellow perch", "white sucker"], "muskyStatus": { "wiClass": "A1", "wiCategory": 1, "miStocking": null, "notes": "Wisconsin trophy classification, self-sustaining." }, "rulesId": "mi-wi-boundary", "mapImage": null, "sources": ["wi-musky-waters-2018", "lakelubbers", "nominatim"] },
  { "id": "east-bay", "name": "East Bay Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2042, "lon": -89.4027, "acres": 277, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lakelubbers", "nominatim"] },
  { "id": "mamie", "name": "Mamie Lake", "states": ["MI", "WI"], "boundaryWater": true, "lat": 46.1909, "lon": -89.3937, "acres": 376, "acresNote": "Wikipedia 376; WI DNR 400; LakeLubbers 337", "maxDepthFt": 10, "secchiFt": null, "thermoclineFt": null, "character": "shallow_weed_bowl", "connections": [], "launches": [{ "name": "Gravel launch at the Spring Creek inlet", "lat": null, "lon": null, "surface": "gravel", "notes": "About 1.5 miles from Angler's Isle" }], "structureSummary": "Shallow bowl, 10 ft max. Fishes as one big weed flat; cools and warms fast.", "forage": ["yellow perch", "white sucker", "bluegill"], "muskyStatus": { "wiClass": "A1", "wiCategory": 1, "miStocking": null, "notes": "Wisconsin trophy classification, self-sustaining." }, "rulesId": "mi-wi-boundary", "mapImage": null, "sources": ["wi-musky-waters-2018", "wikipedia-mamie", "anglers-isle", "lakelubbers", "nominatim"] },
  { "id": "indian", "name": "Indian Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2090, "lon": -89.3849, "acres": 129, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "nominatim"] },
  { "id": "poor", "name": "Poor Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2129, "lon": -89.4030, "acres": 106, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lakelubbers", "nominatim"] },
  { "id": "fishhawk", "name": "Fishhawk Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2164, "lon": -89.4141, "acres": 77, "maxDepthFt": 8, "secchiFt": null, "thermoclineFt": null, "character": "shallow_weed_bowl", "connections": [], "launches": [], "structureSummary": "Small, shallow weed bowl, 8 ft max. Home water. Warms and cools fastest in the chain; first to turn over.", "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": "Part of the chain's connected musky water; lake-specific survey not found yet" }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "lakelubbers", "nominatim"] },
  { "id": "lindsley", "name": "Lindsley Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2187, "lon": -89.4268, "acres": 156, "maxDepthFt": 46, "secchiFt": null, "thermoclineFt": null, "character": "deep_basin", "connections": [{ "to": "thousand-island", "kind": "outlet" }], "launches": [], "structureSummary": "The chain's second deep basin at 46 ft. Flows into Thousand Island.", "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "mi-dnr-1993-thousand-island", "nominatim"] },
  { "id": "clearwater", "name": "Clearwater Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2567, "lon": -89.4110, "acres": 172, "maxDepthFt": 10, "secchiFt": null, "thermoclineFt": null, "character": "shallow_weed_bowl", "connections": [{ "to": "little-african", "kind": "creek" }], "launches": [], "structureSummary": "No navigable channel to the chain; a small creek runs a few hundred yards to Little African. Reach it by road, not by boat.", "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "lakelubbers", "nominatim"] },
  { "id": "big-african", "name": "Big African Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2495, "lon": -89.3971, "acres": 86, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [{ "to": "thousand-island", "kind": "outlet" }], "launches": [], "structureSummary": "Flows into Thousand Island.", "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lakelubbers", "mi-dnr-1993-thousand-island", "nominatim"] },
  { "id": "little-african", "name": "Little African Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2520, "lon": -89.4048, "acres": 31, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "shallow_weed_bowl", "connections": [{ "to": "clearwater", "kind": "creek" }], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lakelubbers", "nominatim"] },
  { "id": "record", "name": "Record Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2526, "lon": -89.3892, "acres": 68, "maxDepthFt": 16, "secchiFt": null, "thermoclineFt": null, "character": "mid_depth_mixed", "connections": [], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lake-link-gogebic", "nominatim"] },
  { "id": "morley", "name": "Morley Lake", "states": ["MI"], "boundaryWater": false, "lat": 46.2128, "lon": -89.4330, "acres": 59, "maxDepthFt": null, "secchiFt": null, "thermoclineFt": null, "character": "shallow_weed_bowl", "connections": [], "launches": [], "structureSummary": null, "forage": [], "muskyStatus": { "wiClass": null, "wiCategory": null, "miStocking": null, "notes": null }, "rulesId": "mi-inland", "mapImage": null, "sources": ["lakelubbers", "nominatim"] }
]
```

`maps/README.md`: one paragraph: "Depth maps downscaled from Michigan DNR and Wisconsin DNR PDFs. Public data. File name is the lake id. Long edge 1600 px, JPEG quality 70. See Task 13 for how each was obtained."

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/content.test.js`
Expected: PASS, all tests

- [ ] **Step 7: Commit**

```bash
git add content/sources.json content/rules.json content/lakes.json maps/README.md test/content.test.js
git commit -m "content: sources, rulebooks, and 15 lake records with verified facts"
```

### Task 6: Content: lures and patterns

**Files:**
- Create: `content/lures.json`, `content/patterns.json`
- Modify: `test/content.test.js` (add two tests)

**Interfaces:**
- Produces: lure families `bucktail, topwater, glider, jerkbait, crankbait, rubber, spinnerbait, sucker`; pattern `when` fields `tempF, months, timeOfDay, sky, windMph, pressureTrend, frontHoursAgo, clarity, lakeCharacter, presentation`; `favor` keys `windows` (dawn, dusk, major, minor, midday, night), `spotTypes`, `lureFamilies`, `speed`. Task 8's engine reads exactly these names.

- [ ] **Step 1: Add the failing tests**

```js
test('lures cover every family and carry temperature bands', async () => {
  const c = await loadContent(fetchFn);
  const fams = new Set(c.lures.map(l => l.family));
  for (const f of ['bucktail', 'topwater', 'glider', 'jerkbait', 'crankbait', 'rubber', 'spinnerbait', 'sucker']) assert.ok(fams.has(f), f);
  for (const l of c.lures) { assert.ok(Array.isArray(l.tempBandsF) && l.tempBandsF.every(b => b.length === 2 && b[0] < b[1]), l.id); assert.ok(['slow', 'medium', 'fast', 'burn'].includes(l.speed), l.id); }
});

test('patterns: at least 12 fall rules, each with pro, yourJob, and sources or reasoning', async () => {
  const c = await loadContent(fetchFn);
  const fall = c.patterns.filter(p => (p.when.months || [10]).some(m => m === 10 || m === 11));
  assert.ok(fall.length >= 12, 'fall patterns: ' + fall.length);
  for (const p of c.patterns) {
    assert.ok(p.pro.length > 40 && p.yourJob.length > 10, p.id);
    for (const k of Object.keys(p.favor)) assert.ok(['windows', 'spotTypes', 'lureFamilies', 'speed'].includes(k), p.id + ' favor ' + k);
    for (const [k, v] of Object.entries(p.favor.lureFamilies || {})) assert.ok(c.lures.some(l => l.family === k) && Number.isInteger(v) && v >= 1 && v <= 5, p.id + ' ' + k);
    for (const k of Object.keys(p.favor.spotTypes || {})) assert.ok(c.spotTypes.some(t => t.id === k), p.id + ' spot type ' + k);
  }
  assert.deepEqual(validateContent(c), []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/content.test.js`
Expected: FAIL, lures empty

- [ ] **Step 3: Write content/lures.json**

```json
[
  { "id": "bucktail-double10", "family": "bucktail", "example": "Double 10 inline bucktail (Double Cowgirl type)", "sizeIn": 10, "tempBandsF": [[60, 80]], "light": ["sun", "partly", "overcast"], "windMph": [0, 20], "retrieve": "Steady, fast enough that the blades thump. Burn it in warm water. Figure-8 wide and fast.", "speed": "fast", "runDepthFt": [1, 4], "trollOk": false, "whenNot": "Below 55°F fish will not chase it; go to gliders or rubber.", "yourJob": "Count the cadence; if his blades stop thumping the retrieve is too slow.", "sources": [], "reasoning": true },
  { "id": "bucktail-single8", "family": "bucktail", "example": "Single 8 bucktail, smaller profile", "sizeIn": 7, "tempBandsF": [[55, 75]], "light": ["sun", "partly", "overcast"], "windMph": [0, 20], "retrieve": "Medium steady. Lets you cover a flat fast and read where fish are.", "speed": "medium", "runDepthFt": [1, 5], "trollOk": false, "whenNot": "When follows are lazy; downsize to a glider instead.", "yourJob": "This is the search bait. Mark every follow on the map.", "sources": [], "reasoning": true },
  { "id": "topwater-walker", "family": "topwater", "example": "Walk-the-dog topwater (Pacemaker, Weagle type)", "sizeIn": 8, "tempBandsF": [[58, 78]], "light": ["partly", "overcast"], "windMph": [0, 10], "retrieve": "Side to side with pauses over weed flats. Dawn, dusk, and calm overcast days.", "speed": "medium", "runDepthFt": [0, 0], "trollOk": false, "whenNot": "Chop over 10 mph or water under 58°F.", "yourJob": "Net ready at all times; topwater hits are visible and sudden.", "sources": ["allnorthwoods-2026-09-24"] },
  { "id": "topwater-prop", "family": "topwater", "example": "Prop topwater (Topraider type)", "sizeIn": 7, "tempBandsF": [[58, 78]], "light": ["partly", "overcast"], "windMph": [0, 12], "retrieve": "Slow steady, a straight line of noise. Night and dusk.", "speed": "slow", "runDepthFt": [0, 0], "trollOk": false, "whenNot": "Bright midday sun.", "yourJob": "Watch behind the lure for the wake of a follower.", "sources": ["allnorthwoods-2026-09-24"] },
  { "id": "glider-10", "family": "glider", "example": "10 inch glider (Phantom, Hellhound type)", "sizeIn": 10, "tempBandsF": [[45, 65]], "light": ["sun", "partly", "overcast"], "windMph": [0, 15], "retrieve": "Short rod pulls with slack between. Glides side to side. Long pauses as water cools.", "speed": "slow", "runDepthFt": [2, 8], "trollOk": false, "whenNot": "Over thick weed tops; it fouls.", "yourJob": "Say when the lure comes into view so he can set up the 8 early.", "sources": [], "reasoning": true },
  { "id": "jerkbait-dive", "family": "jerkbait", "example": "Dive-and-rise jerkbait (Suick type)", "sizeIn": 9, "tempBandsF": [[45, 68]], "light": ["sun", "partly", "overcast"], "windMph": [0, 15], "retrieve": "Rip down, let it rise. The rise is the trigger. Slower and longer pauses in cold water.", "speed": "slow", "runDepthFt": [2, 6], "trollOk": false, "whenNot": "When fish follow fast and hot; speed up with a bucktail.", "yourJob": "Keep the boat still during pauses.", "sources": [], "reasoning": true },
  { "id": "crankbait-twitch", "family": "crankbait", "example": "Minnow crankbait, twitched (Grandma, Jake type)", "sizeIn": 9, "tempBandsF": [[48, 70]], "light": ["sun", "partly", "overcast"], "windMph": [0, 20], "retrieve": "Twitch and pause along weed edges and breaks. Runs 4 to 8 ft.", "speed": "medium", "runDepthFt": [4, 8], "trollOk": true, "whenNot": "Over the tops of shallow weeds.", "yourJob": "Watch the sonar depth and call out when the edge drops.", "sources": [], "reasoning": true },
  { "id": "crankbait-troll", "family": "crankbait", "example": "Deep crankbait for trolling (Believer, Ernie type)", "sizeIn": 10, "tempBandsF": [[40, 65]], "light": ["sun", "partly", "overcast"], "windMph": [0, 25], "retrieve": "Troll 2.5 to 4 mph along breaks and over the basin where cisco or perch show. Depth from line out.", "speed": "medium", "runDepthFt": [8, 20], "trollOk": true, "whenNot": "Inside weed flats.", "yourJob": "Watch rod tips for a change in throb; weeds kill the action.", "sources": [], "reasoning": true },
  { "id": "rubber-dawg", "family": "rubber", "example": "Soft plastic (Bull Dawg, Medussa type)", "sizeIn": 10, "tempBandsF": [[38, 62]], "light": ["sun", "partly", "overcast"], "windMph": [0, 20], "retrieve": "Pull and fall. Count it down to the fish's depth. Slow in cold water.", "speed": "slow", "runDepthFt": [3, 20], "trollOk": true, "whenNot": "Weeds that are still thick and standing.", "yourJob": "Count the fall out loud so he can repeat the depth.", "sources": [], "reasoning": true },
  { "id": "spinnerbait", "family": "spinnerbait", "example": "Musky spinnerbait, single or double blade", "sizeIn": 7, "tempBandsF": [[50, 75]], "light": ["sun", "partly", "overcast"], "windMph": [5, 25], "retrieve": "Slow roll through and over weeds; helicopter it down the edge. Fishes dirty water and wind.", "speed": "medium", "runDepthFt": [2, 10], "trollOk": false, "whenNot": "Flat calm clear water where fish see the wire.", "yourJob": "Keep the boat upwind; this is the wind bait.", "sources": [], "reasoning": true },
  { "id": "sucker-quickstrike", "family": "sucker", "example": "Live sucker, 12 to 16 inch, on a quick-strike rig", "sizeIn": 14, "tempBandsF": [[34, 58]], "light": ["sun", "partly", "overcast"], "windMph": [0, 20], "retrieve": "Under a float or on a slow drag off the break while casting another rod. Set the hook on the strike, not after a wait. Quick-strike rigs are what make release possible.", "speed": "slow", "runDepthFt": [3, 20], "trollOk": false, "whenNot": "Water over 58°F: suckers die fast and the artificial bite is better.", "yourJob": "Watch the float. The moment it moves, say so. Have the net and cutters in hand.", "sources": ["allnorthwoods-2026-09-24", "allnorthwoods-2026-09-10"] },
  { "id": "glider-small", "family": "glider", "example": "7 inch glider for lazy follows", "sizeIn": 7, "tempBandsF": [[45, 70]], "light": ["sun", "partly", "overcast"], "windMph": [0, 15], "retrieve": "Same as the big glider, smaller and slower. The downsize bait after follows.", "speed": "slow", "runDepthFt": [2, 6], "trollOk": false, "whenNot": "As a search bait; it covers water slowly.", "yourJob": "Tie it on before we need it.", "sources": [], "reasoning": true }
]
```

- [ ] **Step 4: Write content/patterns.json**

Weights are 1 to 5. Every rule carries `sources` or `reasoning: true`. Month numbers are calendar months.

```json
[
  { "id": "fall-warm-flats", "name": "Early fall, fish on the weed flats", "when": { "tempF": [60, 72], "months": [9, 10] }, "favor": { "windows": { "dawn": 4, "dusk": 5 }, "spotTypes": { "weed_flat": 5, "weed_edge": 3, "neck": 2 }, "lureFamilies": { "topwater": 4, "bucktail": 4, "spinnerbait": 2 }, "speed": "fast" }, "pro": "On September 24 the chain reported 63 to 71°F water, musky on the shallow weed flats, topwater early and late. Warm-water fish are still fast and shallow; the flats hold green weeds and perch.", "yourJob": "Net ready at dawn and dusk. Watch the weed tops behind the boat for a wake.", "sources": ["allnorthwoods-2026-09-24"] },
  { "id": "fall-transition", "name": "Fall transition, 52 to 60°F", "when": { "tempF": [52, 60], "months": [10, 11] }, "favor": { "windows": { "dusk": 4, "major": 3, "midday": 2 }, "spotTypes": { "weed_edge": 5, "point": 4, "inside_turn": 4, "break": 3 }, "lureFamilies": { "glider": 5, "jerkbait": 4, "crankbait": 3, "rubber": 3 }, "speed": "slow" }, "pro": "As the water drops through the 50s the flats die and fish slide to the outside weed edge, points, and the first break. Gliders and jerkbaits with pauses replace speed. Midday warms the shallows just enough.", "yourJob": "Say when the sonar shows weeds ending. That line is where we fish.", "sources": [], "reasoning": true },
  { "id": "fall-cold-suckers", "name": "Cold water, suckers and big rubber", "when": { "tempF": [34, 52], "months": [10, 11, 12] }, "favor": { "windows": { "midday": 4, "dusk": 3, "major": 3 }, "spotTypes": { "break": 5, "point": 4, "inside_turn": 4, "rock": 3, "hump": 3 }, "lureFamilies": { "sucker": 5, "rubber": 5, "glider": 3, "crankbait": 3 }, "speed": "slow" }, "pro": "Under about 52°F the biggest fish of the year feed up, slowly and deep. Suckers under a float off the break, big rubber counted down, deep cranks trolled. The bait shop stocks suckers from September for this reason. Warmest part of the day matters more than dawn.", "yourJob": "Watch the float and the sonar. Count the rubber's fall out loud.", "sources": ["allnorthwoods-2026-09-24", "allnorthwoods-2026-09-10"] },
  { "id": "fall-turnover", "name": "Turnover: go to the shallow bowls or the one clear lake", "when": { "tempF": [48, 56], "months": [10, 11], "lakeCharacter": ["deep_basin"] }, "favor": { "windows": { "midday": 3 }, "spotTypes": { "neck": 4, "inlet": 3, "weed_edge": 2 }, "lureFamilies": { "glider": 3, "rubber": 3 }, "speed": "slow" }, "pro": "Thousand Island and Lindsley stratify in summer, so they turn over in October and fish poorly for a week while the water mixes. The shallow lakes never stratified and keep fishing. If the deep lake looks murky with debris, move to Fishhawk, Mamie, or a neck between lakes.", "yourJob": "Look at the water: brown, bubbly, smelling of bottom means turnover. Say so.", "sources": ["mi-dnr-1993-thousand-island"] },
  { "id": "cisco-spawn", "name": "Late November cisco spawn", "when": { "tempF": [36, 44], "months": [11, 12], "lakeCharacter": ["deep_basin"] }, "favor": { "windows": { "dusk": 5, "night": 4, "major": 3 }, "spotTypes": { "rock": 5, "shoal": 5, "break": 3 }, "lureFamilies": { "rubber": 5, "crankbait": 4, "sucker": 4 }, "speed": "slow" }, "pro": "Thousand Island holds cisco. Cisco spawn on gravel and rock shoals at dusk and after dark in late November near the full moon, and the lake's biggest musky move onto those shoals to eat them. Big rubber and cranks over hard bottom at dusk; suckers off the shoal edge.", "yourJob": "Say when the sonar bottom goes hard. Lights and gloves ready before dark.", "sources": ["mi-dnr-1993-thousand-island", "vinson-angradi-2014"] },
  { "id": "moon-major", "name": "Moon overhead or underfoot", "when": {}, "favor": { "windows": { "major": 4 } }, "pro": "Across 341,959 logged catches, musky catch rises about 5% around full and new moon, more for fish over 40 inches. Dettloff's Chippewa Flowage records put 34.7% of 40-inch-plus fish in the full moon period against 25% expected. The effect is modest. It decides when to be on the best spot, not whether to go.", "yourJob": "Keep the clock. Say 'major in 20 minutes' so we are on the best spot when it opens.", "sources": ["vinson-angradi-2014", "dettloff-moon"] },
  { "id": "moon-minor", "name": "Moonrise or moonset", "when": {}, "favor": { "windows": { "minor": 2 } }, "pro": "Moonrise and moonset are the minor windows. Weaker than overhead and underfoot, but when one lands on dusk it stacks.", "yourJob": "Call it out when a minor window overlaps dusk or dawn.", "sources": ["vinson-angradi-2014"], "reasoning": true },
  { "id": "full-new-moon", "name": "Full or new moon within two days", "when": { "moonPhaseName": ["Full Moon", "New Moon"] }, "favor": { "windows": { "dusk": 2, "night": 2, "major": 2 } }, "pro": "The lunar peak days. At night the catch peak is the full moon, not the new moon. Plan the fall trip around the October 26 and November 24 full moons.", "yourJob": "Pack lights for a dusk-into-dark session on these days.", "sources": ["vinson-angradi-2014"] },
  { "id": "pre-front", "name": "Falling pressure ahead of a front", "when": { "pressureTrend": ["falling"] }, "favor": { "windows": { "midday": 3, "dusk": 3 }, "lureFamilies": { "bucktail": 2, "topwater": 2, "spinnerbait": 2 }, "speed": "fast" }, "pro": "Pressure falling 1 hPa or more over three hours with the wind building: the feeding window before a front. Fish are active and shallow. Cover water fast.", "yourJob": "Watch the sky to the west. When the clouds build and the wind rises, we fish harder, not easier.", "sources": [], "reasoning": true },
  { "id": "post-front", "name": "Bluebird day after a front", "when": { "frontHoursAgo": [0, 36], "sky": ["sun"], "pressureTrend": ["rising", "steady"] }, "favor": { "windows": { "major": 4, "dusk": 3 }, "spotTypes": { "inside_turn": 4, "weed_edge": 3, "wood": 3 }, "lureFamilies": { "glider": 4, "jerkbait": 3, "rubber": 3, "sucker": 3 }, "speed": "slow" }, "pro": "High pressure, clear sky, and a north wind in the day or two after a front: fish tuck into cover and the inside turns and will not chase. Slow down, go smaller, fish the moon windows, and expect follows that will not commit.", "yourJob": "This is a patience day. Keep the cadence steady and log every follow; the pattern shows up in the log.", "sources": [], "reasoning": true },
  { "id": "wind-loaded", "name": "Wind onto structure", "when": { "windMph": [8, 25] }, "favor": { "spotTypes": { "point": 4, "weed_flat": 3, "shoal": 3, "island": 3 }, "lureFamilies": { "spinnerbait": 3, "bucktail": 2 } }, "pro": "Wind pushes plankton, then bait, then musky onto the shoreline it blows against. Points and flats on the windward side fish best. The spot list already filters by the wind direction you entered.", "yourJob": "Keep the boat upwind of the spot so he casts across it with the wind.", "sources": [], "reasoning": true },
  { "id": "flat-calm-clear", "name": "Flat calm and clear", "when": { "windMph": [0, 4], "sky": ["sun"] }, "favor": { "windows": { "dawn": 3, "dusk": 4, "night": 3 }, "spotTypes": { "break": 3, "weed_edge": 3 }, "lureFamilies": { "glider": 3, "rubber": 2 }, "speed": "slow" }, "pro": "Twelve feet of visibility on Thousand Island and no wind: fish see the boat. Fish low light, make long casts, and stay off the structure.", "yourJob": "Long casts. Keep the trolling motor quiet. No shadows over the spot.", "sources": ["mi-dnr-1993-thousand-island"] },
  { "id": "overcast-day", "name": "Overcast with chop", "when": { "sky": ["overcast"], "windMph": [5, 20] }, "favor": { "windows": { "midday": 4 }, "spotTypes": { "weed_flat": 3, "weed_edge": 3 }, "lureFamilies": { "bucktail": 3, "topwater": 2, "crankbait": 2 }, "speed": "medium" }, "pro": "Cloud and chop make midday fish like dusk fish. Stay on the flats and edges through the day.", "yourJob": "No long lunch. Midday counts today.", "sources": [], "reasoning": true },
  { "id": "necks-travel", "name": "Necks between lakes", "when": { "months": [9, 10, 11] }, "favor": { "spotTypes": { "neck": 3, "inlet": 2, "outlet": 2 } }, "pro": "The 1931 dam raised the chain four to five feet and made the necks. Fish move through them between lakes as temperatures shift in fall. A neck is a point, a break, and current in one.", "yourJob": "Hold the boat out of the channel and off to one side.", "sources": ["lakelubbers"] },
  { "id": "shallow-bowls-fast", "name": "Shallow bowls change fastest", "when": { "lakeCharacter": ["shallow_weed_bowl"] }, "favor": { "windows": { "midday": 2 } }, "pro": "Fishhawk at 8 ft and Mamie at 10 ft warm and cool with the air. On a warm afternoon after a cold night they are the warmest water in the chain; on a cold snap they are the first to shut down. Read today's air temperature trend before choosing them.", "yourJob": "Compare the fish finder temperature to the last entry in the plan. Say if it moved more than two degrees.", "sources": ["lake-link-gogebic", "wikipedia-mamie"] },
  { "id": "trolling-cold", "name": "Trolling when it is cold and windy", "when": { "tempF": [36, 55], "windMph": [10, 30], "presentation": ["trolling", "any"] }, "favor": { "spotTypes": { "break": 4, "hump": 3, "point": 2 }, "lureFamilies": { "crankbait": 5, "rubber": 3 }, "speed": "medium" }, "pro": "Cold, windy, and deep: trolling big cranks along the breaks at 2.5 to 4 mph covers water that casting cannot, and keeps hands warm. Legal on these lakes under Michigan rules; respect the three-line limit on boundary water.", "yourJob": "Watch the rod tips. A steady throb means clean; a dead tip means weeds.", "sources": ["mi-regs-2026"], "reasoning": true }
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/content.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add content/lures.json content/patterns.json test/content.test.js
git commit -m "content: lure catalog and fall pattern rules with reasons"
```

### Task 7: Content: twelve lessons

**Files:**
- Create: `content/lessons.json`
- Modify: `test/content.test.js` (add one test)

**Interfaces:**
- Produces: lesson ids `fish, chain, seasons, clock, weather, structure, lures, presentation, gear, rules, first-mate, next`. Each lesson: `{ id, order, title, track, sections: [{ heading, pro, yourJob, sources?, reasoning?, links?: [lessonId] }] }`. `pro` is plain text with paragraphs separated by `\n\n`. The UI (Task 11) renders `pro` as paragraphs and `yourJob` as a callout.

- [ ] **Step 1: Add the failing test**

```js
test('lessons: twelve chapters in order, fall and next at full depth', async () => {
  const c = await loadContent(fetchFn);
  assert.deepEqual(c.lessons.map(l => l.id), ['fish', 'chain', 'seasons', 'clock', 'weather', 'structure', 'lures', 'presentation', 'gear', 'rules', 'first-mate', 'next']);
  assert.deepEqual(c.lessons.map(l => l.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const words = s => s.split(/\s+/).length;
  const depth = id => c.lessons.find(l => l.id === id).sections.reduce((n, s) => n + words(s.pro), 0);
  assert.ok(depth('seasons') >= 900, 'seasons words ' + depth('seasons'));
  assert.ok(depth('chain') >= 600, 'chain words ' + depth('chain'));
  assert.ok(depth('next') >= 500, 'next words ' + depth('next'));
  for (const l of c.lessons) { assert.ok(l.sections.length >= 2, l.id); for (const s of l.sections) assert.ok(words(s.pro) >= 60, `${l.id} / ${s.heading} is thin`); }
  const rulesText = JSON.stringify(c.lessons.find(l => l.id === 'rules'));
  assert.ok(rulesText.includes('42') && rulesText.includes('50'));
  if (/46/.test(rulesText)) assert.ok(/Master Angler/.test(rulesText), '46 may appear only as the Master Angler award size');
  assert.deepEqual(validateContent(c), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/content.test.js`
Expected: FAIL, lessons empty

- [ ] **Step 3: Write content/lessons.json**

Write the prose in Simplified Technical English: short sentences, active voice. Every section has `pro`, `yourJob`, and either `sources` or `reasoning: true`. The table below is the content contract. A section must make every listed claim, cite the listed sources, and end with the listed `yourJob`. Word floors: each section 60 or more words; `seasons` 900 or more in total; `chain` 600 or more; `next` 500 or more. Other chapters may be outlines of 60 to 120 words per section for version one.

| Lesson | Section heading | Claims the section must make | Sources | yourJob |
|---|---|---|---|---|
| fish (track both) | An ambush predator | Musky sit in or beside cover and strike from short range. They see well, and the lateral line senses vibration, which is why blades and rattles and the figure-8 work. | reasoning | "Keep the lure moving to the boat every cast. The strike zone includes the last ten feet." |
| fish | Temperature runs the metabolism | Cold-blooded: feeding speed tracks water temperature. Warm water, fast lures and short strike windows. Cold water, slow and big. Above the high 70s fish are stressed and release mortality rises. | reasoning | "Read the water temperature off the fish finder at launch and tell him." |
| fish | Why follows happen | A follow is a fish that committed to the lure and lost interest. Speed, size, or the lack of a direction change is usually the reason. The figure-8 turns follows into hits. | reasoning | "Watch behind his lure on every retrieve. Say 'fish' the moment you see one." |
| chain (both) | Fifteen lakes, one system | List all 15 with acres and depths where known. 4,000 acres, 270 miles of shoreline. Majority Michigan; Big, Mamie, West Bay cross the line. The 1931 dam raised levels 4 to 5 ft and created the navigable channels; Clearwater has no channel. Water varies about 6 inches a year. | lakelubbers, lake-link-gogebic, wi-musky-waters-2018 | "Learn the names. He will say 'Lindsley' and you need to know it is the deep one." |
| chain | Two deep basins, many bowls | Thousand Island 81 ft, thermocline 17 to 26 ft, no oxygen below 50 ft in summer, Secchi 12 ft, steep sand-gravel-peat shoals, sunken islands and logs. Lindsley 46 ft. Everything else mostly under 20 ft: Cisco 20, Record 16, Mamie 10, Clearwater 10, Fishhawk 8. Deep lakes stratify and turn over in fall; bowls do not. | mi-dnr-1993-thousand-island, lake-link-gogebic, wikipedia-mamie | "When the plan says a lake is a bowl, expect weeds everywhere and no deep edge." |
| chain | What the musky eat here | Thousand Island species list includes cisco, yellow perch, bluegill, rock bass, white sucker, walleye. Cisco are pelagic, spawn on rock in late fall. Perch and bluegill on the weeds. Suckers everywhere. Lure size and depth follow the forage. | mi-dnr-1993-thousand-island | "Tell him what the sonar shows: a cloud at 20 ft over the basin is cisco; dots in the weeds are perch." |
| chain | Musky status, lake by lake | Wisconsin rates Big, Mamie, and West Bay Class A1 trophy water, Category 1 self-sustaining, no stocking. Michigan stocked northern strain in Thousand Island; tiger musky and lake trout historically. 1988 survey saw two large fish, one about 25 lb, no natural reproduction documented. State record northern musky 49.75 lb from Thousand Island, 1980. Low density, big fish: fewer spots, more time, follows matter. | wi-musky-waters-2018, mi-dnr-sr47, mi-dnr-1993-thousand-island, mi-regs-2026, lakelubbers | "A1 means the fish are few and big. A follow here is a win. Log it." |
| chain | Access | Four public landings: Thousand Island (concrete DNR ramp, east shore, deep water, dock, toilets), Cisco, Big (marina on the south end), Mamie (gravel, at the Spring Creek inlet). From Fishhawk the chain is reachable by water through the channels. | anglers-isle, fishweb-ramp, lakelubbers | "Know which landing is closest to the lake in the plan." |
| seasons (both) | Spring, ice-out to 60°F | Post-spawn fish shallow, small baits, warming bays. Outline only. | reasoning | "Spring is for next year. Read this in April." |
| seasons | Summer, 60 to 78°F | Outside weed edges, suspended fish over basins near the thermocline, dawn, dusk, night, fast baits. Outline. | reasoning | "Summer notes go here after the first season." |
| seasons | Early fall, 72 down to 60°F | Full depth. Flats still green, perch on them, topwater and bucktails early and late, fish shallow in low light, the September 24 report as the live example. Suckers arrive in the bait shop in September. | allnorthwoods-2026-09-24, allnorthwoods-2026-09-10 | "Dawn and dusk are not optional in early fall. Be on the water before the sun." |
| seasons | Fall transition, 60 down to 52°F | Full depth. Flats brown off; fish move to the outside edge, points, inside turns, first break. Slow down: gliders, jerkbaits with pauses, twitched cranks. Midday warming matters. Follows increase before hits do. | reasoning | "Watch the weeds. Green and standing means stay. Brown and flat means move to the edge." |
| seasons | Turnover | Full depth. Deep lakes (Thousand Island, Lindsley) turn over when surface water cools to the temperature of the deep water, around 50 to 55°F; the lake mixes, water goes murky with debris, fishing drops for about a week. Shallow bowls never stratified, so they keep fishing. Move lakes rather than wait. | mi-dnr-1993-thousand-island; reasoning for the timing | "Look at the water and smell it. Murky, bubbles, bottom smell: turnover. Say it." |
| seasons | Late fall, under 52°F | Full depth. The biggest fish of the year. Suckers on quick-strike rigs off breaks, big rubber counted down, deep cranks trolled. Warmest hours of the day. Boundary water season closes December 31; Michigan inland runs to March 15. | allnorthwoods-2026-09-24, mi-regs-2026; reasoning for technique | "Dress for cold. A float that moves is the only thing you need to watch." |
| seasons | Cisco spawn, late November | Full depth. Thousand Island holds cisco. Cisco spawn on gravel and rock at dusk and after dark near the November full moon (November 24, 2026). Big musky move onto those shoals. Big rubber and cranks over hard bottom at dusk. | mi-dnr-1993-thousand-island, vinson-angradi-2014 | "Find the hard bottom on the sonar before dark. Lights and gloves ready." |
| clock (both) | Dawn and dusk | Low light is the strongest daily factor. One hour either side of sunrise and sunset. | reasoning | "Be on the first spot before the window opens, not during it." |
| clock | The moon, with the numbers | 341,959 catches: about 5% more around full and new moon, stronger for fish over 102 cm; night catch peaks at full moon. Dettloff: 34.7% of 40-inch-plus fish in the full moon period against 25% expected. Overhead and underfoot are the majors, rise and set the minors. The effect decides where to be at which hour, not whether to go. | vinson-angradi-2014, dettloff-moon | "The plan lists the windows. Keep the clock and call them." |
| weather (both) | Pressure | Falling pressure ahead of a front: feeding. Rising high pressure after: tough for a day or two. The app computes the 3-hour trend from Open-Meteo and shows it in inHg. | open-meteo; reasoning | "Read the trend arrow in the plan before launch and tell him." |
| weather | Wind | Wind loads bait onto the windward structure. Points and flats on that side first. Spinnerbaits and bucktails in chop. | reasoning | "Keep the boat upwind so he casts with the wind across the spot." |
| weather | Sky and fronts | Cloud and chop extend low light into midday. Bluebird post-front days: slow, cover, inside turns, moon windows. | reasoning | "On a bluebird day expect follows. Log them all." |
| structure (both) | The vocabulary | Define weed flat, inside and outside weed edge, point, inside turn, saddle, hump, break, neck, inlet, outlet, rock, wood, island, shoal, matching spot-types.json. | reasoning | "Point at the structure on the map and say its name. That is the job." |
| structure | Weeds | Cabbage (broadleaf pondweed) is the musky weed: open, tall, holds perch. Coontail is dense and holds fish on its edge. Milfoil mats. Green weeds hold fish; brown weeds do not. | reasoning | "Lift a weed on the lure and name it. Green cabbage is good news." |
| structure | Reading the DNR map | Contour lines close together mean a steep break. A flat with a steep edge is a classic spot. Necks and inlet mouths are marked. Islands have a shallow side and a steep side. | mi-dnr-1993-thousand-island | "Open the lake map in the app and find the steepest break near the launch." |
| lures (both) | The families | Bucktail, topwater, glider, jerkbait, crankbait, rubber, spinnerbait, sucker. For each: when, speed, depth, temperature band, when not. Mirror lures.json. | allnorthwoods-2026-09-24; reasoning | "Tie on the next lure before he asks for it." |
| lures | Speed is the first variable | Most follows that do not hit are a speed problem. Faster in warm water, slower in cold. Change speed before changing lures. | reasoning | "Count his cadence. If follows stay lazy, suggest slower; if they turn away hot, suggest faster." |
| presentation (both) | The figure-8 | Every cast, rod tip deep, wide turns, speed up on the turns. Most boat-side hits come on the second turn. | reasoning | "Watch the 8 with the net in hand. Stay back from the rod." |
| presentation | Boat control | Position upwind, cast across structure not along it, trolling motor quiet over clear water. | reasoning | "You run the trolling motor. Keep the boat where he can cast across the edge." |
| presentation | Trolling and suckers | Trolling 2.5 to 4 mph, line out sets depth, rods in holders, watch tips. Suckers on quick-strike rigs, set on the strike, never let a fish swallow. | mi-regs-2026; reasoning | "Rod tips and the float are your two jobs when we troll or soak suckers." |
| gear (both) | Rod, reel, line | Heavy rod, 80 to 100 lb braid, fluorocarbon or wire leader. | reasoning | "Check leaders for nicks after every fish and every snag." |
| gear | Release tools and fish care | Big net, bump board, hook cutters, long pliers, jaw spreaders. Fish stays in the water in the net; measure in the boat on a board, lower jaw to tail tip, per Muskies Inc; quick photo; release. Girth at the widest point; weight estimate L x G x G / 800. | muskies-inc-lunge-log | "Lay the tools out on the deck before the first cast. Net, cutters, pliers, board." |
| rules (both) | Three size limits on one chain | Michigan-only lakes: 42 inches, one per license year, register within 24 hours, catch-and-release all year, possession first Saturday in June through March 15. Big, Mamie, West Bay: boundary water, 50 inches, first Saturday in June through December 31, either state license, follow the state you are in, up to 3 lines. The 46-inch figure is the Master Angler award minimum, not a rule. | mi-regs-2026 | "Know which lake you are on. The rule changes when you cross a neck into Big." |
| rules | Pike and licenses | Pike rules on the chain lakes are listed in the digest county list; check before keeping one. Carry the right license. | mi-regs-2026 | "Carry both licenses if you fish Big, Mamie, or West Bay." |
| first-mate (basics) | Before launch | Tools laid out, net rigged, lures tied, plan read aloud: windows, spots, lures, the rule for this lake. | reasoning | "Read him the plan's top window and top spot before you leave the dock." |
| first-mate | On the water | Run the trolling motor, call the depth and the weeds, watch behind his lure, keep the clock, log every follow before the next cast. | reasoning | "Say what you see. Fish, weeds, depth, bait. Short words." |
| first-mate | When a fish is on | Net in the water first, not last. Lead the fish head-first into the net. Keep the fish in the net in the water until the tools are in hand. Cutters first on bad hooks. | muskies-inc-lunge-log; reasoning | "Net, then cutters, then board, then photo, then release. In that order." |
| next (both) | Nothing is happening | The checklist in order: inside a window or between them; weeds green or brown; on the edge or on top; speed right; bait on sonar; wind still on this structure. One change at a time, twenty minutes each. Labeled reasoning. | reasoning | "Keep the clock, call the weeds, say what the sonar shows." |
| next | A follow without a strike | The fish told you it is there, the lure is close, the trigger is missing. Speed first (faster warm, slower under 55°F), then the figure-8 (wider, deeper, faster turns), then size, then a different family with the same action, then come back in the next window. Mark the spot and time. Labeled reasoning. | reasoning | "Log the follow before the next cast. Net ready. Watch the fish on the 8 and say where it is." |
| next | When to adjust | Depth: follows from deep under the lure, bait deeper on sonar, water under 55°F. Retrieve: lazy follows mean speed or pauses; hot follows that turn away mean a bigger, faster 8. Boat position: wind changed, casting with the wind instead of across, too close in 12 ft visibility. Location: two windows with no sign, dead weeds, no bait, wind now loads another lake. Record every adjustment as a note with why and what happened. Labeled reasoning; link `presentation`, `lures`. | reasoning | "Time the twenty minutes, say when a window opens or closes, next lure ready, and write down why he changed." |

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/content.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/lessons.json test/content.test.js
git commit -m "content: twelve lessons, fall and what-to-do-next at full depth"
```

### Task 8: Rule engine

**Files:**
- Create: `js/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: `windows()` output from Task 2 (`{ kind, label, anchor, start, end }`), content from Task 4, pattern and lure shapes from Task 6.
- Produces:
  - `Conditions` object the planner builds: `{ lakeId, lakeCharacter, dateIso, month, waterTempF, sky, windMph, windCompass, pressureTrend, hoursSinceFront, clarity, presentation, moonPhaseName }`. Any value may be `null`.
  - `validateInputs(cond) → string[]`
  - `matchPatterns(patterns, cond) → Pattern[]`
  - `dayWindows(astroWindows, sun) → Window[]` adds `midday` (solar noon ±2 h) and `night` (dusk end to 23:00) and marks overlaps
  - `scoreWindows(windows, matched) → [{ window, score, reasons: Reason[], stacks: string[] }]` sorted desc
  - `scoreSpots(spots, matched, cond, logStats = {}) → [{ spot, score, reasons }]` sorted desc, excludes other lakes
  - `scoreLures(lures, matched, cond) → [{ lure, score, reasons }]` sorted desc, excludes lures the presentation forbids
  - `plan({ content, spots, cond, astroWindows, sun, logStats }) → { windows, spots, lures, watchFor, matched, errors }`
  - `Reason = { patternId, pro, yourJob }`

- [ ] **Step 1: Write the failing test**

`test/engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../js/content.js';
import { windows, sunTimes, CHAIN } from '../js/astro.js';
import { validateInputs, matchPatterns, dayWindows, scoreWindows, scoreSpots, scoreLures, plan } from '../js/engine.js';

const fetchFn = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../' + url, import.meta.url), 'utf8')) });
const content = await loadContent(fetchFn);
const oct2 = new Date('2026-10-02T12:00:00-05:00');
const aw = windows(oct2, CHAIN.lat, CHAIN.lon, CHAIN.tz), sun = sunTimes(oct2, CHAIN.lat, CHAIN.lon, CHAIN.tz);

const spots = [
  { id: 'a', lakeId: 'thousand-island', name: 'North flat', lat: 46.24, lon: -89.39, type: 'weed_flat', bestWind: ['W', 'SW', 'NW'], tempBandsF: [[58, 72]], months: [9, 10], addedBy: 'seed', verified: false, source: 'x' },
  { id: 'b', lakeId: 'thousand-island', name: 'East break', lat: 46.23, lon: -89.38, type: 'break', bestWind: ['E'], tempBandsF: [[36, 55]], months: [10, 11], addedBy: 'seed', verified: false, source: 'x' },
  { id: 'c', lakeId: 'cisco', name: 'Dam end', lat: 46.24, lon: -89.45, type: 'outlet', bestWind: [], tempBandsF: [[40, 70]], months: [], addedBy: 'seed', verified: false, source: 'x' },
];
const warm = { lakeId: 'thousand-island', lakeCharacter: 'deep_basin', dateIso: '2026-10-02', month: 10, waterTempF: 62, sky: 'partly', windMph: 12, windCompass: 'W', pressureTrend: 'falling', hoursSinceFront: null, clarity: 'clear', presentation: 'any', moonPhaseName: 'Waning Gibbous' };
const cold = { ...warm, dateIso: '2026-11-07', month: 11, waterTempF: 45, sky: 'sun', windMph: 3, windCompass: 'N', pressureTrend: 'rising', hoursSinceFront: 12 };

test('validateInputs refuses water temperature outside 32 to 90', () => {
  assert.deepEqual(validateInputs(warm), []);
  assert.ok(validateInputs({ ...warm, waterTempF: 12 }).some(e => /32/.test(e) && /90/.test(e)));
  assert.ok(validateInputs({ ...warm, waterTempF: 212 }).length > 0);
  assert.ok(validateInputs({ ...warm, lakeId: null }).length > 0);
});

test('matchPatterns: warm early fall matches the flats rule, not the sucker rule', () => {
  const ids = matchPatterns(content.patterns, warm).map(p => p.id);
  assert.ok(ids.includes('fall-warm-flats') && ids.includes('pre-front') && ids.includes('wind-loaded'));
  assert.ok(!ids.includes('fall-cold-suckers') && !ids.includes('post-front'));
});

test('matchPatterns: a pattern with a condition the inputs lack does not match', () => {
  const ids = matchPatterns(content.patterns, { ...warm, hoursSinceFront: null, sky: 'sun', pressureTrend: 'rising' }).map(p => p.id);
  assert.ok(!ids.includes('post-front'));
  const ids2 = matchPatterns(content.patterns, cold).map(p => p.id);
  assert.ok(ids2.includes('post-front') && ids2.includes('fall-cold-suckers'));
});

test('dayWindows adds midday and night and flags the dusk/underfoot stack on Oct 2', () => {
  const w = dayWindows(aw, sun);
  assert.ok(w.some(x => x.kind === 'midday') && w.some(x => x.kind === 'night'));
  const dusk = w.find(x => x.kind === 'dusk');
  assert.ok(dusk.stacks.some(s => /underfoot/i.test(s)), JSON.stringify(dusk.stacks));
});

test('scoreWindows puts dusk first in warm early fall with reasons', () => {
  const m = matchPatterns(content.patterns, warm);
  const s = scoreWindows(dayWindows(aw, sun), m);
  assert.equal(s[0].window.kind, 'dusk');
  assert.ok(s[0].reasons.length > 0 && s[0].reasons[0].pro.length > 20 && s[0].reasons[0].yourJob.length > 5);
});

test('scoreSpots filters to the lake, rewards wind and temperature fit, and uses the log bonus', () => {
  const m = matchPatterns(content.patterns, warm);
  const s = scoreSpots(spots, m, warm);
  assert.deepEqual(s.map(x => x.spot.id), ['a', 'b']);
  assert.ok(s[0].reasons.some(r => /wind/i.test(r.pro)));
  const boosted = scoreSpots(spots, m, warm, { b: { followsPerHour: 3, follows: 6, hours: 2 } });
  const bBefore = s.find(x => x.spot.id === 'b').score, bAfter = boosted.find(x => x.spot.id === 'b').score;
  assert.ok(bAfter > bBefore, `log bonus ${bBefore} -> ${bAfter}`);
  assert.ok(boosted.find(x => x.spot.id === 'b').reasons.some(r => /your log/i.test(r.pro)));
});

test('scoreLures: warm favors topwater and bucktail; cold favors sucker and rubber; presentation filters', () => {
  const warmTop = scoreLures(content.lures, matchPatterns(content.patterns, warm), warm).slice(0, 3).map(x => x.lure.family);
  assert.ok(warmTop.includes('topwater') || warmTop.includes('bucktail'));
  assert.ok(!warmTop.includes('sucker'));
  const coldTop = scoreLures(content.lures, matchPatterns(content.patterns, cold), cold).slice(0, 3).map(x => x.lure.family);
  assert.ok(coldTop.includes('sucker') || coldTop.includes('rubber'));
  const troll = scoreLures(content.lures, matchPatterns(content.patterns, cold), { ...cold, presentation: 'trolling' });
  assert.ok(troll.every(x => x.lure.trollOk));
  const cast = scoreLures(content.lures, matchPatterns(content.patterns, cold), { ...cold, presentation: 'casting' });
  assert.ok(cast.every(x => x.lure.family !== 'sucker'));
});

test('plan returns the three lists, a watchFor line, and is deterministic', () => {
  const a = plan({ content, spots, cond: warm, astroWindows: aw, sun });
  const b = plan({ content, spots, cond: warm, astroWindows: aw, sun });
  assert.deepEqual(a.windows.map(x => x.window.kind), b.windows.map(x => x.window.kind));
  assert.ok(a.windows.length >= 4 && a.spots.length === 2 && a.lures.length >= 3);
  assert.ok(typeof a.watchFor === 'string' && a.watchFor.length > 10);
  assert.deepEqual(a.errors, []);
  const bad = plan({ content, spots, cond: { ...warm, waterTempF: 5 }, astroWindows: aw, sun });
  assert.ok(bad.errors.length > 0 && bad.spots.length === 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL, cannot find module `../js/engine.js`

- [ ] **Step 3: Write engine.js**

```js
const COMPASS_GROUP = { N: ['N', 'NNE', 'NNW'], NE: ['NE', 'NNE', 'ENE'], E: ['E', 'ENE', 'ESE'], SE: ['SE', 'ESE', 'SSE'], S: ['S', 'SSE', 'SSW'], SW: ['SW', 'SSW', 'WSW'], W: ['W', 'WSW', 'WNW'], NW: ['NW', 'WNW', 'NNW'] };
const inBand = (v, bands) => v != null && Array.isArray(bands) && bands.some(([lo, hi]) => v >= lo && v <= hi);
const reason = p => ({ patternId: p.id, pro: p.pro, yourJob: p.yourJob });

export function validateInputs(cond) {
  const errs = [];
  if (!cond.lakeId) errs.push('Pick a lake.');
  if (cond.waterTempF != null && (cond.waterTempF < 32 || cond.waterTempF > 90)) errs.push(`Water temperature ${cond.waterTempF} is outside 32 to 90 °F. Read it in Fahrenheit off the fish finder.`);
  if (cond.windMph != null && (cond.windMph < 0 || cond.windMph > 60)) errs.push('Wind speed must be 0 to 60 mph.');
  return errs;
}

function matchOne(when, cond) {
  for (const [k, v] of Object.entries(when)) {
    const c = cond[k === 'tempF' ? 'waterTempF' : k === 'frontHoursAgo' ? 'hoursSinceFront' : k === 'months' ? 'month' : k];
    if (c === null || c === undefined) return false;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && ['tempF', 'windMph', 'frontHoursAgo'].includes(k)) { if (c < v[0] || c > v[1]) return false; }
    else if (Array.isArray(v)) { if (!v.includes(c)) return false; }
    else if (v !== c) return false;
  }
  return true;
}

export function matchPatterns(patterns, cond) { return patterns.filter(p => matchOne(p.when || {}, cond)); }

export function dayWindows(astroWindows, sun) {
  const out = astroWindows.map(w => ({ ...w, stacks: [] }));
  if (sun?.solarNoon) { const n = sun.solarNoon.getTime(); out.push({ kind: 'midday', label: 'Midday', anchor: sun.solarNoon, start: new Date(n - 7200000), end: new Date(n + 7200000), stacks: [] }); }
  if (sun?.dusk) { const d = sun.dusk.getTime(); const e = new Date(d); e.setHours(23, 0, 0, 0); if (e > sun.dusk) out.push({ kind: 'night', label: 'After dark', anchor: sun.dusk, start: sun.dusk, end: e, stacks: [] }); }
  for (const a of out) for (const b of out) if (a !== b && a.kind !== 'midday' && b.kind !== 'midday' && a.kind !== 'night' && b.kind !== 'night' && a.start < b.end && b.start < a.end) a.stacks.push(b.label);
  return out.sort((a, b) => a.start - b.start);
}

export function scoreWindows(windows, matched) {
  return windows.map(window => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.windows?.[window.kind] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if (window.stacks.length) score += 2;
    return { window, score, reasons, stacks: window.stacks };
  }).sort((a, b) => b.score - a.score || a.window.start - b.window.start);
}

export function scoreSpots(spots, matched, cond, logStats = {}) {
  const group = COMPASS_GROUP[(cond.windCompass || '').slice(0, 2)] || COMPASS_GROUP[(cond.windCompass || '').slice(0, 1)] || [];
  return spots.filter(s => s.lakeId === cond.lakeId).map(spot => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.spotTypes?.[spot.type] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if ((spot.bestWind || []).some(d => d === cond.windCompass || group.includes(d))) { score += 2; reasons.push({ patternId: 'wind-fit', pro: `Wind from the ${cond.windCompass} is on this spot.`, yourJob: 'Keep the boat upwind of it.' }); }
    if (inBand(cond.waterTempF, spot.tempBandsF)) { score += 2; reasons.push({ patternId: 'temp-fit', pro: `${cond.waterTempF}°F is inside this spot's band.`, yourJob: 'Confirm the temperature when we arrive.' }); }
    if ((spot.months || []).includes(cond.month)) score += 1;
    const st = logStats[spot.id];
    if (st && st.followsPerHour > 0) { const b = Math.min(3, Math.round(st.followsPerHour * 2)); score += b; reasons.push({ patternId: 'your-log', pro: `Your log: ${st.follows} follows in ${st.hours.toFixed(1)} hours here.`, yourJob: 'Repeat what worked last time; it is in the trip log.' }); }
    if (spot.verified === false) reasons.push({ patternId: 'unverified', pro: 'Unverified: read from a map or report, not fished yet.', yourJob: 'Mark it verified from the trip once you fish it.' });
    return { spot, score, reasons };
  }).sort((a, b) => b.score - a.score || a.spot.name.localeCompare(b.spot.name));
}

export function scoreLures(lures, matched, cond) {
  const pres = cond.presentation || 'any';
  return lures.filter(l => pres === 'any' || (pres === 'trolling' ? l.trollOk : pres === 'suckers' ? l.family === 'sucker' : l.family !== 'sucker')).map(lure => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.lureFamilies?.[lure.family] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if (cond.waterTempF != null) { if (inBand(cond.waterTempF, lure.tempBandsF)) score += 3; else { score -= 5; reasons.push({ patternId: 'temp-miss', pro: `${cond.waterTempF}°F is outside this lure's band. ${lure.whenNot}`, yourJob: 'Leave it in the box today.' }); } }
    if (cond.sky && (lure.light || []).includes(cond.sky)) score += 1;
    if (cond.windMph != null && lure.windMph && cond.windMph >= lure.windMph[0] && cond.windMph <= lure.windMph[1]) score += 1;
    return { lure, score, reasons };
  }).sort((a, b) => b.score - a.score || a.lure.id.localeCompare(b.lure.id));
}

function watchLine(matched, cond) {
  const t = cond.waterTempF;
  const top = [...matched].sort((a, b) => Object.values(b.favor?.windows || {}).reduce((x, y) => x + y, 0) - Object.values(a.favor?.windows || {}).reduce((x, y) => x + y, 0))[0];
  const sign = t == null ? 'Enter the water temperature from the fish finder.' : t > 58 ? 'Watch for bait on the flats and wakes behind the lure.' : t > 50 ? 'Watch the weeds: green means stay, brown means move to the edge. Follows count.' : 'Watch the float and the sonar; the fish are deep and slow.';
  return (top ? top.name + '. ' : '') + sign;
}

export function plan({ content, spots, cond, astroWindows, sun, logStats = {} }) {
  const errors = validateInputs(cond);
  if (errors.length) return { windows: [], spots: [], lures: [], watchFor: errors.join(' '), matched: [], errors };
  const matched = matchPatterns(content.patterns, cond);
  return {
    windows: scoreWindows(dayWindows(astroWindows, sun), matched),
    spots: scoreSpots(spots, matched, cond, logStats).slice(0, 5),
    lures: scoreLures(content.lures, matched, cond).slice(0, 3),
    watchFor: watchLine(matched, cond), matched, errors,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/engine.test.js`
Expected: PASS, 8 tests. If `scoreLures` warm test fails because topwater lands fourth, check that `fall-warm-flats` and `pre-front` both matched (`pressureTrend: 'falling'`); print `matched.map(p => p.id)`.

- [ ] **Step 5: Commit**

```bash
git add js/engine.js test/engine.test.js
git commit -m "feat: rule engine ranks windows, spots, and lures with reasons"
```

### Task 9: Trip log logic

**Files:**
- Create: `js/log.js`
- Test: `test/log.test.js`

**Interfaces:**
- Consumes: adapter from Task 4, `nearestMoonEvent` and `moonPhase` from Task 2, `Conditions` from Task 8.
- Produces:
  - `EVENT_KINDS = ['here', 'follow', 'strike', 'catch', 'note', 'bait']`
  - `snapshot({ at, lat, lon, cond, astro }) → Snapshot` where `Snapshot = { at: ISO, lat, lon, moonPhase, moonFraction, moonEvent: { kind, minutes }, pressureInHg, pressureTrend, windMph, windCompass, sky, waterTempF, clarity, forecastAgeMin }`; `astro = { nearest(at) → { kind, minutes }, phase(at) → { name, fraction } }`
  - `startTrip(db, { lakeId, plan, cond, presentation }) → trip` with `trip = { id, lakeId, startedAt, endedAt: null, plan, cond, presentation, rating: null, worked: '', notes: '' }`
  - `addEvent(db, tripId, { kind, ...fields }, snap) → event` with `event = { id, tripId, kind, at, spotId, snapshot, ...fields }`; `note` fields: `text, adjustment: null | { what, why, outcome }`
  - `setOutcome(db, eventId, outcome)`
  - `endTrip(db, tripId, { rating, worked, notes }) → trip`
  - `effortBySpot(events, trip) → { [spotId]: hours }` with `'none'` for time before the first Here
  - `rates(events, trip) → { bySpot: { [spotId]: { hours, follows, strikes, catches, followsPerHour } }, byLure: { [lureId]: { follows, strikes, catches } }, total: { hours, follows, catches, followsPerHour } }`
  - `verifySpots(db, events) → string[]` ids flipped
  - `tripTimeline(events) → Event[]` sorted by `at`, adjustments included in order
  - `logStatsForPlanner(allEvents, trips) → { [spotId]: { followsPerHour, follows, hours } }`

- [ ] **Step 1: Write the failing test**

`test/log.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/store.js';
import { EVENT_KINDS, snapshot, startTrip, addEvent, setOutcome, endTrip, effortBySpot, rates, verifySpots, tripTimeline, logStatsForPlanner } from '../js/log.js';

const cond = { lakeId: 'thousand-island', waterTempF: 62, sky: 'partly', windMph: 12, windCompass: 'W', pressureTrend: 'falling', pressureInHg: 29.85, clarity: 'clear', forecastAgeMin: 30 };
const astro = { nearest: () => ({ kind: 'underfoot', minutes: 10 }), phase: () => ({ name: 'Waning Gibbous', fraction: 0.6 }) };
const T = h => new Date(Date.UTC(2026, 9, 2, 22 + h, 0)).toISOString(); // 5pm CDT + h hours

async function seed() {
  const db = createMemoryStore();
  await db.put('spots', { id: 'a', lakeId: 'thousand-island', name: 'North flat', lat: 46.24, lon: -89.39, type: 'weed_flat', addedBy: 'seed', verified: false, source: 'x' });
  const trip = await startTrip(db, { lakeId: 'thousand-island', plan: { windows: [] }, cond, presentation: 'casting' });
  trip.startedAt = T(0); await db.put('trips', trip);
  const snap = at => snapshot({ at, lat: 46.24, lon: -89.39, cond, astro });
  await addEvent(db, trip.id, { kind: 'here', spotId: 'a', at: T(0) }, snap(T(0)));
  await addEvent(db, trip.id, { kind: 'follow', spotId: 'a', at: T(0.5), lureId: 'topwater-walker', color: 'black', sizeEstimateIn: 42, heat: 'hot', seen: 'boat side', speed: 'medium', position: 'edge', depthUnderBoatFt: 6 }, snap(T(0.5)));
  await addEvent(db, trip.id, { kind: 'note', at: T(0.75), text: 'Switched to glider', adjustment: { what: 'lure', why: 'Hot follow turned away on the 8; wanted a pause', outcome: null } }, snap(T(0.75)));
  await addEvent(db, trip.id, { kind: 'follow', spotId: 'a', at: T(1), lureId: 'glider-10', color: 'perch', sizeEstimateIn: 40, heat: 'lazy', seen: 'mid-retrieve', speed: 'slow', position: 'edge', depthUnderBoatFt: 7 }, snap(T(1)));
  await addEvent(db, trip.id, { kind: 'catch', spotId: 'a', at: T(1.5), lureId: 'glider-10', color: 'perch', lengthIn: 44, girthIn: 20, hitWhere: 'on the 8', fishDepthFt: 4, depthUnderBoatFt: 7, hookLocation: 'corner of jaw', releaseSeconds: 70, marks: 'scar left flank' }, snap(T(1.5)));
  return { db, trip };
}

test('snapshot carries the twelve facts', () => {
  const s = snapshot({ at: T(0), lat: 1, lon: 2, cond, astro });
  for (const k of ['at', 'lat', 'lon', 'moonPhase', 'moonFraction', 'moonEvent', 'pressureInHg', 'pressureTrend', 'windMph', 'windCompass', 'sky', 'waterTempF', 'clarity', 'forecastAgeMin']) assert.ok(k in s, k);
  assert.equal(s.moonEvent.kind, 'underfoot');
});

test('addEvent rejects unknown kinds and bad lengths', async () => {
  const { db, trip } = await seed();
  await assert.rejects(addEvent(db, trip.id, { kind: 'bogus', at: T(2) }, {}));
  await assert.rejects(addEvent(db, trip.id, { kind: 'catch', at: T(2), lengthIn: 0 }, {}));
  await assert.rejects(addEvent(db, trip.id, { kind: 'catch', at: T(2), lengthIn: 75 }, {}));
  assert.deepEqual(EVENT_KINDS, ['here', 'follow', 'strike', 'catch', 'note', 'bait']);
});

test('effort and rates: 2 follows and 1 catch in 2 hours on spot a', async () => {
  const { db, trip } = await seed();
  const ended = await endTrip(db, trip.id, { rating: 4, worked: 'glider after a hot follow', notes: '' });
  ended.endedAt = T(2); await db.put('trips', ended);
  const events = (await db.all('events')).filter(e => e.tripId === trip.id);
  const eff = effortBySpot(events, ended);
  assert.ok(Math.abs(eff.a - 2) < 0.01);
  const r = rates(events, ended);
  assert.equal(r.bySpot.a.follows, 2); assert.equal(r.bySpot.a.catches, 1); assert.ok(Math.abs(r.bySpot.a.followsPerHour - 1) < 0.01);
  assert.equal(r.byLure['glider-10'].follows, 1); assert.equal(r.byLure['glider-10'].catches, 1);
  assert.ok(Math.abs(r.total.hours - 2) < 0.01);
});

test('a trip with no Here still computes per-hour rates from trip duration', async () => {
  const db = createMemoryStore();
  const trip = await startTrip(db, { lakeId: 'cisco', plan: {}, cond, presentation: 'any' });
  trip.startedAt = T(0); trip.endedAt = T(4); await db.put('trips', trip);
  await addEvent(db, trip.id, { kind: 'follow', at: T(1), lureId: 'x', heat: 'lazy' }, {});
  await addEvent(db, trip.id, { kind: 'follow', at: T(3), lureId: 'x', heat: 'lazy' }, {});
  const events = await db.all('events');
  const r = rates(events, trip);
  assert.equal(r.total.hours, 4);
  assert.equal(r.total.followsPerHour, 0.5);
  assert.equal(r.bySpot.none.follows, 2);
  assert.ok(Number.isFinite(r.bySpot.none.followsPerHour));
});

test('adjustment notes keep why and outcome and sit in the timeline', async () => {
  const { db, trip } = await seed();
  const events = await db.all('events');
  const note = events.find(e => e.kind === 'note');
  assert.equal(note.adjustment.what, 'lure');
  await setOutcome(db, note.id, 'Lazy follow then a 44 on the glider');
  assert.equal((await db.get('events', note.id)).adjustment.outcome, 'Lazy follow then a 44 on the glider');
  const tl = tripTimeline(await db.all('events'));
  assert.deepEqual(tl.map(e => e.kind), ['here', 'follow', 'note', 'follow', 'catch']);
});

test('verifySpots flips seeded spots that were fished, and planner stats aggregate across trips', async () => {
  const { db, trip } = await seed();
  const flipped = await verifySpots(db, await db.all('events'));
  assert.deepEqual(flipped, ['a']);
  assert.equal((await db.get('spots', 'a')).verified, true);
  trip.endedAt = T(2); await db.put('trips', trip);
  const stats = logStatsForPlanner(await db.all('events'), await db.all('trips'));
  assert.equal(stats.a.follows, 2); assert.ok(Math.abs(stats.a.followsPerHour - 1) < 0.01);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/log.test.js`
Expected: FAIL, cannot find module `../js/log.js`

- [ ] **Step 3: Write log.js**

```js
import { newId } from './store.js';

export const EVENT_KINDS = ['here', 'follow', 'strike', 'catch', 'note', 'bait'];
const HOUR = 3600000;

export function snapshot({ at, lat, lon, cond = {}, astro }) {
  const d = new Date(at);
  const ev = astro?.nearest ? astro.nearest(d) : null;
  const ph = astro?.phase ? astro.phase(d) : null;
  return {
    at: d.toISOString(), lat: lat ?? null, lon: lon ?? null,
    moonPhase: ph?.name ?? null, moonFraction: ph?.fraction ?? null,
    moonEvent: ev ? { kind: ev.kind, minutes: ev.minutes } : null,
    pressureInHg: cond.pressureInHg ?? null, pressureTrend: cond.pressureTrend ?? null,
    windMph: cond.windMph ?? null, windCompass: cond.windCompass ?? null, sky: cond.sky ?? null,
    waterTempF: cond.waterTempF ?? null, clarity: cond.clarity ?? null, forecastAgeMin: cond.forecastAgeMin ?? null,
  };
}

export async function startTrip(db, { lakeId, plan, cond, presentation = 'any' }) {
  const trip = { id: newId('trip'), lakeId, startedAt: new Date().toISOString(), endedAt: null, plan: plan ?? null, cond: cond ?? null, presentation, rating: null, worked: '', notes: '' };
  await db.put('trips', trip);
  return trip;
}

export async function addEvent(db, tripId, fields, snap) {
  if (!EVENT_KINDS.includes(fields.kind)) throw new Error('unknown event kind ' + fields.kind);
  if (fields.kind === 'catch' && !(fields.lengthIn > 0 && fields.lengthIn <= 70)) throw new Error('length must be 1 to 70 inches');
  if (fields.kind === 'note' && fields.adjustment && !['depth', 'retrieve', 'lure', 'boat_position', 'location'].includes(fields.adjustment.what)) throw new Error('unknown adjustment');
  const event = { id: newId('evt'), tripId, at: fields.at || new Date().toISOString(), spotId: fields.spotId ?? null, snapshot: snap ?? null, ...fields };
  if (event.kind === 'catch' && event.lengthIn && event.girthIn) event.estWeightLb = Math.round((event.lengthIn * event.girthIn * event.girthIn) / 800 * 10) / 10;
  await db.put('events', event);
  return event;
}

export async function setOutcome(db, eventId, outcome) {
  const e = await db.get('events', eventId);
  if (!e || !e.adjustment) throw new Error('not an adjustment note');
  e.adjustment = { ...e.adjustment, outcome };
  await db.put('events', e);
  return e;
}

export async function endTrip(db, tripId, { rating = null, worked = '', notes = '' } = {}) {
  const t = await db.get('trips', tripId);
  if (!t) throw new Error('no trip ' + tripId);
  Object.assign(t, { endedAt: new Date().toISOString(), rating, worked, notes });
  await db.put('trips', t);
  return t;
}

export function tripTimeline(events) { return [...events].sort((a, b) => new Date(a.at) - new Date(b.at)); }

export function effortBySpot(events, trip) {
  const end = new Date(trip.endedAt || Date.now()).getTime();
  const heres = tripTimeline(events).filter(e => e.kind === 'here');
  const out = {};
  let cursor = new Date(trip.startedAt).getTime(), current = 'none';
  for (const h of heres) { const t = new Date(h.at).getTime(); out[current] = (out[current] || 0) + Math.max(0, t - cursor) / HOUR; cursor = t; current = h.spotId || 'none'; }
  out[current] = (out[current] || 0) + Math.max(0, end - cursor) / HOUR;
  return out;
}

export function rates(events, trip) {
  const effort = effortBySpot(events, trip);
  const bySpot = {}, byLure = {};
  const bump = (o, k, f) => { o[k] = o[k] || { hours: 0, follows: 0, strikes: 0, catches: 0 }; o[k][f] += 1; };
  for (const e of events) {
    if (!['follow', 'strike', 'catch'].includes(e.kind)) continue;
    const f = e.kind === 'follow' ? 'follows' : e.kind === 'strike' ? 'strikes' : 'catches';
    bump(bySpot, e.spotId || 'none', f);
    if (e.lureId) bump(byLure, e.lureId, f);
  }
  for (const [k, v] of Object.entries(bySpot)) { v.hours = effort[k] || 0; v.followsPerHour = v.hours > 0 ? v.follows / v.hours : 0; }
  const hours = Object.values(effort).reduce((a, b) => a + b, 0);
  const follows = Object.values(bySpot).reduce((a, v) => a + v.follows, 0), catches = Object.values(bySpot).reduce((a, v) => a + v.catches, 0);
  return { bySpot, byLure, total: { hours, follows, catches, followsPerHour: hours > 0 ? follows / hours : 0 } };
}

export async function verifySpots(db, events) {
  const fished = new Set(events.filter(e => e.spotId).map(e => e.spotId));
  const flipped = [];
  for (const id of fished) { const s = await db.get('spots', id); if (s && s.verified === false) { s.verified = true; s.verifiedAt = new Date().toISOString(); await db.put('spots', s); flipped.push(id); } }
  return flipped.sort();
}

export function logStatsForPlanner(allEvents, trips) {
  const out = {};
  for (const trip of trips) {
    const ev = allEvents.filter(e => e.tripId === trip.id);
    const r = rates(ev, trip);
    for (const [spotId, v] of Object.entries(r.bySpot)) { if (spotId === 'none') continue; out[spotId] = out[spotId] || { follows: 0, hours: 0 }; out[spotId].follows += v.follows; out[spotId].hours += v.hours; }
  }
  for (const v of Object.values(out)) v.followsPerHour = v.hours > 0 ? v.follows / v.hours : 0;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/log.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add js/log.js test/log.test.js
git commit -m "feat: trip log with snapshots, effort, rates, adjustments, verification"
```

### Task 10: Export, import, and spots pack

**Files:**
- Create: `js/export.js`
- Test: `test/export.test.js`

**Interfaces:**
- Consumes: adapter (Task 4), events and trips (Task 9).
- Produces:
  - `LUNGE_LOG_COLUMNS` array of 22 column names in this order: Date, Time, Water Body, State, Length (in), Girth (in), Est Weight (lb), Lure Type, Lure Color, Lure Size (in), Sky, Water Clarity, Water Temp (F), Water Depth (ft), Fish Depth (ft), Weed Type, Bottom Type, Barometric Pressure (inHg), Pressure Trend, Moon Phase, Released, Notes
  - `csvEscape(v) → string`
  - `catchesToCsv({ events, trips, lakes, lures }) → string`
  - `eventsToCsv({ events, trips }) → string` every event, every scalar field, snapshot fields prefixed `snap_`
  - `toBackupJson(db) → Promise<{ kind: 'backup', version: 1, exportedAt, trips, events, spots, settings }>` (no photos, no forecasts)
  - `importJson(db, obj) → Promise<{ added, updated, skipped }>` accepts `kind: 'backup'` (merge by id, newer `updatedAt` wins, otherwise incoming wins) or `kind: 'spots-pack'` (adds seed spots; never overwrites a spot whose stored `addedBy !== 'seed'` or that has `verified: true`)

- [ ] **Step 1: Write the failing test**

`test/export.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/store.js';
import { LUNGE_LOG_COLUMNS, csvEscape, catchesToCsv, eventsToCsv, toBackupJson, importJson } from '../js/export.js';

const lakes = [{ id: 'thousand-island', name: 'Thousand Island Lake', states: ['MI'] }];
const lures = [{ id: 'glider-10', family: 'glider', example: '10 inch glider', sizeIn: 10 }];
const trip = { id: 't1', lakeId: 'thousand-island', startedAt: '2026-10-02T22:00:00.000Z', endedAt: '2026-10-03T00:00:00.000Z' };
const snap = { at: '2026-10-02T23:30:00.000Z', sky: 'partly', clarity: 'clear', waterTempF: 62, pressureInHg: 29.85, pressureTrend: 'falling', moonPhase: 'Waning Gibbous' };
const catchEv = { id: 'e1', tripId: 't1', kind: 'catch', at: '2026-10-02T23:30:00.000Z', spotId: 'a', lureId: 'glider-10', color: 'perch, "natural"', lengthIn: 44, girthIn: 20, estWeightLb: 22, fishDepthFt: 4, depthUnderBoatFt: 7, weedType: 'cabbage', bottom: 'sand', released: true, notes: 'on the 8', snapshot: snap };
const followEv = { id: 'e2', tripId: 't1', kind: 'follow', at: '2026-10-02T22:30:00.000Z', spotId: 'a', lureId: 'glider-10', heat: 'hot', snapshot: snap };

test('csvEscape quotes commas, quotes, and newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape(null), '');
});

test('catchesToCsv emits Lunge Log columns in order with local date and time', () => {
  const csv = catchesToCsv({ events: [catchEv, followEv], trips: [trip], lakes, lures });
  const [head, row, ...rest] = csv.trim().split('\n');
  assert.equal(head, LUNGE_LOG_COLUMNS.join(','));
  assert.equal(rest.length, 0);
  const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, ''));
  assert.equal(cells[0], '2026-10-02'); assert.equal(cells[1], '6:30 pm');
  assert.equal(cells[2], 'Thousand Island Lake'); assert.equal(cells[3], 'MI');
  assert.equal(cells[4], '44'); assert.equal(cells[5], '20'); assert.equal(cells[6], '22');
  assert.equal(cells[7], 'glider'); assert.equal(cells[8], '"perch, ""natural"""');
  assert.equal(cells[14], '4'); assert.equal(cells[17], '29.85'); assert.equal(cells[19], 'Waning Gibbous'); assert.equal(cells[20], 'yes');
});

test('eventsToCsv includes every event and snapshot columns', () => {
  const csv = eventsToCsv({ events: [catchEv, followEv], trips: [trip] });
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('snap_waterTempF') && lines[0].includes('kind') && lines[0].includes('heat'));
});

test('backup round-trips through importJson and merges by id', async () => {
  const db = createMemoryStore();
  await db.put('trips', trip); await db.put('events', catchEv); await db.put('spots', { id: 'a', name: 'North flat', addedBy: 'truman', verified: true, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat' });
  await db.put('settings', { id: 'units', value: 'us' });
  const b = await toBackupJson(db);
  assert.equal(b.kind, 'backup'); assert.equal(b.events.length, 1); assert.ok(!('photos' in b));
  const db2 = createMemoryStore();
  const r = await importJson(db2, b);
  assert.equal(r.added, 4);
  assert.equal((await db2.get('events', 'e1')).lengthIn, 44);
  const r2 = await importJson(db2, b);
  assert.equal(r2.added, 0); assert.equal(r2.updated, 4);
});

test('spots pack never overwrites a user-edited or verified spot', async () => {
  const db = createMemoryStore();
  await db.put('spots', { id: 'a', name: 'North flat (Dad)', addedBy: 'dad', verified: true, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat' });
  await db.put('spots', { id: 'b', name: 'Old seed', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'point', notes: 'v1' });
  const pack = { kind: 'spots-pack', spots: [
    { id: 'a', name: 'North flat', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat', source: 'map' },
    { id: 'b', name: 'Old seed', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'point', notes: 'v2', source: 'map' },
    { id: 'c', name: 'New', addedBy: 'seed', verified: false, lakeId: 'cisco', lat: 1, lon: 1, type: 'neck', source: 'map' },
  ] };
  const r = await importJson(db, pack);
  assert.deepEqual(r, { added: 1, updated: 1, skipped: 1 });
  assert.equal((await db.get('spots', 'a')).name, 'North flat (Dad)');
  assert.equal((await db.get('spots', 'b')).notes, 'v2');
  await assert.rejects(importJson(db, { kind: 'nope' }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/export.test.js`
Expected: FAIL, cannot find module `../js/export.js`

- [ ] **Step 3: Write export.js**

```js
import { fmtTime, localDayBounds, CHAIN } from './astro.js';

export const LUNGE_LOG_COLUMNS = ['Date', 'Time', 'Water Body', 'State', 'Length (in)', 'Girth (in)', 'Est Weight (lb)', 'Lure Type', 'Lure Color', 'Lure Size (in)', 'Sky', 'Water Clarity', 'Water Temp (F)', 'Water Depth (ft)', 'Fish Depth (ft)', 'Weed Type', 'Bottom Type', 'Barometric Pressure (inHg)', 'Pressure Trend', 'Moon Phase', 'Released', 'Notes'];

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const line = cells => cells.map(csvEscape).join(',');

export function catchesToCsv({ events, trips, lakes, lures }) {
  const tripById = Object.fromEntries(trips.map(t => [t.id, t])), lakeById = Object.fromEntries(lakes.map(l => [l.id, l])), lureById = Object.fromEntries(lures.map(l => [l.id, l]));
  const rows = events.filter(e => e.kind === 'catch').sort((a, b) => new Date(a.at) - new Date(b.at)).map(e => {
    const trip = tripById[e.tripId] || {}, lake = lakeById[trip.lakeId] || {}, lure = lureById[e.lureId] || {}, s = e.snapshot || {};
    const d = new Date(e.at);
    return [localDayBounds(d, CHAIN.tz).ymd, fmtTime(d, CHAIN.tz), lake.name || '', (lake.states || []).join('/'), e.lengthIn, e.girthIn, e.estWeightLb, lure.family || e.lureId || '', e.color, lure.sizeIn, s.sky, s.clarity, s.waterTempF, e.depthUnderBoatFt, e.fishDepthFt, e.weedType, e.bottom, s.pressureInHg, s.pressureTrend, s.moonPhase, e.released === false ? 'no' : 'yes', e.notes];
  });
  return [line(LUNGE_LOG_COLUMNS), ...rows.map(line)].join('\n') + '\n';
}

export function eventsToCsv({ events, trips }) {
  const tripById = Object.fromEntries(trips.map(t => [t.id, t]));
  const flat = events.map(e => {
    const o = { lakeId: tripById[e.tripId]?.lakeId || '' };
    for (const [k, v] of Object.entries(e)) { if (k === 'snapshot') { for (const [sk, sv] of Object.entries(v || {})) o['snap_' + sk] = typeof sv === 'object' && sv ? JSON.stringify(sv) : sv; } else if (k === 'adjustment') { o.adj_what = v?.what; o.adj_why = v?.why; o.adj_outcome = v?.outcome; } else if (typeof v !== 'object' || v === null) o[k] = v; }
    return o;
  });
  const cols = [...new Set(flat.flatMap(Object.keys))].sort((a, b) => (a === 'at' ? -1 : b === 'at' ? 1 : a.localeCompare(b)));
  return [line(cols), ...flat.sort((a, b) => new Date(a.at) - new Date(b.at)).map(o => line(cols.map(c => o[c])))].join('\n') + '\n';
}

export async function toBackupJson(db) {
  return { kind: 'backup', version: 1, exportedAt: new Date().toISOString(), trips: await db.all('trips'), events: await db.all('events'), spots: await db.all('spots'), settings: await db.all('settings') };
}

export async function importJson(db, obj) {
  const r = { added: 0, updated: 0, skipped: 0 };
  if (obj?.kind === 'backup') {
    for (const store of ['trips', 'events', 'spots', 'settings']) for (const rec of obj[store] || []) {
      const cur = await db.get(store, rec.id);
      if (cur && cur.updatedAt && rec.updatedAt && cur.updatedAt > rec.updatedAt) { r.skipped++; continue; }
      await db.put(store, rec); cur ? r.updated++ : r.added++;
    }
    return r;
  }
  if (obj?.kind === 'spots-pack') {
    for (const s of obj.spots || []) {
      const cur = await db.get('spots', s.id);
      if (cur && (cur.addedBy !== 'seed' || cur.verified === true)) { r.skipped++; continue; }
      await db.put('spots', { ...s, addedBy: 'seed', verified: false }); cur ? r.updated++ : r.added++;
    }
    return r;
  }
  throw new Error('not a backup or spots pack');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/export.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add js/export.js test/export.test.js
git commit -m "feat: backup, Lunge Log CSV, events CSV, spots pack import"
```

### Task 11: App wiring, plan view, learn and lakes views

**Files:**
- Modify: `js/app.js` (replace the Task 1 stub)
- Create: `js/ui/plan.js`, `js/ui/learn.js`
- Test: manual in the in-app browser (DOM code); engine and astro are already unit tested

**Interfaces:**
- Consumes: everything from Tasks 2 to 10.
- Produces: `window.app = { db, content, index, forecast, navigate, refreshForecast(), getSpots(), settings: { get(key, def), set(key, val) } }`. Views are functions `(app, params) → HTMLElement`. Hash routes: `#plan`, `#trip`, `#trip/<tripId>`, `#learn`, `#learn/<lessonId>`, `#lakes`, `#lakes/<lakeId>`, `#settings`.

- [ ] **Step 1: Write app.js**

```js
import { h, clear } from './ui/dom.js';
import { createIndexedDBStore } from './store.js';
import { loadContent, indexContent, validateContent } from './content.js';
import { fetchForecast } from './weather.js';
import { CHAIN } from './astro.js';
import { planView } from './ui/plan.js';
import { learnView, lakesView } from './ui/learn.js';
import { tripView } from './ui/trip.js';
import { settingsView } from './ui/settings.js';

const app = { db: null, content: null, index: null, forecast: null, views: {} };

app.settings = {
  async get(key, def = null) { const r = await app.db.get('settings', key); return r ? r.value : def; },
  async set(key, value) { await app.db.put('settings', { id: key, value, updatedAt: new Date().toISOString() }); },
};
app.getSpots = () => app.db.all('spots');

app.refreshForecast = async () => {
  try {
    const f = await fetchForecast((u, o) => fetch(u, o), CHAIN);
    app.forecast = f;
    await app.db.put('forecasts', { id: 'latest', ...f });
    status(`forecast ${f.source} just now`);
  } catch (e) {
    const cached = await app.db.get('forecasts', 'latest');
    if (cached) { app.forecast = cached; status(`forecast ${Math.round((Date.now() - new Date(cached.fetchedAt)) / 60000)} min old`); }
    else status('no forecast; enter conditions');
  }
};

function status(msg) { const el = document.getElementById('status'); if (el) el.textContent = msg; }

export function navigate(hash) {
  const [name, param] = (hash || '#plan').replace('#', '').split('/');
  const view = document.getElementById('view');
  clear(view);
  const fn = app.views[name] || app.views.plan;
  Promise.resolve(fn(app, param)).then(el => { clear(view); view.appendChild(el); }).catch(err => { clear(view); view.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Something broke'), h('pre', {}, String(err?.stack || err)))); });
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + (name || 'plan')));
}
app.navigate = navigate;

async function boot() {
  app.views = { plan: planView, trip: tripView, learn: learnView, lakes: lakesView, settings: settingsView };
  app.db = await createIndexedDBStore();
  app.content = await loadContent(u => fetch(u));
  const errs = validateContent(app.content);
  if (errs.length) console.warn('content problems', errs);
  app.index = indexContent(app.content);
  if (navigator.storage?.persist) navigator.storage.persist().then(ok => app.settings.set('persisted', ok));
  window.addEventListener('hashchange', () => navigate(location.hash));
  navigate(location.hash);
  app.refreshForecast();
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) document.getElementById('banner').hidden = false; }); });
    document.getElementById('reload').onclick = () => location.reload();
  }
}
window.app = app;
boot();
```

- [ ] **Step 2: Write js/ui/plan.js**

```js
import { h } from './dom.js';
import { CHAIN, windows, sunTimes, moonPhase, fmtTime, localDayBounds } from '../astro.js';
import { conditionsAt } from '../weather.js';
import { plan as runPlan } from '../engine.js';
import { logStatsForPlanner } from '../log.js';

const SKIES = ['sun', 'partly', 'overcast'], CLARITY = ['clear', 'stained', 'dirty'], PRES = ['any', 'casting', 'trolling', 'suckers'];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export async function planView(app) {
  const lakes = app.content.lakes;
  const saved = (await app.settings.get('planInputs')) || {};
  const lakeId = saved.lakeId || 'thousand-island';
  const todayYmd = localDayBounds(new Date(), CHAIN.tz).ymd;
  const inputs = { dateYmd: saved.dateYmd && saved.dateYmd >= todayYmd ? saved.dateYmd : todayYmd, lakeId, waterTempF: (await app.settings.get('waterTemp:' + lakeId)) ?? '', sky: saved.sky || '', windMph: saved.windMph ?? '', windCompass: saved.windCompass || '', pressureTrend: saved.pressureTrend || '', clarity: saved.clarity || 'clear', presentation: saved.presentation || 'any', hoursSinceFront: '' };
  const fc = app.forecast ? conditionsAt(app.forecast, inputs.dateYmd + 'T12:00') : null;
  const results = h('div');
  const field = (label, el) => h('div', {}, h('label', {}, label), el);
  const sel = (name, opts, val, labels = {}) => h('select', { name, onchange: e => { inputs[name] = e.target.value; } }, opts.map(o => h('option', { value: o, selected: o === val ? true : null }, labels[o] || o || 'from forecast')));
  const num = (name, val, ph) => h('input', { name, type: 'number', inputmode: 'decimal', placeholder: ph, value: val, oninput: e => { inputs[name] = e.target.value === '' ? '' : Number(e.target.value); } });

  const form = h('div', { class: 'card' },
    h('h2', {}, 'Plan an outing'),
    field('Lake', h('select', { onchange: async e => { inputs.lakeId = e.target.value; inputs.waterTempF = (await app.settings.get('waterTemp:' + inputs.lakeId)) ?? ''; form.querySelector('[name=waterTempF]').value = inputs.waterTempF; } }, lakes.map(l => h('option', { value: l.id, selected: l.id === inputs.lakeId ? true : null }, l.name + (l.boundaryWater ? ' (boundary, 50")' : ''))))),
    field('Date', h('input', { type: 'date', value: inputs.dateYmd, onchange: e => { inputs.dateYmd = e.target.value; } })),
    field('Water temperature °F, from the fish finder', num('waterTempF', inputs.waterTempF, 'e.g. 62')),
    h('div', { class: 'grid2' },
      field('Sky', sel('sky', ['', ...SKIES], inputs.sky, { sun: 'sun', partly: 'partly cloudy', overcast: 'overcast' })),
      field('Wind mph', num('windMph', inputs.windMph, fc?.windMph ?? 'forecast')),
      field('Wind from', sel('windCompass', ['', ...COMPASS], inputs.windCompass)),
      field('Pressure', sel('pressureTrend', ['', 'falling', 'steady', 'rising'], inputs.pressureTrend)),
      field('Clarity', sel('clarity', CLARITY, inputs.clarity)),
      field('Presentation', sel('presentation', PRES, inputs.presentation)),
    ),
    h('p', { class: 'reason' }, fc ? `Forecast ${app.forecast.source}, ${fc.forecastAgeMin} min old: ${fc.tempF ?? '?'}°F air, wind ${fc.windMph ?? '?'} mph from ${fc.windCompass || '?'}, pressure ${fc.pressureInHg ?? '?'} inHg ${fc.trend}. Blank fields use it.` : 'No forecast. Fill the fields from what you see.'),
    h('button', { onclick: () => build() }, 'Build the plan'),
  );

  async function build() {
    const date = new Date(inputs.dateYmd + 'T12:00:00');
    const lake = app.index.lakeById[inputs.lakeId];
    const cond = {
      lakeId: inputs.lakeId, lakeCharacter: lake.character, dateIso: inputs.dateYmd, month: +inputs.dateYmd.slice(5, 7),
      waterTempF: inputs.waterTempF === '' ? null : inputs.waterTempF,
      sky: inputs.sky || fc?.sky || null, windMph: inputs.windMph === '' ? fc?.windMph ?? null : inputs.windMph,
      windCompass: inputs.windCompass || fc?.windCompass || null,
      pressureTrend: inputs.pressureTrend || (fc?.trend && fc.trend !== 'unknown' ? fc.trend : null), hoursSinceFront: fc?.hoursSinceFront ?? null,
      clarity: inputs.clarity, presentation: inputs.presentation, moonPhaseName: moonPhase(date).name,
      pressureInHg: fc?.pressureInHg ?? null, forecastAgeMin: fc?.forecastAgeMin ?? null,
    };
    await app.settings.set('planInputs', { ...inputs });
    if (cond.waterTempF != null) await app.settings.set('waterTemp:' + inputs.lakeId, cond.waterTempF);
    const spots = await app.getSpots();
    const stats = logStatsForPlanner(await app.db.all('events'), await app.db.all('trips'));
    const aw = windows(date, CHAIN.lat, CHAIN.lon, CHAIN.tz), sun = sunTimes(date, CHAIN.lat, CHAIN.lon, CHAIN.tz);
    const p = runPlan({ content: app.content, spots, cond, astroWindows: aw, sun, logStats: stats });
    await app.settings.set('lastPlan', { cond, plan: { windows: p.windows.map(w => ({ kind: w.window.kind, label: w.window.label, start: w.window.start, end: w.window.end, score: w.score })), spots: p.spots.map(s => ({ id: s.spot.id, name: s.spot.name, score: s.score })), lures: p.lures.map(l => ({ id: l.lure.id, score: l.score })), watchFor: p.watchFor } });
    render(p, cond, lake, spots.filter(s => s.lakeId === cond.lakeId).length);
  }

  function reasons(list) { return list.slice(0, 3).flatMap(r => [h('p', { class: 'reason' }, r.pro), h('p', { class: 'job' }, 'Your job: ' + r.yourJob)]); }

  function render(p, cond, lake, spotCount) {
    results.replaceChildren(
      p.errors.length ? h('div', { class: 'card unverified' }, h('h3', {}, 'Fix the inputs'), p.errors.map(e => h('p', {}, e))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, lake.name), h('p', { class: 'reason' }, `Rule here: ${app.index.rulesForLake(lake.id).minSizeIn}" minimum. ${app.index.rulesForLake(lake.id).season}`), h('p', { class: 'big' }, 'Watch for'), h('p', {}, p.watchFor), h('a', { href: '#lakes/' + lake.id }, 'Lake notes')) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Windows'), p.windows.filter(w => w.score > 0).slice(0, 5).map(w => h('div', {}, h('p', { class: 'big' }, `${fmtTime(w.window.start)} to ${fmtTime(w.window.end)}  ${w.window.label}`), w.stacks.length ? h('p', { class: 'reason' }, 'Stacks with ' + w.stacks.join(', ')) : null, reasons(w.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Spots'), spotCount === 0 ? h('p', {}, 'No spots on this lake yet. Import the spots pack in Settings or add spots from a trip.') : p.spots.map(s => h('div', { class: s.spot.verified ? 'verified' : 'unverified' }, h('p', { class: 'big' }, s.spot.name, h('span', { class: 'badge' }, app.index.spotTypeById[s.spot.type]?.name || s.spot.type), s.spot.verified ? null : h('span', { class: 'badge warn' }, 'unverified')), reasons(s.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Lures'), p.lures.map(l => h('div', {}, h('p', { class: 'big' }, l.lure.example), h('p', {}, l.lure.retrieve), reasons(l.reasons)))) : null,
      !p.errors.length ? h('button', { onclick: () => { location.hash = '#trip/new'; } }, 'Start trip with this plan') : null,
    );
  }
  return h('div', {}, form, results);
}
```

- [ ] **Step 3: Write js/ui/learn.js**

```js
import { h } from './dom.js';

export function learnView(app, lessonId) {
  const { lessons } = app.content;
  if (!lessonId) return h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'Lessons'), h('p', { class: 'reason' }, 'Pro text is for Dad. "Your job" lines are for you.')), lessons.sort((a, b) => a.order - b.order).map(l => h('a', { href: '#learn/' + l.id, class: 'card', style: 'display:block' }, h('h3', {}, `${l.order}. ${l.title}`), h('span', { class: 'badge' }, l.track))));
  const l = app.index.lessonById[lessonId];
  if (!l) return h('div', { class: 'card' }, 'No such lesson.');
  return h('div', {}, h('a', { href: '#learn' }, '← Lessons'), h('h2', {}, l.title), l.sections.map(s => h('div', { class: 'card' }, h('h3', {}, s.heading), s.pro.split('\n\n').map(p => h('p', {}, p)), h('p', { class: 'job' }, 'Your job: ' + s.yourJob), s.sources?.length ? h('p', { class: 'reason' }, 'Sources: ', s.sources.map(id => h('a', { href: app.index.sourceById[id]?.url, target: '_blank', style: 'margin-right:8px' }, app.index.sourceById[id]?.publisher || id))) : h('p', { class: 'reason' }, 'Reasoning, not sourced.'), (s.links || []).map(id => h('a', { href: '#learn/' + id, style: 'margin-right:12px' }, 'See: ' + (app.index.lessonById[id]?.title || id))))));
}

export function lakesView(app, lakeId) {
  const lakes = app.content.lakes;
  if (!lakeId) return h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'The Cisco Chain'), h('p', { class: 'reason' }, '15 lakes, about 4,000 acres. Three cross into Wisconsin and carry the 50-inch rule.')), lakes.map(l => h('a', { href: '#lakes/' + l.id, class: 'card', style: 'display:block' }, h('h3', {}, l.name, l.boundaryWater ? h('span', { class: 'badge warn' }, 'boundary 50"') : null), h('p', { class: 'reason' }, [l.acres ? l.acres + ' ac' : null, l.maxDepthFt ? l.maxDepthFt + ' ft max' : null, l.character.replace(/_/g, ' ')].filter(Boolean).join(' · ')))));
  const l = app.index.lakeById[lakeId];
  if (!l) return h('div', { class: 'card' }, 'No such lake.');
  const r = app.index.rulesForLake(l.id);
  const row = (k, v) => v == null || v === '' ? null : h('p', {}, h('b', {}, k + ': '), String(v));
  return h('div', {}, h('a', { href: '#lakes' }, '← Lakes'), h('h2', {}, l.name),
    h('div', { class: 'card' }, row('States', l.states.join(', ')), row('Acres', l.acres + (l.acresNote ? ` (${l.acresNote})` : '')), row('Max depth', l.maxDepthFt ? l.maxDepthFt + ' ft' + (l.maxDepthNote ? ` (${l.maxDepthNote})` : '') : null), row('Clarity', l.secchiFt ? l.secchiFt + ' ft Secchi' : null), row('Thermocline', l.thermoclineFt ? l.thermoclineFt.join(' to ') + ' ft in summer' : null), row('Character', l.character.replace(/_/g, ' ')), row('Structure', l.structureSummary), row('Forage', l.forage.join(', ')), row('Connections', l.connections.map(c => `${c.kind} ${app.index.lakeById[c.to]?.name}`).join('; '))),
    h('div', { class: 'card' }, h('h3', {}, 'Musky status'), row('Wisconsin class', l.muskyStatus.wiClass ? `${l.muskyStatus.wiClass}, category ${l.muskyStatus.wiCategory}` : null), row('Michigan stocking', l.muskyStatus.miStocking), row('Notes', l.muskyStatus.notes)),
    h('div', { class: 'card' }, h('h3', {}, 'Rules: ' + r.name), row('Minimum size', r.minSizeIn + ' inches'), row('Season', r.season), row('Limit', r.limit), row('Registration', r.registration), row('License', r.license), row('Pike', r.pike), h('p', { class: 'reason' }, 'Verified ' + r.verified)),
    l.launches.length ? h('div', { class: 'card' }, h('h3', {}, 'Launches'), l.launches.map(x => h('p', {}, h('b', {}, x.name), x.surface ? ` (${x.surface})` : '', x.notes ? '. ' + x.notes : ''))) : null,
    l.mapImage ? h('div', { class: 'card' }, h('h3', {}, 'Depth map'), h('img', { src: l.mapImage, style: 'width:100%;border-radius:10px', alt: l.name + ' depth map' })) : h('p', { class: 'reason' }, 'No depth map on file yet.'),
    h('p', { class: 'reason' }, 'Sources: ' + l.sources.map(id => app.index.sourceById[id]?.publisher || id).join('; ')));
}
```

- [ ] **Step 4: Create temporary stubs so the app boots before Task 12**

`js/ui/trip.js`: `import { h } from './dom.js'; export function tripView(app, p) { return h('div', { class: 'card' }, 'Trip view arrives in Task 12.'); }`
`js/ui/settings.js`: `import { h } from './dom.js'; export function settingsView(app) { return h('div', { class: 'card' }, 'Settings arrive in Task 12.'); }`
`sw.js`: `self.addEventListener('install', () => self.skipWaiting());` (Task 13 replaces it).

- [ ] **Step 5: Check it in the browser**

Run: `python3 -m http.server 8140 --directory . >/dev/null 2>&1 &` and open `http://localhost:8140/#plan` in the in-app browser. Expected: the status line shows a forecast age, Thousand Island is selected, typing 62 and tapping Build the plan shows Windows with dusk first on today's date, Spots says no spots yet, Lures lists three. Open `#learn`, open lesson 2, confirm paragraphs, "Your job" callouts, and source links. Open `#lakes/big` and confirm the 50-inch rule card. Check the console for errors. Then `kill %1`.

- [ ] **Step 6: Run all tests and commit**

Run: `npm test`
Expected: PASS, every test file

```bash
git add js/app.js js/ui/plan.js js/ui/learn.js js/ui/trip.js js/ui/settings.js sw.js
git commit -m "feat: app wiring, plan view with reasons, lessons and lakes views"
```

### Task 12: Trip view, photos, settings view

**Files:**
- Create: `js/photos.js`
- Modify: `js/ui/trip.js`, `js/ui/settings.js` (replace the Task 11 stubs)
- Test: manual in the browser; `test/photos.test.js` for the pure helper

**Interfaces:**
- Consumes: Tasks 2, 9, 10.
- Produces: `fitWithin(w, h, maxEdge) → { w, h }` (pure, tested); `downscaleImage(file, maxEdge = 1600, quality = 0.7) → Promise<Blob>` (browser); `savePhoto(db, eventId, blob, role = 'catch') → photo record { id, eventId, role, blob, createdAt }`.

- [ ] **Step 1: Write the failing test and photos.js**

`test/photos.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin } from '../js/photos.js';
test('fitWithin scales the long edge to maxEdge and keeps small images', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1600), { w: 800, h: 600 });
});
```
Run `node --test test/photos.test.js`, expect FAIL. Then `js/photos.js`:
```js
import { newId } from './store.js';

export function fitWithin(w, h, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

export async function downscaleImage(file, maxEdge = 1600, quality = 0.7) {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height, maxEdge);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}

export async function savePhoto(db, eventId, blob, role = 'catch') {
  const rec = { id: newId('photo'), eventId, role, blob, createdAt: new Date().toISOString() };
  await db.put('photos', rec);
  return rec;
}
```
Run `node --test test/photos.test.js`, expect PASS.

- [ ] **Step 2: Write js/ui/trip.js**

```js
import { h } from './dom.js';
import { CHAIN, nearestMoonEvent, moonPhase, fmtTime } from '../astro.js';
import { conditionsAt } from '../weather.js';
import { snapshot, startTrip, addEvent, endTrip, setOutcome, rates, verifySpots, tripTimeline } from '../log.js';
import { downscaleImage, savePhoto } from '../photos.js';

const astro = { nearest: d => nearestMoonEvent(d, CHAIN.lat, CHAIN.lon, CHAIN.tz), phase: d => moonPhase(d) };
const opt = (vals, cur) => vals.map(v => h('option', { value: v, selected: v === cur ? true : null }, v));
const field = (label, el) => h('div', {}, h('label', {}, label), el);

async function geo() { return new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000 }); }); }

async function currentCond(app, trip) {
  const base = trip.cond || {};
  const fc = app.forecast ? conditionsAt(app.forecast, new Date().toISOString().slice(0, 16)) : null;
  return { ...base, pressureInHg: fc?.pressureInHg ?? base.pressureInHg ?? null, pressureTrend: fc?.trend ?? base.pressureTrend ?? null, windMph: fc?.windMph ?? base.windMph ?? null, windCompass: fc?.windCompass ?? base.windCompass ?? null, sky: base.sky || fc?.sky || null, forecastAgeMin: fc?.forecastAgeMin ?? null };
}

export async function tripView(app, param) {
  const trips = (await app.db.all('trips')).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const open = trips.find(t => !t.endedAt);
  if (param === 'new') {
    if (open) { location.hash = '#trip/' + open.id; return h('div'); }
    const last = await app.settings.get('lastPlan');
    if (!last) { location.hash = '#plan'; return h('div'); }
    const t = await startTrip(app.db, { lakeId: last.cond.lakeId, plan: last.plan, cond: last.cond, presentation: last.cond.presentation });
    location.hash = '#trip/' + t.id; return h('div');
  }
  if (!param) return h('div', {}, open ? h('a', { class: 'btn', href: '#trip/' + open.id, style: 'display:block;text-align:center' }, 'Continue trip') : h('a', { class: 'btn', href: '#plan', style: 'display:block;text-align:center' }, 'Plan first, then start a trip'), h('div', { class: 'card' }, h('h2', {}, 'Past trips'), trips.filter(t => t.endedAt).map(t => h('a', { href: '#trip/' + t.id, style: 'display:block;padding:8px 0' }, `${t.startedAt.slice(0, 10)} ${app.index.lakeById[t.lakeId]?.name || t.lakeId}`, t.rating ? h('span', { class: 'badge' }, '★ ' + t.rating) : null))));
  const trip = await app.db.get('trips', param);
  if (!trip) return h('div', { class: 'card' }, 'No such trip.');
  const spots = (await app.getSpots()).filter(s => s.lakeId === trip.lakeId);
  const lures = app.content.lures;
  const events = tripTimeline((await app.db.all('events')).filter(e => e.tripId === trip.id));
  const lastWith = k => [...events].reverse().find(e => e[k])?.[k] || '';
  const live = !trip.endedAt;
  const root = h('div');
  const rerender = () => { location.hash = '#trip/' + trip.id; app.navigate(location.hash); };

  async function log(kind, fields) {
    const pos = await geo();
    const snap = snapshot({ at: new Date().toISOString(), lat: pos?.lat ?? null, lon: pos?.lon ?? null, cond: await currentCond(app, trip), astro });
    const spotId = fields.spotId || (pos && spots.length ? nearest(spots, pos).id : null) || lastWith('spotId') || null;
    const ev = await addEvent(app.db, trip.id, { kind, spotId, ...fields }, snap);
    if (fields.photoFile) await savePhoto(app.db, ev.id, await downscaleImage(fields.photoFile), 'catch');
    if (fields.marksFile) await savePhoto(app.db, ev.id, await downscaleImage(fields.marksFile), 'marks');
    rerender();
  }
  const nearest = (list, p) => list.reduce((b, s) => { const d = (s.lat - p.lat) ** 2 + (s.lon - p.lon) ** 2; return !b || d < b.d ? { ...s, d } : b; }, null);

  const spotSel = cur => h('select', { name: 'spotId' }, h('option', { value: '' }, 'nearest / unknown'), spots.map(s => h('option', { value: s.id, selected: s.id === cur ? true : null }, s.name)));
  const lureSel = cur => h('select', { name: 'lureId' }, lures.map(l => h('option', { value: l.id, selected: l.id === cur ? true : null }, l.example)));
  const read = form => Object.fromEntries([...form.querySelectorAll('[name]')].map(el => [el.name, el.type === 'file' ? el.files[0] || null : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value || null]));
  const sheet = (title, kind, fields) => { const f = h('div', { class: 'card' }, h('h3', {}, title), fields, h('button', { onclick: () => log(kind, read(f)).catch(e => alert(e.message)) }, 'Save'), h('button', { class: 'secondary', onclick: () => f.remove() }, 'Cancel')); root.prepend(f); f.scrollIntoView(); };

  const buttons = live ? h('div', { class: 'grid2' },
    h('button', { onclick: () => sheet('I am here', 'here', [field('Spot', spotSel(lastWith('spotId')))]) }, 'Here'),
    h('button', { onclick: () => sheet('Follow', 'follow', [field('Size estimate in', h('input', { name: 'sizeEstimateIn', type: 'number', inputmode: 'numeric', value: 40 })), field('Heat', h('select', { name: 'heat' }, opt(['lazy', 'hot', 'hit the 8'], 'lazy'))), field('Seen', h('select', { name: 'seen' }, opt(['boat side', 'mid-retrieve'], 'boat side'))), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Speed', h('select', { name: 'speed' }, opt(['slow', 'medium', 'fast', 'burn'], lastWith('speed') || 'medium'))), field('Position', h('select', { name: 'position' }, opt(['on top', 'edge', 'off the break', 'inside turn'], lastWith('position') || 'edge'))), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal', value: lastWith('depthUnderBoatFt') })), field('Spot', spotSel(lastWith('spotId')))]) }, 'Follow'),
    h('button', { onclick: () => sheet('Strike', 'strike', [field('Result', h('select', { name: 'result' }, opt(['missed', 'hooked and lost'], 'missed'))), field('On the 8?', h('select', { name: 'hitWhere' }, opt(['on the retrieve', 'on the 8'], 'on the retrieve'))), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Speed', h('select', { name: 'speed' }, opt(['slow', 'medium', 'fast', 'burn'], lastWith('speed') || 'medium'))), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal' })), field('Spot', spotSel(lastWith('spotId')))]) }, 'Strike'),
    h('button', { onclick: () => sheet('Catch', 'catch', [h('p', { class: 'reason' }, 'Measure in the boat on a board, lower jaw tip to tail tip. Fish stays in the net in the water until the tools are in hand.'), field('Length in', h('input', { name: 'lengthIn', type: 'number', inputmode: 'decimal' })), field('Girth in', h('input', { name: 'girthIn', type: 'number', inputmode: 'decimal' })), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Retrieve', h('input', { name: 'retrieve', value: lastWith('speed') })), field('Hit where', h('select', { name: 'hitWhere' }, opt(['on the retrieve', 'on the 8'], 'on the retrieve'))), field('Depth fish hit at ft', h('input', { name: 'fishDepthFt', type: 'number', inputmode: 'decimal' })), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal' })), field('Weed type', h('select', { name: 'weedType' }, opt(['cabbage', 'coontail', 'milfoil', 'mixed', 'none'], 'cabbage'))), field('Bottom', h('select', { name: 'bottom' }, opt(['sand', 'gravel', 'rock', 'muck', 'peat', 'unknown'], 'unknown'))), field('Hook location', h('input', { name: 'hookLocation' })), field('Seconds to release', h('input', { name: 'releaseSeconds', type: 'number', inputmode: 'numeric' })), field('Marks for recapture', h('input', { name: 'marks' })), field('Photo', h('input', { name: 'photoFile', type: 'file', accept: 'image/*', capture: 'environment' })), field('Marks photo', h('input', { name: 'marksFile', type: 'file', accept: 'image/*', capture: 'environment' })), field('Spot', spotSel(lastWith('spotId'))), field('Notes', h('textarea', { name: 'notes' }))]) }, 'Catch'),
    h('button', { class: 'secondary', onclick: () => { const adj = h('div', { hidden: true }, field('What changed', h('select', { name: 'what' }, opt(['depth', 'retrieve', 'lure', 'boat_position', 'location'], 'lure'))), field('Why (Dad\'s words)', h('textarea', { name: 'why' }))); const f = h('div', { class: 'card' }, h('h3', {}, 'Note'), field('Text', h('textarea', { name: 'text' })), h('label', {}, h('input', { type: 'checkbox', style: 'width:auto;min-height:0', onchange: e => { adj.hidden = !e.target.checked; } }), ' This is an adjustment'), adj, h('button', { onclick: () => { const v = read(f); const a = adj.hidden ? null : { what: v.what, why: v.why, outcome: null }; log('note', { text: v.text, adjustment: a }).catch(e => alert(e.message)); } }, 'Save'), h('button', { class: 'secondary', onclick: () => f.remove() }, 'Cancel')); root.prepend(f); } }, 'Note'),
    h('button', { class: 'secondary', onclick: () => sheet('Bait seen', 'bait', [field('What', h('select', { name: 'bait' }, opt(['cisco', 'perch', 'sucker', 'bait ball on sonar', 'other'], 'perch'))), field('Depth ft', h('input', { name: 'depthFt', type: 'number', inputmode: 'decimal' }))]) }, 'Bait'),
  ) : null;

  const r = rates(events, trip);
  const summary = h('div', { class: 'card' }, h('h3', {}, `${app.index.lakeById[trip.lakeId]?.name} · ${trip.startedAt.slice(0, 10)}`), h('p', {}, `${r.total.hours.toFixed(1)} h · ${r.total.follows} follows · ${r.total.catches} catches · ${r.total.followsPerHour.toFixed(2)} follows/h`), Object.entries(r.bySpot).map(([id, v]) => h('p', { class: 'reason' }, `${spots.find(s => s.id === id)?.name || 'no spot'}: ${v.hours.toFixed(1)} h, ${v.follows} follows, ${v.catches} catches, ${v.followsPerHour.toFixed(2)}/h`)), Object.entries(r.byLure).map(([id, v]) => h('p', { class: 'reason' }, `${lures.find(l => l.id === id)?.example || id}: ${v.follows} follows, ${v.strikes} strikes, ${v.catches} catches`)));

  const planCard = trip.plan ? h('div', { class: 'card' }, h('h3', {}, 'The plan said'), h('p', {}, trip.plan.watchFor), (trip.plan.windows || []).filter(w => w.score > 0).slice(0, 3).map(w => h('p', { class: 'reason' }, `${fmtTime(new Date(w.start))} to ${fmtTime(new Date(w.end))} ${w.label}`)), (trip.plan.spots || []).slice(0, 3).map(s => h('p', { class: 'reason' }, 'Spot: ' + s.name)), (trip.plan.lures || []).map(l => h('p', { class: 'reason' }, 'Lure: ' + (lures.find(x => x.id === l.id)?.example || l.id)))) : null;

  const timeline = h('div', { class: 'card' }, h('h3', {}, 'Timeline'), events.length ? events.map(e => h('div', { style: 'padding:6px 0;border-top:1px solid rgba(255,255,255,.08)' }, h('b', {}, fmtTime(new Date(e.at)) + ' ' + e.kind), e.kind === 'catch' ? ` ${e.lengthIn}" ${e.estWeightLb ? '~' + e.estWeightLb + ' lb' : ''} on ${lures.find(l => l.id === e.lureId)?.example || ''} ${e.hitWhere || ''}` : e.kind === 'follow' ? ` ~${e.sizeEstimateIn}" ${e.heat} ${e.seen} on ${lures.find(l => l.id === e.lureId)?.example || ''} at ${e.speed}` : e.kind === 'note' ? ' ' + (e.text || '') : e.kind === 'bait' ? ` ${e.bait} ${e.depthFt ? e.depthFt + ' ft' : ''}` : e.kind === 'here' ? ' ' + (spots.find(s => s.id === e.spotId)?.name || '') : '', e.adjustment ? h('div', { class: 'job' }, `Adjusted ${e.adjustment.what.replace('_', ' ')}: ${e.adjustment.why || ''}`, h('div', {}, 'Outcome: ', e.adjustment.outcome || h('button', { class: 'secondary', style: 'width:auto;min-height:36px;padding:4px 10px', onclick: () => { const o = prompt('What happened after the change?'); if (o) setOutcome(app.db, e.id, o).then(rerender); } }, 'add'))) : null, e.snapshot ? h('div', { class: 'reason' }, [e.snapshot.waterTempF != null ? e.snapshot.waterTempF + '°F' : null, e.snapshot.moonEvent ? `${e.snapshot.moonEvent.kind} ${e.snapshot.moonEvent.minutes >= 0 ? '+' : ''}${e.snapshot.moonEvent.minutes} min` : null, e.snapshot.pressureInHg ? `${e.snapshot.pressureInHg} inHg ${e.snapshot.pressureTrend}` : null, e.snapshot.windMph != null ? `wind ${e.snapshot.windMph} ${e.snapshot.windCompass || ''}` : null, e.snapshot.sky].filter(Boolean).join(' · ')) : null)) : h('p', { class: 'reason' }, 'No events yet. Tap Here when you reach the first spot.'));

  const endCard = live ? h('div', { class: 'card' }, h('h3', {}, 'End trip'), field('Rating 1 to 5', h('input', { name: 'rating', type: 'number', inputmode: 'numeric', min: 1, max: 5 })), field('What worked', h('textarea', { name: 'worked' })), field('Notes', h('textarea', { name: 'notes' })), h('button', { class: 'danger', onclick: async e => { const v = read(e.target.parentElement); await endTrip(app.db, trip.id, { rating: v.rating, worked: v.worked || '', notes: v.notes || '' }); await verifySpots(app.db, events); rerender(); } }, 'End trip')) : h('div', { class: 'card' }, h('h3', {}, 'Rated ' + (trip.rating ?? '–')), h('p', {}, trip.worked), h('p', { class: 'reason' }, trip.notes));

  root.append(buttons, summary, planCard, timeline, endCard);
  return root;
}
```

- [ ] **Step 3: Write js/ui/settings.js**

```js
import { h } from './dom.js';
import { toBackupJson, importJson, catchesToCsv, eventsToCsv } from '../export.js';

async function share(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.appendChild(a); a.click(); a.remove();
}

export async function settingsView(app) {
  const events = await app.db.all('events'), trips = await app.db.all('trips'), spots = await app.getSpots(), photos = await app.db.all('photos');
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const lastExport = await app.settings.get('lastExport');
  const stale = !lastExport || Date.now() - new Date(lastExport) > 30 * 86400000;
  const msg = h('p', { class: 'reason' });
  const importInput = h('input', { type: 'file', accept: 'application/json,.json', onchange: async e => { try { const obj = JSON.parse(await e.target.files[0].text()); const r = await importJson(app.db, obj); msg.textContent = `Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} kept as yours.`; } catch (err) { msg.textContent = 'Import failed: ' + err.message; } } });
  const stamp = () => app.settings.set('lastExport', new Date().toISOString());
  return h('div', {},
    stale ? h('div', { class: 'card unverified' }, h('h3', {}, 'Export reminder'), h('p', {}, 'No export in the last 30 days. The log lives only on this phone.')) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Your data'), h('p', {}, `${trips.length} trips · ${events.length} events · ${spots.length} spots (${spots.filter(s => s.verified).length} verified) · ${photos.length} photos`), est ? h('p', { class: 'reason' }, `Storage ${(est.usage / 1048576).toFixed(1)} MB of ${(est.quota / 1048576).toFixed(0)} MB. Persistent: ${await app.settings.get('persisted')}`) : null),
    h('div', { class: 'card' }, h('h3', {}, 'Export'), h('button', { onclick: async () => { await share('fieldbook-backup.json', JSON.stringify(await toBackupJson(app.db), null, 1), 'application/json'); stamp(); } }, 'Backup JSON'), h('button', { class: 'secondary', onclick: async () => { await share('lunge-log.csv', catchesToCsv({ events, trips, lakes: app.content.lakes, lures: app.content.lures }), 'text/csv'); stamp(); } }, 'Catches CSV (Lunge Log order)'), h('button', { class: 'secondary', onclick: async () => { await share('events.csv', eventsToCsv({ events, trips }), 'text/csv'); stamp(); } }, 'All events CSV'), h('button', { class: 'secondary', onclick: async () => { for (const p of photos) { const n = `${p.eventId}-${p.role}.jpg`; const f = new File([p.blob], n, { type: 'image/jpeg' }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] }); } } }, `Share photos (${photos.length})`)),
    h('div', { class: 'card' }, h('h3', {}, 'Import'), h('p', { class: 'reason' }, 'A backup JSON, or the spots pack file. Your edited and verified spots are never overwritten.'), importInput, msg),
    h('div', { class: 'card' }, h('h3', {}, 'Add a spot by hand'), h('p', { class: 'reason' }, 'Dad\'s spots go here with his name on them.'), (() => { const f = h('div', {}, h('label', {}, 'Name'), h('input', { name: 'name' }), h('label', {}, 'Lake'), h('select', { name: 'lakeId' }, app.content.lakes.map(l => h('option', { value: l.id }, l.name))), h('label', {}, 'Type'), h('select', { name: 'type' }, app.content.spotTypes.map(t => h('option', { value: t.id }, t.name))), h('label', {}, 'Added by'), h('select', { name: 'addedBy' }, ['dad', 'truman'].map(v => h('option', { value: v }, v))), h('label', {}, 'Notes'), h('textarea', { name: 'notes' }), h('button', { onclick: async () => { const v = Object.fromEntries([...f.querySelectorAll('[name]')].map(el => [el.name, el.value])); const pos = await new Promise(res => navigator.geolocation?.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null)) || res(null)); const lake = app.index.lakeById[v.lakeId]; await app.db.put('spots', { id: 'spot_' + Date.now(), lakeId: v.lakeId, name: v.name, lat: pos?.lat ?? lake.lat, lon: pos?.lon ?? lake.lon, type: v.type, notes: v.notes, addedBy: v.addedBy, verified: true, bestWind: [], tempBandsF: [], months: [], updatedAt: new Date().toISOString() }); msg.textContent = 'Spot saved' + (pos ? ' at your position.' : ' at the lake center (no GPS).'); } }, 'Save spot')); return f; })()),
    h('div', { class: 'card' }, h('h3', {}, 'About'), h('p', { class: 'reason' }, 'Cisco Musky. Content sources are listed on each lesson and lake. Rules verified 2026-10-01. The 46-inch figure some sites show is a Master Angler award size, not a rule.')),
  );
}
```

- [ ] **Step 4: Check it in the browser**

Serve as in Task 11. Build a plan, tap Start trip, tap Here, Follow, Note with the adjustment box, Catch with a photo from a file. Expected: each sheet saves, the timeline shows the snapshot line with moon event minutes and pressure, the adjustment shows an "add" outcome button, the summary shows follows per hour. End the trip; expected: the seeded spot used turns verified in Settings counts. In Settings tap Backup JSON; expected: a download or share sheet. Import the same file; expected: updated counts. Check the console for errors.

- [ ] **Step 5: Run all tests and commit**

```bash
npm test
git add js/photos.js js/ui/trip.js js/ui/settings.js test/photos.test.js
git commit -m "feat: trip view with one-tap events and photos, settings with export and import"
```

### Task 13: Service worker and precache manifest

**Files:**
- Create: `scripts/precache.js`, `js/precache-manifest.js`
- Modify: `sw.js` (replace the stub)
- Test: `test/precache.test.js`

**Interfaces:**
- Produces: `js/precache-manifest.js` exporting `PRECACHE` (array of relative paths) and `VERSION` (short git sha or timestamp). `scripts/precache.js` has a pure export `listPublished(allPaths) → string[]` used by the test, and when run as a script writes the manifest.

- [ ] **Step 1: Write the failing test**

`test/precache.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { listPublished } from '../scripts/precache.js';

async function walk(dir, base = '') {
  const out = [];
  for (const d of await readdir(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
    const rel = base + d.name;
    if (d.isDirectory()) out.push(...await walk(dir + d.name + '/', rel + '/')); else out.push(rel);
  }
  return out;
}

test('listPublished keeps app files and drops test, scripts, docs, private, git', () => {
  const r = listPublished(['index.html', 'js/app.js', 'content/lakes.json', 'maps/cisco.jpg', 'test/x.test.js', 'scripts/precache.js', 'docs/a.md', 'private/spots-seed.json', '.git/HEAD', '.gitignore', 'package.json', 'README.md', 'sw.js', 'js/precache-manifest.js', '.DS_Store', 'icons/icon.svg']);
  assert.deepEqual(r.sort(), ['content/lakes.json', 'icons/icon.svg', 'index.html', 'js/app.js', 'js/precache-manifest.js', 'maps/cisco.jpg'].sort());
});

test('the committed manifest matches the tree', async () => {
  const files = await walk('');
  const expected = listPublished(files).sort();
  const src = await readFile(new URL('../js/precache-manifest.js', import.meta.url), 'utf8');
  const got = JSON.parse(src.match(/PRECACHE = (\[[\s\S]*?\]);/)[1]).sort();
  assert.deepEqual(got, expected, 'run: npm run precache');
  assert.ok(/VERSION = '[^']+'/.test(src));
});
```

- [ ] **Step 2: Write scripts/precache.js**

```js
import { readdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const DROP = [/^test\//, /^scripts\//, /^docs\//, /^private\//, /^\.git\//, /^\.gitignore$/, /^package(-lock)?\.json$/, /^README\.md$/, /^sw\.js$/, /^\.DS_Store$/, /\/\.DS_Store$/, /^maps\/README\.md$/];
export function listPublished(paths) { return paths.filter(p => !DROP.some(r => r.test(p))); }

async function walk(dir = '.', base = '') {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) { const rel = base + d.name; if (d.isDirectory()) out.push(...await walk(dir + '/' + d.name, rel + '/')); else out.push(rel); }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('precache.js')) {
  const files = listPublished(await walk()).filter(f => f !== 'js/precache-manifest.js').sort();
  files.push('js/precache-manifest.js');
  let version; try { version = execSync('git rev-parse --short HEAD').toString().trim() + '-' + Date.now().toString(36); } catch { version = String(Date.now()); }
  await writeFile('js/precache-manifest.js', `export const VERSION = '${version}';\nexport const PRECACHE = ${JSON.stringify(files.sort(), null, 0)};\n`);
  console.log(`precache: ${files.length} files, version ${version}`);
}
```

- [ ] **Step 3: Write sw.js**

```js
import { PRECACHE, VERSION } from './js/precache-manifest.js';
const CACHE = 'fieldbook-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', ...PRECACHE.map(p => './' + p)])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('open-meteo') || url.hostname.includes('weather.gov')) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE + '-weather').then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
```
Register the worker with `{ type: 'module' }` in `app.js`: change `navigator.serviceWorker.register('sw.js')` to `navigator.serviceWorker.register('sw.js', { type: 'module' })`. iOS Safari 16.4 and later support module workers.

- [ ] **Step 4: Generate the manifest and run the tests**

Run: `npm run precache && node --test test/precache.test.js`
Expected: `precache: N files` then PASS, 2 tests.

- [ ] **Step 5: Check offline in the browser**

Serve with `python3 -m http.server 8140 --directory .`, load the app, wait for the console to show the worker installed, then stop the server and reload. Expected: the app loads from cache and the status line says the forecast age. Restart the server, change `VERSION` by running `npm run precache` again, reload twice; expected: the yellow banner appears.

- [ ] **Step 6: Commit**

```bash
git add scripts/precache.js js/precache-manifest.js sw.js js/app.js test/precache.test.js
git commit -m "feat: service worker precaches the app; manifest generator and test"
```

### Task 14: Depth maps and the private spots seed

**Files:**
- Create: `maps/<lake-id>.jpg` for every lake with an obtainable DNR map; `private/spots-seed.json` (gitignored, never committed)
- Modify: `content/lakes.json` (`mapImage` paths)
- Test: `test/content.test.js` already validates the seed when present

**Interfaces:**
- Produces: a spots pack `{ "kind": "spots-pack", "generated": ISO, "spots": Spot[] }` with `Spot = { id, lakeId, name, lat, lon, type, depthRangeFt, weedType, bottom, bestWind, tempBandsF, months, lureFamilies, notes, source, verified: false, addedBy: "seed" }`. Ids are `seed-<lakeId>-<n>`.

- [ ] **Step 1: Obtain depth maps**

Michigan DNR blocks plain fetches with a 403, so use a browser user agent, and fall back to the in-app browser if a URL still refuses:
```bash
mkdir -p private/maps-src
# Michigan: the county index lists PDFs. Fetch it with a browser UA and extract Cisco Chain links.
curl -sL -A "Mozilla/5.0 (Macintosh)" "https://www.michigan.gov/dnr/things-to-do/fishing/where/inland-lake-maps/counties/gogebic-county" -o private/maps-src/gogebic.html
grep -oiE 'href="[^"]*(thousand|cisco|fishhawk|lindsley|clearwater|record|indian|poor|morley|african|east.bay|west.bay)[^"]*\.pdf"' private/maps-src/gogebic.html | sort -u
# Wisconsin: direct doclink PDFs, WBIC-based. Big Lake is known:
curl -sL -A "Mozilla/5.0 (Macintosh)" "https://apps.dnr.wi.gov/doclink/lakes_maps/2334700a.pdf" -o private/maps-src/big.pdf
```
For Mamie and West Bay, find the WBIC on the Wisconsin DNR lake pages (search "Mamie Lake Vilas County WBIC" in the in-app browser) and fetch `https://apps.dnr.wi.gov/doclink/lakes_maps/<WBIC>a.pdf`. If the Michigan page gives no links, open it in the in-app browser, copy the PDF links by hand, and fetch each with the same `curl -A`.

Convert each PDF's first page to a JPEG with macOS tools, no installs:
```bash
for f in private/maps-src/*.pdf; do
  id=$(basename "$f" .pdf)
  sips -s format jpeg -s formatOptions 70 -Z 1600 "$f" --out "maps/$id.jpg" >/dev/null && echo "maps/$id.jpg"
done
```
If `sips` refuses a PDF, open it in Preview, File, Export, JPEG, quality medium, then resize with `sips -Z 1600 maps/<id>.jpg`. Name files by lake id. Then set `mapImage` in `content/lakes.json` to `"maps/<id>.jpg"` for each lake that has one. Maps are public DNR data and are committed.

- [ ] **Step 2: Pick seeded spots**

For Thousand Island, Cisco, Big, Mamie, and Fishhawk, four to six spots each. Method:

1. Open the depth map and OpenStreetMap side by side in the in-app browser (`https://www.openstreetmap.org/#map=14/46.22/-89.41`).
2. Choose, in this order of value for fall: every neck or channel mouth into the lake; every point with contour lines close together on the map; the largest weed flat with a steep edge; inlet mouths; the dam end of Cisco; islands' windward sides; on Thousand Island, any gravel shoal or sunken island marked on the DNR map (cisco spawn spots).
3. Read lat and lon by right-clicking the location in OpenStreetMap ("Show address" shows coordinates) or from the URL after centering. Four decimal places.
4. Fill `depthRangeFt` from the contour lines, `bestWind` as the compass directions that blow onto the spot, `tempBandsF` as `[[58,72]]` for flats, `[[48,62]]` for edges and points, `[[36,55]]` for breaks and shoals, `months` as `[9,10,11]`, `lureFamilies` from the matching lure families in lures.json, `source` as the map's source id or `"osm-aerial"` plus a short note of what was seen.

Write the pack with this shape (first two entries shown as the pattern; replace coordinates with the ones you read):
```json
{ "kind": "spots-pack", "generated": "2026-10-02T00:00:00Z", "spots": [
  { "id": "seed-thousand-island-1", "lakeId": "thousand-island", "name": "East ramp break", "lat": 46.2330, "lon": -89.3800, "type": "break", "depthRangeFt": [8, 25], "weedType": "unknown", "bottom": "sand and gravel", "bestWind": ["W", "SW"], "tempBandsF": [[36, 55]], "months": [10, 11], "lureFamilies": ["rubber", "crankbait", "sucker"], "notes": "Water gets deep fast off the DNR ramp per fishweb; first break east shore.", "source": "fishweb-ramp", "verified": false, "addedBy": "seed" },
  { "id": "seed-thousand-island-2", "lakeId": "thousand-island", "name": "Cisco neck (outlet to Cisco Lake)", "lat": 46.2360, "lon": -89.4250, "type": "neck", "depthRangeFt": [4, 12], "weedType": "unknown", "bottom": "unknown", "bestWind": ["E", "NE"], "tempBandsF": [[48, 62]], "months": [9, 10, 11], "lureFamilies": ["glider", "jerkbait", "bucktail"], "notes": "Outlet channel toward Cisco; travel route per the DNR connection list.", "source": "mi-dnr-1993-thousand-island", "verified": false, "addedBy": "seed" }
] }
```
Add a `sources.json` entry `osm-aerial` ("OpenStreetMap and aerial imagery, read by eye on 2026-10-02") if any spot cites it.

- [ ] **Step 3: Validate the seed**

Run: `node --test test/content.test.js`
Expected: PASS, including "private spots seed validates when present". Every spot inside the bounding box, every lake id and type known, every seed spot with a source.

- [ ] **Step 4: Confirm the seed is not tracked, then commit the maps**

```bash
git check-ignore private/spots-seed.json && echo "ignored: good"
git status --short | grep -c private && echo "PRIVATE FILES WOULD BE COMMITTED, STOP" || echo "nothing private staged"
npm run precache && npm test
git add maps content/lakes.json content/sources.json js/precache-manifest.js
git commit -m "content: DNR depth maps for the chain lakes"
```

### Task 15: Publish and install

**Files:**
- Create: `README.md` (two lines, no location named)
- Modify: none

**Interfaces:**
- Produces: the live site `https://trmnmc.github.io/fieldbook/`, the spots pack on Truman's phone, the app on the home screen.

- [ ] **Step 1: Final checks before anything leaves the machine**

```bash
npm run precache && npm test
git status --short
grep -rl "spots-seed\|\"spots\"" content js index.html | grep -v precache-manifest || echo "no spot data in published files"
git ls-files | grep -c '^private/' && echo "STOP: private tracked" || echo "private not tracked"
```
Expected: tests pass, working tree clean except the manifest if it changed, no spot data in published files, private not tracked.

- [ ] **Step 2: Write README.md and commit**

```markdown
# fieldbook

Offline fishing planner. Installs to an iPhone home screen from the published page.
```
```bash
git add README.md js/precache-manifest.js && git commit -m "docs: readme" || true
```

- [ ] **Step 3: Create the public repo and push**

Approved by Truman on 2026-10-01 (public, bland name, no secrets).
```bash
gh repo create trmnmc/fieldbook --public --description "Offline fishing planner" --source=. --remote=origin --push
gh repo view trmnmc/fieldbook --json url,visibility,description
```
Expected: `visibility: PUBLIC`, description "Offline fishing planner".

- [ ] **Step 4: Enable GitHub Pages and wait for the site**

```bash
gh api -X POST repos/trmnmc/fieldbook/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/" || gh api repos/trmnmc/fieldbook/pages
for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' https://trmnmc.github.io/fieldbook/); echo "try $i: $code"; [ "$code" = "200" ] && break; sleep 20; done
curl -s https://trmnmc.github.io/fieldbook/manifest.webmanifest | head -3
```
Expected: 200 within about five minutes, and the manifest JSON prints.

- [ ] **Step 5: Smoke-test the live site in the in-app browser**

Open `https://trmnmc.github.io/fieldbook/`. Expected: plan view loads, status shows a forecast age, lessons open, lakes open, no console errors, the service worker registers (Application tab or `navigator.serviceWorker.controller` in the console after a reload).

- [ ] **Step 6: Deliver the spots pack to Truman's phone**

Send `private/spots-seed.json` with the SendUserFile tool (status proactive, display attach, caption "Spots pack. Save to Files, then import in Settings."). Do not commit it. Do not paste its contents in chat.

- [ ] **Step 7: Prompt Truman for the phone steps, then wait**

Only Truman can do these. Stop and ask at this moment, with this list:

1. On the iPhone, open Safari and go to `https://trmnmc.github.io/fieldbook/`.
2. Tap Share, then Add to Home Screen, then Add.
3. Open the app from the home screen once while on wifi and wait ten seconds so it caches.
4. Save the spots pack file from the message to Files, then in the app open Settings, Import, and pick it.
5. Turn on Airplane Mode, open the app, build a plan for Thousand Island with today's date and the water temperature. Confirm windows, spots, and lures appear.
6. Tap Start trip, tap Here, tap Follow, save with the defaults. Confirm the timeline shows the follow with the moon and pressure line.
7. Turn Airplane Mode off. In Settings tap Backup JSON and confirm the share sheet opens.
8. Reply with what worked and what did not.

- [ ] **Step 8: Record the result**

After Truman replies, fix anything broken as a bounded change, re-run `npm test`, `npm run precache`, commit, and push. Pages redeploys on push; the phone shows the update banner on its next open with signal.

---

## Self-review notes

- Spec coverage: section 3 (Tasks 1, 4, 13), section 4 (Tasks 4 to 7, 14), section 5 (Task 8, 11), section 6 (Tasks 9, 10, 12), section 7.1 facts (Tasks 5, 6, 7), section 7.2 research (Task 14 maps; stocking database and past reports are phase 2), section 8 errors (Tasks 3, 8, 11, 13), section 9 tests (every task), section 11 publishing (Task 15), privacy (Tasks 4, 13, 14, 15).
- Not in version one, by the spec's phases: own-log bonus is wired (Task 8, Task 11 passes `logStats`) but the moon-clock chart and spot statistics page are phase 2. Past-report mining is phase 2.
- Names used across tasks: `h`, `clear`; `CHAIN`, `windows`, `sunTimes`, `moonPhase`, `moonEvents`, `nearestMoonEvent`, `fmtTime`, `localDayBounds`; `conditionsAt`, `fetchForecast`; `createMemoryStore`, `createIndexedDBStore`, `newId`, `STORES`; `loadContent`, `indexContent`, `validateContent`, `CHAIN_BBOX`; `plan`, `matchPatterns`, `dayWindows`, `scoreWindows`, `scoreSpots`, `scoreLures`, `validateInputs`; `snapshot`, `startTrip`, `addEvent`, `setOutcome`, `endTrip`, `rates`, `effortBySpot`, `verifySpots`, `tripTimeline`, `logStatsForPlanner`, `EVENT_KINDS`; `toBackupJson`, `importJson`, `catchesToCsv`, `eventsToCsv`, `LUNGE_LOG_COLUMNS`, `csvEscape`; `fitWithin`, `downscaleImage`, `savePhoto`; `listPublished`, `PRECACHE`, `VERSION`.
