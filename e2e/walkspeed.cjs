// Walking speed from Apple Health in the pattern finder (PLAN 184 phase 2; owner, 29 Oct, his Health app's list — "pls
// select all that are interesting or important and can help the app make predictions"; 31 Oct: "do 2"). 90 days, beers
// on about 3 evenings in 10; the Shortcut's walking speed at 11:00 (the fake Health server), planted 0.4 km/h slower the
// day after beers. Insights → Leads shows it, drawn; Settings → Apple Health says how many days are in. Controls: the same
// days with nothing planted → no walking-speed lead; no walking speed sent → no line in Settings. On a phone.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-31T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

/** The days (entries) and what the Shortcut sent (walk samples): the same seed, so the plant is the only difference. */
function world(plant) {
  let seed = 23; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 0.6;
  const entries = [], samples = [];
  let drank = false;
  for (let i = 90; i >= 1; i--) {
    const day0 = new Date(new Date(NOW - i * D).setHours(0, 0, 0, 0)).getTime();
    entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 18 * 36e5, mood: Math.max(1, Math.min(10, Math.round(7 + (r() - 0.5) * 3))), energy: 6 });
    entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
    const v = 5 + g() - (plant && drank ? 0.4 : 0);
    if (r() < 0.85) samples.push({ type: 'walk', at: day0 + 11 * 36e5, value: Math.round(v * 100) / 100 });
    drank = r() < 0.3;
    if (drank) entries.push({ id: 'b' + i, kind: 'drink', at: day0 + 21 * 36e5, name: 'Beer', ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430 });
  }
  return { entries, samples };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, send = true) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const last = send ? { at: NOW - 23 * 36e5, types: ['walk'] } : { at: NOW - 23 * 36e5, types: ['weight'] };
    await ctx.route('**/api/health/data', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ samples: send ? w.samples : [], last, key: true }) }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, es]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.supplements = []; s.scout = {};
      localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w.entries]);
    await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(500);
    return { ctx, pg };
  }
  const leads = async (pg) => (await pg.locator('#scout .scard').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));

  // planted
  const w = world(true);
  let { ctx, pg } = await open(w);
  let ls = await leads(pg);
  const walk = ls.find((t) => /walking speed/i.test(t)) ?? '';
  check(`Leads: alcohol and next-day walking speed (${walk.slice(0, 110) || ls.map((t) => t.slice(0, 60)).join(' | ') || 'no leads'})`, /Alcohol and next-day walking speed move opposite ways/.test(walk) && /Held on \d+ of \d+/.test(walk));
  const card = pg.locator('#scout .scard', { hasText: 'walking speed' }).first();
  const head = (await card.locator('.lc .dc-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const dots = await card.locator('.lc-b .dc-dot').count();
  check(`drawn: alcohol on top, walking speed the next day under it (${head}; ${dots} days with a speed)`, /^alcohol on top · walking speed, the next day under it/.test(head) && dots >= 10);
  check(`phone: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'walkspeed-lead.png' }).catch(() => {});
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth', { timeout: 8000 }).catch(() => {});
  const line = (await pg.locator('#applehealth .ah-walk').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Settings → Apple Health: how many days are in (${line})`, line === `Walking speed: ${w.samples.length} days in — tested against drinks, sleep, training and how you feel (Insights → Leads).`);
  await ctx.close();

  // control: the same days, nothing planted
  ({ ctx, pg } = await open(world(false)));
  ls = await leads(pg);
  check(`control: nothing planted → no walking-speed lead (${ls.map((t) => t.slice(0, 50)).join(' | ') || 'no leads'})`, !ls.some((t) => /walking speed/i.test(t)));
  await ctx.close();

  // control: no walking speed sent → no line, Leads as before
  ({ ctx, pg } = await open(w, false));
  ls = await leads(pg);
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth', { timeout: 8000 }).catch(() => {});
  check(`control: none sent → no walking speed in Leads or Settings (${ls.length} leads)`, !ls.some((t) => /walking speed/i.test(t)) && await pg.locator('#applehealth .ah-walk').count() === 0 && await pg.locator('#applehealth').count() === 1);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
