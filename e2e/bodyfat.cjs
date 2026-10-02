// Smart-scale body fat: an optional box on both weigh-ins, shown only as a 2-week average.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T08:30:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Today, morning: weight and fat in one go.
  await pg.getByLabel('Weight in kg').fill('71,95'); await pg.getByLabel('Body fat % (optional)').fill('20,1');
  await pg.getByRole('button', { name: 'Log kg' }).click(); await pg.waitForTimeout(200);
  await pg.goto(APP + '#log/body'); await pg.waitForTimeout(200);
  const body = await pg.locator('body').innerText();
  check('Today weigh-in kept both: 71.95 kg · 20.1% fat', /71\.95 kg · 20\.1% fat/.test(body));
  check('one reading: no number yet, says why', /1 of 3 readings in the last 2 weeks/.test(body));

  // A bad value is caught, the box stays optional.
  await pg.getByLabel('Body fat %').fill('201');
  check('201% refused with a reason', /between 3 and 60/.test(await pg.locator('body').innerText()) && await pg.getByRole('button', { name: 'Log weight' }).isDisabled());
  await pg.getByLabel('Body fat %').fill('');
  check('empty box: weight alone still logs', await pg.getByRole('button', { name: 'Log weight' }).isEnabled());

  // Four weeks of mornings: fat coming down 2 points while weight drops 1.5 kg.
  await pg.evaluate(() => {
    const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), day = 86400000, now = Date.now();
    const es = [];
    for (let d = 1; d <= 27; d += 2) es.push({ id: `bf${d}`, kind: 'weight', at: now - d * day, kg: d < 14 ? 71 : 72.5, fatPct: (d < 14 ? 19 : 21) + (d % 4 === 1 ? 0.3 : -0.2) });
    localStorage.setItem(k, JSON.stringify({ ...s, entries: [...es, ...(s.entries || [])] }));
  });
  await pg.reload(); await pg.waitForSelector('text=Log', { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(400);
  const card = await pg.locator('.fatcard').innerText();
  check(`2-week average shown (${card.replace(/\s+/g, ' ').slice(0, 90)}…)`, /19\.\d%/.test(card) && /readings/.test(card));
  check('change split into fat and lean kg', /points vs the 2 weeks before: about −1\.\d kg fat and \+0\.\d kg lean/.test(card));
  await pg.locator('.fatcard').scrollIntoViewIfNeeded();
  await pg.screenshot({ path: OUT + 'bodyfat.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
