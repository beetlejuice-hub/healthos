// Caffeine & sleep (owner, 2 Oct): amount at bedtime, could it matter in general, does it for you —
// kept apart; a normal coffee day isn't warned about; the morning sleep rating is what it learns from.
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
  const local = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const T = (s) => new Date(s).getTime();
  const coffee = (iso, mg = 95) => ({ id: 'c' + iso, kind: 'drink', at: T(iso), name: 'Coffee', ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 });
  const setEntries = (es) => pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.entries = es; localStorage.setItem(k, JSON.stringify(s)); }, es);
  const at = async (iso) => { await pg.clock.setFixedTime(new Date(iso)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); };

  // 08:30 — the morning check-in asks about last night, once per night.
  const sleepRow = pg.getByRole('group', { name: "Last night's sleep" });
  check('morning: "Last night\'s sleep" row in How now?', await sleepRow.count() === 1);
  await sleepRow.getByRole('button', { name: 'sleep 4', exact: true }).click();
  await pg.getByRole('button', { name: 'took long to fall asleep' }).click();
  await sleepRow.getByRole('button', { name: 'sleep 6', exact: true }).click(); await pg.waitForTimeout(250);
  let sl = ((await local()).entries || []).filter((e) => e.kind === 'sleep');
  check('one entry for the night, re-tap changes it (6, slow)', sl.length === 1 && sl[0].rating === 6 && sl[0].slow === true);
  check('a sleep rating is not a check-in (no feel entry)', ((await local()).entries || []).every((e) => e.kind !== 'feel'));
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(200);
  check('the log shows it', /Last night's sleep[\s\S]*6 \/ 10 · slow to fall asleep/.test(await pg.locator('body').innerText()));
  await at('2026-10-02T15:00:00');
  check('afternoon: no sleep row', await pg.getByRole('group', { name: "Last night's sleep" }).count() === 0);

  // A normal day: 08:10 + 13:00, at 14:20 → ~36 mg at 23:00: in the card, not in Now.
  await setEntries([coffee('2026-10-02T08:10:00'), coffee('2026-10-02T13:00:00')]);
  await at('2026-10-02T14:20:00');
  const now = await pg.locator('.item').allInnerTexts();
  check('normal coffee day: nothing about caffeine in Now', !now.some((t) => /caffeine|mg likely|cut-off/i.test(t)));
  const sum = await pg.locator('p.sum').innerText();
  check(`summary keeps the half-life read (${sum.split('. ').at(-1)})`, /There's \d+ mg of caffeine in you, falling to \d+ mg by 23:00/.test(sum));
  const read = pg.getByLabel('Caffeine at bedtime');
  const r1 = await read.innerText();
  check(`card: "Possible effect" with amount, range and the learning line (${r1.split('\n')[0].slice(0, 60)}…)`, /Possible effect · about 3\d mg at 23:00/.test(r1) && /Likely \d+–\d+ mg/.test(r1) && /Rate last night's sleep/.test(r1));
  await read.scrollIntoViewIfNeeded(); await pg.screenshot({ path: OUT + 'cafsleep-normal.png' });

  // A heavy late day: 15:00, 17:00, 17:30 at 18:00 → ~150 mg at 23:00: a calm item, no "!".
  await setEntries([coffee('2026-10-02T15:00:00'), coffee('2026-10-02T17:00:00'), coffee('2026-10-02T17:30:00')]);
  await at('2026-10-02T18:00:00');
  const item = pg.locator('.item', { hasText: 'likely still in you' });
  check('heavy late day: one calm item (☾, not !)', await item.count() === 1 && (await item.locator('.ic').innerText()) === '☾' && !(await item.getAttribute('class')).includes('warn'));
  check('…that says "could", not "should"', /could shorten or lighten sleep for many people/.test(await item.innerText()) && !/should|unhealthy|cut-off/i.test(await item.innerText()));
  await pg.screenshot({ path: OUT + 'cafsleep-heavy.png' });

  // Someone whose own nights show it: 8 late-coffee nights rated 4, 8 clean nights rated 8.
  const hist = [];
  for (let i = 1; i <= 16; i++) {
    const d = new Date(2026, 8, 30 - i), m = new Date(d.getTime() + 86400000);
    const late = i % 2 === 0;
    if (late) hist.push({ id: 'h' + i, kind: 'drink', at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18).getTime(), name: 'Coffee', ml: 250, caffeineMg: 190, alcoholG: 0, kcal: 2 });
    hist.push({ id: 's' + i, kind: 'sleep', at: new Date(m.getFullYear(), m.getMonth(), m.getDate(), 8).getTime(), rating: late ? 4 + (i % 4 === 0 ? 1 : 0) : 8 - (i % 3 === 0 ? 1 : 0) });
  }
  await setEntries([...hist, coffee('2026-10-02T15:00:00'), coffee('2026-10-02T17:00:00'), coffee('2026-10-02T17:30:00')]);
  await at('2026-10-02T18:00:00');
  const mine = pg.locator('.item', { hasText: 'likely still in you' });
  const mt = await mine.innerText();
  check(`your nights agree → the "!" and your own numbers (${mt.match(/Your own nights[^.]*\./)?.[0]})`, (await mine.getAttribute('class')).includes('warn') && /Your own nights: with 30\+ mg left you rated sleep \d\.\d lower \(8 vs 8 nights\)/.test(mt));
  await pg.screenshot({ path: OUT + 'cafsleep-personal.png' });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
