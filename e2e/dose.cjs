// Supplement doses (owner, 2 Oct): change the mg; the app keeps the history and compares days on each dose.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T12:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));

  // 24 evenings of magnesium at 400 mg with ratings, then today the owner drops it to 200 mg.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), D = 864e5, t0 = new Date('2026-09-08T21:30:00').getTime(); const es = [];
    for (let i = 0; i < 24; i++) { const at = t0 + i * D; es.push({ id: 'm' + i, kind: 'supp', at, suppId: 'mag', status: 'taken', slot: 'evening' }); es.push({ id: 'r' + i, kind: 'sleep', at: at + 10.5 * 36e5, rating: 6 + (i % 3) }); es.push({ id: 'f' + i, kind: 'feel', at: at + 14 * 36e5, mood: 6 + (i % 2) }); }
    s.entries = es; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.goto(APP + '#log/stack'); await pg.reload(); await pg.waitForTimeout(300);
  await pg.locator('.supp-row').filter({ hasText: 'Magnesium' }).getByRole('button', { name: 'Edit' }).click();
  const dose = pg.getByLabel('Dose');
  await dose.fill('2'); await dose.fill('20'); await dose.fill('200 mg'); await dose.press('Enter'); await pg.waitForTimeout(200);
  const mag = (await st()).supplements.find((x) => x.id === 'mag');
  check('typing then leaving the field records one change, not one per keystroke', mag.dose === '200 mg' && mag.doseLog.length === 2 && mag.doseLog[0].dose === '400 mg' && mag.doseLog[1].dose === '200 mg');
  await pg.getByRole('button', { name: 'Done' }).click();
  check('Done closes the editor (nothing moved under the finger)', await pg.getByLabel('Dose').count() === 0);
  await pg.locator('.supp-row').filter({ hasText: 'Magnesium' }).getByRole('button', { name: 'Edit' }).click();
  check('reopened, the editor says what changed', await pg.getByText('Changed to 200 mg on Fri 2 Oct').count() === 1);

  // Since 28 Sep at 200 mg (4 evenings: 28 Sep–1 Oct): not enough yet → says how many more.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)), m = s.supplements.find((x) => x.id === 'mag'); const D = 864e5;
    m.doseLog[1].at = new Date('2026-09-28T12:00:00').getTime();
    for (let i = 0; i < 3; i++) { const at = new Date('2026-09-28T21:30:00').getTime() + i * D; s.entries.push({ id: 'n' + i, kind: 'supp', at, suppId: 'mag', status: 'taken', slot: 'evening' }); }
    localStorage.setItem(k, JSON.stringify(s)); });
  await pg.goto(APP + '#insights'); await pg.reload(); await pg.waitForTimeout(500);
  const sec = pg.locator('#doses');
  const txt = await sec.innerText();
  check(`Insights: Magnesium 400 mg vs 200 mg, needs more days on 200 (${(txt.match(/needs \d+ more days? on [\d ]+mg/) || [''])[0]})`, /Magnesium · 400 mg \(20 days\) vs 200 mg \(4 days\)/i.test(txt) && /needs 1 more day on 200 mg/i.test(txt));
  await sec.screenshot({ path: OUT + 'dose.png' });
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
