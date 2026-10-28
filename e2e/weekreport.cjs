// Your week, one report (owner, 28 Oct: "a weekly overview of strength and cardio and gym performance, mostly graphics of
// how much i improved or not"; picked "one scrolling report"). Monday 2 Nov, 09:00, nine weeks planted: Mondays Push +
// Quads (squat +2.5 kg a week, the press flat at 60), Thursdays Pull + Hamstrings (row +1 kg a week, the leg curls in the
// split never done), one 30-minute Stairmaster last Wednesday (20 min at 120 bpm, 10 at 160, max 190 → Z2 20, Z4 10), the
// band's resting HR 55 → 53. Today's "For you" has last week's report (first day of the week only — the control: not on
// Tuesday); "See it" opens it on last week: a stronger week, squat PB +3 kg, press "same", hamstrings 0 and orange, cardio
// 30 min by zone, resting HR 53 −2, 2 of 2 sessions; "Add to Pull + Hamstrings" makes the leg curl 5 sets (and only that),
// survives a reload, Undo puts 3 back; ‹ › walk the weeks, this week says nothing's logged yet; Workout links to it. 390 + 320.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const MIN = 60_000, D = 86_400_000, NOW = new Date('2026-11-02T09:00:00').getTime(), KEY = 'healthos.v1:u-test';
const at = (day, h, m = 0) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SPLIT = [
  { id: 'a', name: 'Push + Quads', exercises: [{ name: 'Squat', sets: 3, reps: 6, restSec: 150 }, { name: 'Bench press', sets: 3, reps: 8, restSec: 120 }, { name: 'Overhead press', sets: 3, reps: 8, restSec: 120 }] },
  { id: 'b', name: 'Pull + Hamstrings', exercises: [{ name: 'Barbell row', sets: 3, reps: 8, restSec: 120 }, { name: 'Leg curl', sets: 3, reps: 10, restSec: 90 }] },
];
function world() {
  const entries = [], workouts = [], hr = [], rhr = {};
  for (let w = 1; w <= 9; w++) {
    const mon = ymd(NOW - (10 - w) * 7 * D), thu = ymd(new Date(mon + 'T12:00').getTime() + 3 * D); // w = 9: Mon 26 Oct
    const p = 'p' + w, q = 'q' + w;
    workouts.push({ id: p, template: 'Push + Quads', startedAt: at(mon, 18), endedAt: at(mon, 19), plan: [] });
    workouts.push({ id: q, template: 'Pull + Hamstrings', startedAt: at(thu, 18), endedAt: at(thu, 19), plan: [] });
    for (let k = 0; k < 3; k++) {
      entries.push({ id: `${p}s${k}`, kind: 'set', at: at(mon, 18, 5 + k), workoutId: p, exercise: 'Squat', kg: 90 + 2.5 * w, reps: 6 });
      entries.push({ id: `${p}b${k}`, kind: 'set', at: at(mon, 18, 20 + k), workoutId: p, exercise: 'Bench press', kg: 80 + (w % 2 ? 0 : 2.5), reps: 8 });
      entries.push({ id: `${p}o${k}`, kind: 'set', at: at(mon, 18, 40 + k), workoutId: p, exercise: 'Overhead press', kg: 60, reps: 6 });
      entries.push({ id: `${q}r${k}`, kind: 'set', at: at(thu, 18, 5 + k), workoutId: q, exercise: 'Barbell row', kg: 70 + w, reps: 8 });
    }
  }
  const s = at('2026-10-28', 7);
  workouts.push({ id: 'c1', template: 'Stairmaster', kind: 'cardio', startedAt: s, endedAt: s + 30 * MIN, cardio: { what: 'Stairmaster' }, plan: [] });
  for (let m = 0; m < 30; m++) { const v = m < 20 ? 120 : 160; hr.push([s + m * MIN, v, v - 2, v + 2]); }
  for (let k = 1; k <= 30; k++) rhr[ymd(NOW - k * D)] = k <= 7 ? 53 : 55;
  return { entries, workouts, hr, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  for (const width of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/(band|push)\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      if (u.pathname.includes('/push/')) return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"devices":[],"next":null}' });
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: w.rhr, hrv: {}, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, w, split]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries; s.workouts = w.workouts; s.templates = split; s.settings = { ...s.settings, maxHr: 190 }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w, SPLIT]);
    const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
    const fits = async (where) => { const sw = await pg.evaluate(() => document.documentElement.scrollWidth); check(`${width}: ${where} fits (${sw} px)`, sw <= width); };

    // Today, Monday: last week's report in "For you"
    await pg.goto(APP + '#today'); await pg.reload();
    const there = await forYou(pg, 'week');
    const ask = there ? (await pg.locator('.fy-item[data-current] .weekask').innerText()).replace(/\s+/g, ' ') : '';
    check(`${width}: Monday's "For you" has last week (${ask})`, there && /^Your week Mon 26 Oct – Sun 1 Nov A stronger week 2 of 2 sessions · Squat \+3 kg, barbell row \+1\.3 kg · 2 PBs · cardio 30 min · resting HR 53 \(−2\) See it/i.test(ask));
    if (width === 390) await pg.locator('.fy').screenshot({ path: OUT + 'weekreport-ask.png' });
    await pg.locator('.weekask').getByRole('button', { name: 'See it ›' }).click();
    await pg.waitForSelector('.wkpage');
    check(`${width}: "See it" opens the report on last week (${await pg.evaluate(() => location.hash)})`, await pg.evaluate(() => location.hash) === '#workout/week' && /last week/.test(await pg.locator('.wk-step').innerText()));
    const head = (await pg.locator('.wk-head').innerText()).replace(/\s+/g, ' ');
    check(`${width}: the headline (${head})`, /Your week · Mon 26 Oct – Sun 1 Nov/i.test(head) && /A stronger week/i.test(head) && /Squat \+3 kg, barbell row \+1\.3 kg · 2 PBs/.test(head) && /cardio 30 min/.test(head) && /resting HR 53 \(−2\)/.test(head));
    const lift = async (n) => (await pg.locator('.wk-lift', { hasText: n }).first().innerText()).replace(/\s+/g, ' ');
    const spill = await pg.$$eval('.wk-lift', (els) => els.filter((el) => [...el.querySelectorAll('.wk-val > *')].some((c) => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 0.5)).length);
    check(`${width}: every lift's numbers stay inside its box (${spill} spill)`, spill === 0);
    check(`${width}: squat 135 kg +3 with a PB, the press the same, 4 lifts drawn (${await lift('Squat')} | ${await lift('Overhead press')})`,
      /135 kg \+3 kg/.test(await lift('Squat')) && await pg.locator('.wk-lift[data-pb]', { hasText: 'Squat' }).count() === 1 && /72 kg same/.test(await lift('Overhead press'))
      && await pg.getByRole('region', { name: 'Lifts' }).getByRole('img').count() === 4);
    const ham = pg.locator('.wk-mrow', { hasText: 'Hamstrings' });
    check(`${width}: hamstrings 0 sets, flagged (${(await ham.innerText()).replace(/\s+/g, ' ')})`, await ham.getAttribute('data-low') !== null && /Hamstrings 0$/.test((await ham.innerText()).replace(/\s+/g, ' ').trim()) && await pg.locator('.wk-mrow', { hasText: 'Quads' }).getAttribute('data-low') !== null);
    const cardio = (await pg.getByRole('region', { name: 'Cardio' }).innerText()).replace(/\s+/g, ' ');
    check(`${width}: cardio by zone: 0 the week before, 30 min, mostly zone 2 (${cardio})`, /19–25 Oct 0 min/.test(cardio) && /26 Oct – 1 Nov 30 min/.test(cardio) && /\+30 minutes on the week before; most in zone 2/.test(cardio)
      && await pg.locator('.wk-zbar').nth(1).locator('i').count() === 2 && !/no heart rate/.test(cardio));
    const fit = (await pg.getByRole('region', { name: 'Fitness' }).innerText()).replace(/\s+/g, ' ');
    check(`${width}: resting heart rate 53, −2 over the weeks (${fit})`, /Resting HR 53 bpm −2/.test(fit) && !/VO2/.test(fit));
    const sess = (await pg.getByRole('region', { name: 'Sessions' }).innerText()).replace(/\s+/g, ' ');
    check(`${width}: sessions 2 of 2 (${sess})`, /Sessions 2 of 2/i.test(sess) && /Mon · Push \+ Quads/.test(sess) && /Thu · Pull \+ Hamstrings/.test(sess) && /Lifted [\d.]+ t in all; the 4 weeks before averaged [\d.]+ t/.test(sess));
    await fits('the report');
    if (width === 390) { await pg.screenshot({ path: OUT + 'weekreport.png', fullPage: true }); }
    else { await pg.screenshot({ path: OUT + 'weekreport-320.png', fullPage: true }); await ctx.close(); continue; }

    // one thing for next week: 2 more sets of the leg curl already in the split
    const next = pg.getByRole('region', { name: 'One thing for next week' });
    check(`the suggestion (${(await next.innerText()).replace(/\s+/g, ' ')})`, /hamstrings least \(0\)\. Add 2 sets of Leg curl to Pull \+ Hamstrings\?/.test(await next.innerText()));
    await next.getByRole('button', { name: 'Add to Pull + Hamstrings' }).click(); await pg.waitForTimeout(200);
    let s = await st();
    const pull = () => s.templates.find((t) => t.name === 'Pull + Hamstrings');
    check(`"Add" makes the leg curl 5 sets, nothing else changes (${JSON.stringify(pull().exercises.map((e) => [e.name, e.sets]))})`,
      pull().exercises.find((e) => e.name === 'Leg curl').sets === 5 && pull().exercises.find((e) => e.name === 'Barbell row').sets === 3 && JSON.stringify(s.templates[0]) === JSON.stringify(SPLIT[0]));
    check(`the card says so (${(await next.innerText()).replace(/\s+/g, ' ')})`, /✓ Leg curl is 5 sets on Pull \+ Hamstrings now\./.test(await next.innerText()));
    await pg.reload(); await pg.waitForSelector('.wkpage');
    check('after a reload it still says so', /✓ Leg curl is 5 sets/.test(await pg.getByRole('region', { name: 'One thing for next week' }).innerText()));
    await pg.getByRole('region', { name: 'One thing for next week' }).getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(200);
    s = await st();
    check(`Undo puts 3 sets back (${pull().exercises.find((e) => e.name === 'Leg curl').sets})`, pull().exercises.find((e) => e.name === 'Leg curl').sets === 3);
    await pg.getByRole('region', { name: 'One thing for next week' }).getByRole('button', { name: 'Not now' }).click(); await pg.waitForTimeout(150);
    check('"Not now" puts it away for that week', await pg.getByRole('region', { name: 'One thing for next week' }).count() === 0);

    // ‹ › walk the weeks
    await pg.getByRole('button', { name: 'The week before' }).click(); await pg.waitForTimeout(150);
    const two = (await pg.locator('.wk-head').innerText()).replace(/\s+/g, ' ');
    check(`‹ : two weeks ago, its own numbers (${two})`, /2 weeks ago/.test(await pg.locator('.wk-step').innerText()) && /Mon 19 – Sun 25 Oct/i.test(two) && /Squat \+3 kg/.test(two));
    await pg.getByRole('button', { name: 'The week after' }).click(); await pg.getByRole('button', { name: 'The week after' }).click(); await pg.waitForTimeout(150);
    const thisw = (await pg.locator('.wkpage').innerText()).replace(/\s+/g, ' ');
    check(`› › : this week, nothing logged yet, › stops there (${thisw.slice(0, 140)})`, /this week/.test(thisw) && /Nothing logged yet this week/i.test(thisw) && await pg.getByRole('button', { name: 'The week after' }).isDisabled());

    // Workout links to it
    await pg.goto(APP + '#workout'); await pg.waitForSelector('.wk-entry');
    const entry = (await pg.locator('.wk-entry').innerText()).replace(/\s+/g, ' ');
    check(`Workout: last week in a line, a tap opens it (${entry})`, /Last week · Mon 26 Oct – Sun 1 Nov/i.test(entry) && /2 of 2 sessions/.test(entry));
    await pg.locator('.wk-entry').click(); await pg.waitForSelector('.wkpage');
    await pg.getByRole('link', { name: '‹ Workout' }).click(); await pg.waitForSelector('.wk-entry');
    check('"‹ Workout" goes back', await pg.locator('.wkpage').count() === 0);

    // control: Tuesday the report isn't in "For you" again
    await pg.clock.setSystemTime(NOW + D); await pg.goto(APP + '#today'); await pg.reload();
    check('control: Tuesday, not in "For you" again', !(await forYou(pg, 'week')));
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
