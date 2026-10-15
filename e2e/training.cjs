// Insights → Training, A · your lifts (PLAN 64; owner, 13 Oct: all three boards, "go"). 12 fake weeks of Push / Pull /
// Legs, Mon/Wed/Fri at 18:00, every working set plus a warm-up, a check-in before and after. Planted: every lift +0.6 %
// a week; every 4th session +3.5 % above the lift's line (not tied to a weekday: with three templates on three days,
// "Fridays" would all be Legs, and Legs' own line would rightly take the 3.5 % in). The page must show this week against the usual, the four most
// trained lifts each with "+N kg in 12 weeks", recent sessions with Fridays above the line, and working sets per muscle.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const D = 86_400_000, NOW = new Date('2026-10-14T21:00:00').getTime(); // a Wednesday evening, after the session
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const TPL = { Push: [['Bench press', 100], ['Overhead press', 60]], Pull: [['Barbell row', 85], ['Lat pulldown', 70]], Legs: [['Squat', 130], ['Romanian deadlift', 110]] };
function world() {
  const { g } = rng(11), entries = [], workouts = [], good = new Set(), t0 = new Date(2026, 6, 20, 18).getTime(); // Mon 20 Jul
  let n = 0;
  for (let w = 0; w < 13; w++) for (const dow of [0, 2, 4]) {
    const at = t0 + (w * 7 + dow) * D; if (at > NOW - 2 * 3_600_000) continue;
    const tpl = ['Push', 'Pull', 'Legs'][n % 3], id = `w${w}-${dow}`, fri = n % 4 === 1; n++;
    if (fri) good.add(id);
    workouts.push({ id, template: tpl, startedAt: at, endedAt: at + 3_600_000 });
    entries.push({ id: 'fb' + id, kind: 'feel', at: at - 30 * 60_000, energy: 6 }, { id: 'fa' + id, kind: 'feel', at: at + 80 * 60_000, energy: 7 });
    for (const [ex, b] of TPL[tpl]) {
      const e1 = b * (1 + 0.006 * (w + dow / 7)) * (1 + ((fri ? 3.5 : 0) + g() * 0.5) / 100), kg = Math.round(e1 / (1 + 5 / 30) / 2.5) * 2.5;
      entries.push({ id: `${id}${ex}w`, kind: 'set', at: at + 60_000, workoutId: id, exercise: ex, kg: Math.round(kg / 2), reps: 10, warmup: true });
      for (let k = 0; k < 3; k++) entries.push({ id: `${id}${ex}${k}`, kind: 'set', at: at + (k + 2) * 60_000, workoutId: id, exercise: ex, kg, reps: k ? 5 : Math.max(3, Math.round(30 * (e1 / kg - 1))) });
    }
  }
  const templates = Object.entries(TPL).map(([name, xs], i) => ({ id: 't' + i, name, exercises: xs.map(([nm]) => ({ name: nm, sets: 3, reps: 5, restSec: 120 })) }));
  return { entries, workouts, templates, good: [...good] };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  for (const [vw, vh] of [[390, 844], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, ...(vw < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((w) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries; s.workouts = w.workouts; s.templates = w.templates; localStorage.setItem(k, JSON.stringify(s)); }, w);
    await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 });
    const tag = vw < 500 ? 'phone' : 'laptop';
    // PLAN 82 (owner, 13 Oct: "a muscle group strength average taking in data from diff exercises that target same muscle")
    const mstr = await pg.locator('.tp-srow').evaluateAll((els) => els.map((e) => [e.dataset.muscle, e.dataset.state, e.querySelector('b').textContent.replace(/\s+/g, ' ').trim(), e.querySelector('small').textContent, e.querySelector('.tp-strack').title]));
    // every lift gains 0.6 % a week: each muscle is either "stronger" or honestly "not clear yet" — never holding or dropping
    check(`${tag}: strength per muscle — the planted gain read as stronger or not clear yet, never holding or dropping (${mstr.map((m) => `${m[0]} ${m[2]}`).join(' · ')})`, mstr.length === 5 && mstr.every(([, st]) => st === 'stronger' || st === 'unclear') && mstr.filter(([, st]) => st === 'stronger').length >= 3);
    check(`${tag}: each range holds the planted +0.6 (${mstr.map((m) => m[4].replace('90% range ', '')).join(' · ')})`, mstr.every((m) => { const [lo, hi] = m[4].match(/([+−±][\d.]+) to ([+−±][\d.]+)/).slice(1).map((x) => +x.replace('−', '-').replace('±', '')); return lo <= 0.6 && hi >= 0.55; }));
    check(`${tag}: back from both its lifts, chest from bench only (triceps and shoulders' half credit left out)`, mstr.some(([m, , , l]) => m === 'Back' && /Barbell row/.test(l) && /Lat pulldown/.test(l)) && mstr.some(([m, , , l]) => m === 'Chest' && l === 'Bench press') && !mstr.some(([m]) => m === 'Triceps' || m === 'Biceps' || m === 'Glutes'));
    await pg.locator('.tp-mstr').screenshot({ path: OUT + `training-muscle-strength-${tag}.png` });
    if (vw < 500) {
      const tile = async (k) => (await pg.locator(`.tp-tile[data-k="${k}"]`).innerText()).replace(/\s+/g, ' ');
      check(`this week (Mon–Wed, 2 sessions): "${await tile('Sessions')}", "${await tile('Working sets')}"`, /^SESSIONS 2 usual 3 a week$/i.test(await tile('Sessions')) && /^WORKING SETS 12 usual 18 a week$/i.test(await tile('Working sets')));
      check(`next in the rotation, with last time's sets (${await tile('Next')})`, /^NEXT (Push|Pull|Legs) \w[\w ]+ 3 × 5 at \d+(\.5)? kg$/i.test(await tile('Next')));
      const lifts = await pg.locator('.tp-lift').evaluateAll((els) => els.map((e) => [e.dataset.lift, e.querySelector('.tp-gain').textContent]));
      check(`four most-trained lifts, each "+N kg in 12 weeks" (${lifts.map((l) => l.join(': ')).join(' · ')})`, lifts.length === 4 && lifts.every((l) => /^\+\d+\.\d kg in 1[12] weeks$/.test(l[1])));
      const bench = lifts.find((l) => l[0] === 'Bench press');
      const gain = bench ? +bench[1].match(/\+(\d+\.\d)/)[1] : 0;
      check(`bench: the planted +0.6 %/week → about +7 kg on ~108 kg (${gain})`, gain >= 5 && gain <= 10);
      const sess = await pg.locator('.tp-sess').evaluateAll((els) => els.map((e) => [e.querySelector('b').textContent, +e.dataset.pct, e.dataset.id]));
      const fri = sess.filter((s) => w.good.includes(s[2])).map((s) => s[1]), rest = sess.filter((s) => !w.good.includes(s[2])).map((s) => s[1]);
      const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      check(`recent sessions, newest first; the planted good ones above the line (${m(fri).toFixed(1)} % vs ${m(rest).toFixed(1)} %, ${fri.length} of ${sess.length})`, sess.length === 8 && /^Wed 14 Oct/.test(sess[0][0]) && fri.length >= 1 && m(fri) - m(rest) > 2);
      check('…felt before → after, from the check-ins', /felt 6 → 7/.test(await pg.locator('.tp-sess').first().innerText()));
      const chest = await pg.locator('.tp-mrow[data-muscle="Chest"]').getAttribute('data-usual');
      check(`sets per muscle: chest a usual week (bench 3 sets, push once or twice a week → ${chest})`, +chest >= 3 && +chest <= 6);
      check(`the old "Strength" panel is gone (it's this page now)`, await pg.getByText("e1RM, % of where each lift started").count() === 0);
    }
    check(`${tag}: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= vw);
    await pg.locator('.tp').screenshot({ path: OUT + `training-a-${tag}.png` });
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
