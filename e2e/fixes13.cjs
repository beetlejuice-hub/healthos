// The owner's 13 Oct batch, the small fixes, through the real pages:
// PLAN 73 — Settings' body weight is your latest weigh-in ("its nonsense cus i log every morning");
// PLAN 76 — dumbbell exercises say "kg per dumbbell" ("not sure if for exp on db press its one hand kg or both");
// PLAN 77 — the morning sleep question shows the band's minutes to fall asleep instead of the tag.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, NOW = new Date('2026-10-13T08:10:00').getTime();
function night(k, fallMin) { // the night ending k mornings ago, 23:30 → 07:00
  const day = new Date(2026, 9, 13 - k).getTime(), bed = day - 0.5 * HOUR, up = day + 7 * HOUR, on = bed + fallMin * MIN;
  return { id: 'n' + k, start: bed, end: up, asleepMin: 400, awakeMin: 10, toFallAsleepMin: fallMin, nap: false, stageMin: {},
    stages: [{ type: 'awake', start: bed, end: on }, { type: 'light', start: on, end: on + 2 * HOUR }, { type: 'deep', start: on + 2 * HOUR, end: on + 3 * HOUR }, { type: 'rem', start: on + 3 * HOUR, end: up }] };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open({ band, seed }) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const st = band ? { connected: true, needsReconnect: false, connectedAt: NOW - 20 * 86_400_000, lastSync: NOW - 2 * MIN, latest: NOW - 5 * MIN, error: null, gapSec: 60 } : { connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null };
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' && band ? { hr: [], sleep: band, rhr: {}, hrv: {}, steps: [], ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((seed) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, seed); localStorage.setItem(k, JSON.stringify(s)); }, seed);
    return { ctx, pg };
  }
  // 73: a weigh-in this morning → Settings shows it, no field to type in
  let { ctx, pg } = await open({ band: null, seed: { entries: [{ id: 'w1', kind: 'weight', at: NOW - 60 * MIN, kg: 77.4 }, { id: 'w0', kind: 'weight', at: NOW - 3 * 86_400_000, kg: 78.1 }], settings: { halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 90, usualDrink: null } } });
  await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('text=Sleep and body');
  const w = await pg.locator('[data-weight="logged"]').innerText().catch(() => '');
  check(`Settings: body weight is this morning's weigh-in, not a typed 90 (${w.replace(/\n/g, ' ')})`, /77\.4 kg/.test(w) && await pg.getByRole('textbox', { name: /Body weight/ }).count() === 0);
  await ctx.close();
  ({ ctx, pg } = await open({ band: null, seed: { entries: [] } }));
  await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('text=Sleep and body');
  check('Settings: no weigh-in yet → the field is there to fill in', await pg.getByRole('textbox', { name: /Body weight/ }).count() === 1);
  await ctx.close();
  // 76: a dumbbell exercise says "kg per dumbbell"; a barbell one just "kg"
  ({ ctx, pg } = await open({ band: null, seed: { entries: [], workouts: [{ id: 'w1', template: 'Push', startedAt: NOW - 10 * MIN, endedAt: null, plan: [{ name: 'Incline DB press', sets: 3, reps: 10, restSec: 90 }, { name: 'Bench press', sets: 3, reps: 8, restSec: 120 }] }] } }));
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
  const lbl = await pg.locator('.steppers .lbl').first().innerText();
  check(`Workout: Incline DB press → "${lbl}"`, /kg per dumbbell/i.test(lbl));
  await pg.locator('.tile.cur').screenshot({ path: OUT + 'fixes13-db.png' });
  await ctx.close();
  // 77: the band has last night → "Fell asleep in 40 min — from your band, longer than your usual 12"; no tag to tap
  const band = [night(0, 40), ...[1, 2, 3, 4, 5, 6].map((k) => night(k, 12))];
  ({ ctx, pg } = await open({ band, seed: { entries: [] } }));
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  await pg.waitForSelector('.hn-fell', { timeout: 8000 }).catch(() => {});
  const fell = await pg.locator('.hn-fell').innerText().catch(() => '');
  check(`Today, morning: the band's fall-asleep time (${fell})`, /Fell asleep in 40 min — from your band, longer than your usual 12/.test(fell));
  check('…and no "took long to fall asleep" tag to tap', await pg.getByRole('button', { name: 'took long to fall asleep' }).count() === 0);
  await pg.locator('#feel').screenshot({ path: OUT + 'fixes13-fell.png' });
  await ctx.close();
  ({ ctx, pg } = await open({ band: null, seed: { entries: [] } }));
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  check('no band: the tag is still there', await pg.getByRole('button', { name: 'took long to fall asleep' }).count() === 1);
  await ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
