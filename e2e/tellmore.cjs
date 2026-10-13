// Telling the app more (PLAN 89, 90). Owner, 13 Oct: "i should be able to leave notes on mood logging, like head hurts, or
// parents made me mad" and "telling more to the app, like i was sleeping w gf that night, ive been up late night working, or
// been out w friends drinking, so app can see and learn what events, peoples affect me and how".
// Part 1, at phone size: a note without moving a slider first; the note on the folded line and in Log; the morning's
// "Last night" chips and your own word; nothing asked at 00:30. Part 2: 30 fake nights from the band with last night's tags
// each morning (the first 4 mornings untagged — before you were asked). Planted: nights "out with friends" → 70 min less
// sleep and mood −1.5 the next day; "worked late" ticked at random does nothing; "with gf" on 3 nights isn't a row yet.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const cl = (v) => Math.max(1, Math.min(10, Math.round(v)));
const NOW2 = new Date('2026-10-09T16:30:00').getTime();
function world() {
  const { r, g } = rng(33), hr = [], sleep = [], entries = [];
  for (let k = 29; k >= 0; k--) {
    const day0 = new Date(2026, 9, 9 - k).getTime(), T = (h) => day0 + h * HOUR;
    // the night ending this morning
    const out = k % 3 === 1, late = r() < 0.4, gf = k === 3 || k === 7 || k === 11;
    const hrs = 7.4 + g() * 0.2 - (out ? 70 / 60 : 0), bed = T(-0.9 + g() * 0.15), up = bed + (hrs * 60 + 20) * MIN;
    const onset = bed + 12 * MIN, wake = up - 8 * MIN, stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(hrs * 60), awakeMin: 20, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - 2 * HOUR; t < T(23) && t <= NOW2; t += MIN) { const v = Math.round((t > onset && t < wake ? 54 : 64) + g() * 1.2); hr.push([t, v, v - 2, v + 2]); }
    // the morning: rated, and from the 5th morning on, last night's tags
    entries.push({ id: 'sl' + k, kind: 'sleep', at: T(8), rating: cl(7 + g() * 0.5), ...(k < 26 ? { tags: [...(out ? ['out'] : []), ...(late ? ['worklate'] : []), ...(gf ? ['gf'] : [])] } : {}) });
    if (k > 0) entries.push({ id: 'f' + k, kind: 'feel', at: T(19.5), mood: cl(6.8 + g() * 0.4 - (out ? 1.5 : 0)), energy: cl(6 + g() * 0.4), focus: cl(6 + g() * 0.5), stress: cl(4 + g() * 0.5) });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries: entries.sort((a, b) => a.at - b.at) };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-12T07:30:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('#feel');
  const saved = async (k) => { await pg.waitForTimeout(350); return (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).entries?.filter((e) => e.kind === k) ?? []; };
  const sl = (n) => pg.locator(`#feel [role=slider][data-name="${n}"]`);
  const tap = async (n, v) => { const bb = await sl(n).boundingBox(); await pg.mouse.click(bb.x + ((v - 1) / 9) * bb.width, bb.y + bb.height / 2); await pg.waitForTimeout(200); };
  const chip = (name) => pg.getByRole('group', { name: 'Last night' }).getByRole('button', { name, exact: true });

  // ---- 07:30: the card stays small until you answer; rate last night, then what it held
  check('before rating: no chips yet (the card stays compact)', await sl('sleep').count() === 1 && await pg.getByRole('group', { name: 'Last night' }).count() === 0);
  await tap('sleep', 6);
  check('rated: "Last night" chips under the sleep question', await chip('with gf').count() === 1 && await chip('worked late').count() === 1 && await chip('out with friends').count() === 1 && await chip('scrolled in bed').count() === 0);
  await chip('with gf').click(); await chip('worked late').click(); await chip('worked late').click();
  // the phone, asked as a question now (PLAN 88; owner: "estimated time of phone before bed … 0 to like an hour or more")
  const phone = (label) => pg.getByRole('radiogroup', { name: 'Phone before sleep' }).getByRole('radio', { name: label, exact: true });
  check('"Phone before sleep": none to 1 h+', await phone('none').count() === 1 && await phone('1 h+').count() === 1);
  await phone('~15 min').click(); await phone('~30 min').click();
  await pg.getByRole('group', { name: 'Last night' }).getByRole('button', { name: '+ your own' }).click();
  await pg.getByLabel('Last night, your own word').fill('Sauna!'); await pg.getByLabel('Last night, your own word').press('Enter');
  let s = await saved('sleep');
  check(`one sleep entry: rating 6, the tags (untapped "worked late" gone, own word cleaned), phone 30 — one answer, the last tap (${JSON.stringify(s.map((x) => [x.rating, x.tags, x.phoneMin]))})`, s.length === 1 && s[0].rating === 6 && JSON.stringify(s[0].tags) === '["gf","sauna"]' && s[0].phoneMin === 30);
  check('…the phone answer shows as chosen', await phone('~30 min').getAttribute('aria-checked') === 'true' && await phone('~15 min').getAttribute('aria-checked') === 'false');
  check('the chips show what\'s ticked', await chip('with gf').getAttribute('aria-pressed') === 'true' && await chip('worked late').getAttribute('aria-pressed') === 'false' && await chip('sauna').getAttribute('aria-pressed') === 'true');
  await pg.locator('#feel').screenshot({ path: OUT + 'tellmore-morning.png' });

  // ---- a note on its own: no slider first (it used to appear only after one)
  check('"+ Add a note" is on the card before any feeling is rated', await pg.getByRole('button', { name: /Add a note/ }).count() === 1 && (await saved('feel')).length === 0);
  await pg.getByRole('button', { name: /Add a note/ }).click();
  const note = pg.getByLabel('Why? A note on this check-in');
  check('…tapping it opens the note, ready to type', await note.count() === 1 && await note.evaluate((el) => el === document.activeElement));
  await note.fill('head hurts'); await note.press('Enter');
  let f = await saved('feel');
  check(`Enter saves one check-in with the note, not two (${JSON.stringify(f.map((x) => x.note))})`, f.length === 1 && f[0].note === 'head hurts');
  await tap('mood', 4);
  f = await saved('feel');
  check(`a feeling rated next joins that check-in (${JSON.stringify(f.map((x) => [x.mood, x.note]))})`, f.length === 1 && f[0].mood === 4 && f[0].note === 'head hurts');

  // ---- 08:10: the folded line shows the note and can change it
  await pg.clock.setSystemTime(new Date('2026-10-12T08:10:00')); await pg.reload(); await pg.waitForSelector('#feel');
  const line = await pg.locator('#feel.calm-line').innerText();
  check(`folded line: the note is on it (${line.replace(/\n/g, ' ')})`, /mood 4/.test(line) && /“head hurts”/.test(line));
  await pg.getByRole('button', { name: 'Edit note' }).click();
  await pg.getByLabel('Why? A note on this check-in').fill('head hurts, parents made me mad'); await pg.getByLabel('Why? A note on this check-in').press('Enter');
  f = await saved('feel');
  check(`…edited there, same check-in (${JSON.stringify(f.map((x) => x.note))})`, f.length === 1 && f[0].note === 'head hurts, parents made me mad');
  await pg.locator('#feel').screenshot({ path: OUT + 'tellmore-folded.png' });
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // ---- Log: tap a check-in to change its note later; last night's tags on the sleep row
  await pg.goto(APP + '#log'); await pg.waitForSelector('text=Logged today');
  const sleepRow = await pg.locator('.li', { hasText: "Last night's sleep" }).innerText();
  check(`Log: the sleep row says what last night held (${sleepRow.replace(/\n/g, ' ')})`, /with gf, sauna · phone ~30 min/.test(sleepRow));
  await pg.getByRole('button', { name: /^Change Feeling/ }).click();
  await pg.getByLabel('Why? A note on this check-in').fill('head hurts, parents made me mad, slept badly'); await pg.getByLabel('Why? A note on this check-in').press('Enter');
  f = await saved('feel');
  check(`Log: the note changed on that check-in (${JSON.stringify(f.map((x) => x.note))})`, f.length === 1 && f[0].note === 'head hurts, parents made me mad, slept badly');
  check('Log: the row shows it', /“head hurts, parents made me mad, slept badly”/.test(await pg.locator('.li', { hasText: 'Feeling' }).innerText()));

  // ---- 00:30: still last night — no sleep question; 07:20 the next morning: asked, your word remembered
  await pg.goto(APP); await pg.clock.setSystemTime(new Date('2026-10-13T00:30:00')); await pg.reload(); await pg.waitForSelector('#feel');
  if (await pg.getByRole('button', { name: /Rate (again|sleep)/ }).count()) await pg.getByRole('button', { name: /Rate (again|sleep)/ }).click();
  check('00:30: no sleep question, no "Last night" chips (the night isn\'t over)', await sl('sleep').count() === 0 && await pg.getByRole('group', { name: 'Last night' }).count() === 0);
  await pg.clock.setSystemTime(new Date('2026-10-13T07:20:00')); await pg.reload(); await pg.waitForSelector('#feel');
  if (await pg.getByRole('button', { name: /Rate (again|sleep)/ }).count()) await pg.getByRole('button', { name: /Rate (again|sleep)/ }).click();
  check('next morning: asked again', await sl('sleep').count() === 1);
  await tap('sleep', 8);
  check('…rated: nothing ticked from yesterday, "sauna" offered as a chip', await chip('sauna').count() === 1 && await chip('with gf').getAttribute('aria-pressed') === 'false');
  s = await saved('sleep');
  check(`…a second sleep entry for the new night, no tags yet (${JSON.stringify(s.map((x) => [x.rating, x.tags ?? null]))})`, s.length === 2 && s[1].rating === 8 && !s[1].tags);

  // ---- Part 2: the grids learn from the tags
  const w = world();
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx2.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx2.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW2 - 40 * 86_400_000, lastSync: NOW2 - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - 86_400_000 && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const p2 = await ctx2.newPage();
  await p2.clock.install({ time: NOW2 });
  p2.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p2.goto(APP);
  await p2.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await p2.fill('input[type=password]', 'secret123');
  await p2.getByRole('button', { name: 'Sign in' }).click(); await p2.waitForSelector('text=Settings');
  await p2.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
  const cell = (sel, fn, o) => p2.locator(`${sel} .sl-cell`).evaluateAll((els, [fn, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${fn} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [fn, o]);
  const rowN = (sel, name) => p2.locator(`${sel} .sl-mf`).evaluateAll((els, name) => { const e = els.find((x) => x.firstChild.textContent === name); const m = e?.querySelector('small')?.textContent.match(/(\d+) vs (\d+)/); return m ? +m[1] + +m[2] : null; }, name);
  await p2.goto(APP + '#insights/sleep'); await p2.reload(); await p2.waitForSelector('.sl[data-nights]');
  await p2.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(300);
  const nN = +(await p2.locator('.sl').getAttribute('data-nights'));
  const oa = await cell('.sl', 'Out with friends', 'Asleep'), oN = await rowN('.sl', 'Out with friends');
  check(`sleep grid: "Out with friends" is a row; −70 min planted, found (${oa})`, oa && (oa[0] === 'clear' || oa[0] === 'likely') && oa[1] === 'worse' && /^−\d+m$/.test(oa[2]));
  check(`sleep grid: mornings before you were asked are left out (${oN} of ${nN} nights)`, oN != null && nN - oN >= 3 && nN - oN <= 5);
  const wl = await p2.locator('.sl .sl-cell').evaluateAll((els) => els.filter((x) => x.getAttribute('aria-label')?.startsWith('Worked late and') && (x.dataset.sure === 'clear')).length);
  check(`sleep grid: "worked late", nothing planted, nothing clear (${wl})`, wl === 0);
  const coming = await p2.locator('.sl .sl-coming').innerText().catch(() => '');
  check(`"with gf" on 3 nights: not a row yet, counted toward 5 (${coming})`, /with gf 3 of 5/.test(coming) && (await rowN('.sl', 'With gf')) == null);
  await p2.locator('.sl .sl-cell[aria-label^="Out with friends and Asleep"]').click(); await p2.waitForTimeout(150);
  const sides = await p2.locator('.sl .sl-open .sl-tag').allTextContents();
  check(`opened: the dots are the nights the cell counted, unasked mornings left out (${sides.join(' / ')})`, sides.length === 2 && sides.reduce((a, t) => a + +(t.match(/(\d+) nights/) || [0, 0])[1], 0) === oN);
  await p2.locator('.sl .sl-c').screenshot({ path: OUT + 'tellmore-sleepgrid.png' });
  await p2.goto(APP + '#insights/mind'); await p2.waitForSelector('.mp[data-sec]');
  await p2.waitForFunction(() => +document.querySelector('.mp')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(300);
  const om = await cell('.mp', 'Out with friends', 'Mood'), of = await cell('.mp', 'Out with friends', 'Focus');
  check(`mind grid: out with friends → mood −1.5 the next day, found (${om})`, om && (om[0] === 'clear' || om[0] === 'likely') && om[1] === 'worse');
  check(`mind grid: focus, nothing planted, nothing found (${of})`, of && of[0] !== 'clear' && of[0] !== 'likely');
  check(`phone: nothing wider than the screen (${await p2.evaluate(() => document.documentElement.scrollWidth)} px)`, await p2.evaluate(() => document.documentElement.scrollWidth) <= 390);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
