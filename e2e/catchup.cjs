// Owner, 9 Oct: "At morning the next day it should ask thing at today page things like did u take magnesium (supp), and
// other things i did not log that day but shouldve done". 12 days of habits (magnesium each evening, coffee each morning,
// lunch and dinner), then a yesterday with only lunch logged: this morning Today asks about the rest, once.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const D = 86_400_000;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-09T07:50:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((D) => {
    const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), es = [], at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
    for (let d = 7; d >= -4; d--) { // 7 Oct back to 26 Sep (day numbers ≤ 0 roll into September)
      es.push({ id: `m${d}`, kind: 'supp', at: at(d, 21, 35), suppId: 'mag', status: 'taken', slot: 'evening' });
      es.push({ id: `c${d}`, kind: 'drink', at: at(d, 8, 10 + (d % 3) * 5), name: 'Flat white', ml: 200, caffeineMg: 130, alcoholG: 0, kcal: 110 });
      es.push({ id: `l${d}`, kind: 'food', at: at(d, 12, 40), name: 'Chicken rice', grams: 400, macros: { kcal: 650, p: 45, c: 80, f: 15 } });
      es.push({ id: `d${d}`, kind: 'food', at: at(d, 19, 20), name: 'Salmon & potatoes', grams: 450, macros: { kcal: 700, p: 40, c: 60, f: 28 } });
    }
    es.push({ id: 'ly', kind: 'food', at: at(8, 12, 50), name: 'Chicken rice', grams: 400, macros: { kcal: 650, p: 45, c: 80, f: 15 } }); // yesterday: only lunch
    s.entries = es.sort((a, b) => a.at - b.at);
    s.supplements = [{ id: 'mag', name: 'Magnesium glycinate', dose: '200 mg', slot: 'evening', at: 21 * 60 + 30, active: true }];
    localStorage.setItem(k, JSON.stringify(s)); localStorage.removeItem('healthos.catchup.no');
  }, D);
  await pg.reload(); await pg.waitForSelector('#feel');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const card = pg.locator('#catchup');
  const rows = async () => card.locator('.cu-row').evaluateAll((els) => els.map((e) => e.dataset.kind + ': ' + e.querySelector('span').textContent));
  check(`morning: asks about magnesium last night, the usual coffee, dinner — not lunch (${(await rows()).join(' | ')})`,
    JSON.stringify((await rows()).map((r) => r.split(':')[0])) === JSON.stringify(['supp', 'drink', 'meal']) && (await rows())[2].includes('dinner') && !(await rows()).some((r) => r.includes('lunch')));
  await card.screenshot({ path: OUT + 'catchup.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  await card.getByRole('button', { name: 'Took it' }).click(); await pg.waitForTimeout(150);
  const mag = (await st()).entries.filter((e) => e.kind === 'supp' && e.at >= new Date(2026, 9, 8).getTime());
  check(`"Took it" logs magnesium taken yesterday at 21:30 (${mag.map((e) => new Date(e.at).toString().slice(4, 21) + ' ' + e.status).join(', ')})`, mag.length === 1 && mag[0].status === 'taken' && mag[0].at === new Date(2026, 9, 8, 21, 30).getTime() && mag[0].slot === 'evening');
  await card.getByRole('button', { name: 'Had my usual' }).click(); await pg.waitForTimeout(150);
  const cof = (await st()).entries.filter((e) => e.kind === 'drink' && e.at >= new Date(2026, 9, 8).getTime());
  check(`"Had my usual" logs a flat white yesterday at the usual time (${cof.map((e) => new Date(e.at).toString().slice(16, 21) + ' ' + e.name + ' ' + e.caffeineMg + ' mg').join(', ')})`, cof.length === 1 && cof[0].name === 'Flat white' && cof[0].caffeineMg === 130 && new Date(cof[0].at).getDate() === 8 && new Date(cof[0].at).getHours() === 8);
  check(`answered rows go; dinner is left (${(await rows()).join(' | ')})`, (await rows()).length === 1 && (await rows())[0].startsWith('meal'));

  await card.getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(400);
  const banner = await pg.locator('.log-for').innerText().catch(() => '');
  check(`"Log it" opens Log saying it's for yesterday at 19:00, before anything's typed (${banner})`, /#log\/food/.test(await pg.evaluate(() => location.hash)) && /Logging for yesterday, 19:00/.test(banner));
  await pg.getByPlaceholder(/scrambled eggs/).fill('salmon'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
  const day = await pg.locator('.when-day').first().innerText().catch(() => '');
  check(`…and the food goes in on yesterday, 19:00 (${day.replace(/\n/g, ' ')})`, /Yesterday/.test(day) && await pg.locator('.when input[type=time]').first().inputValue().catch(() => '') === '19:00');
  await pg.goto(APP + '#today'); await pg.waitForSelector('#catchup');
  await card.getByRole('button', { name: 'Skip' }).click(); await pg.waitForTimeout(150);
  check('"Skip" closes the card', await card.count() === 0);
  await pg.reload(); await pg.waitForSelector('#feel');
  check('…and it stays closed after a reload (not asked twice)', await card.count() === 0);

  await pg.evaluate(() => localStorage.removeItem('healthos.catchup.no'));
  await pg.clock.setSystemTime(new Date('2026-10-09T15:00:00')); await pg.reload(); await pg.waitForSelector('#feel');
  check('afternoon: no catch-up (mornings only)', await card.count() === 0);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
