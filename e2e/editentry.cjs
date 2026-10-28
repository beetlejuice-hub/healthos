// The owner's 13 Oct barcode notes (PLAN 70, 71): "Logged a protein and caffeine drink w bar code it worked but it does not
// show protein" and "i should be able to click on the logged food or drink and modify its macros". A protein coffee logged
// today shows its protein; tapping it opens its numbers; a change is saved on that entry only. The one-tap usual drink keeps
// its protein too (it used to drop it).
const { chromium, APP, OUT, handle, openCard } = require('./harness.cjs');

const NOW = new Date('2026-10-13T11:00:00').getTime();
const drink = { id: 'drink:off:59900:330', name: 'Protein coffee 330 ml', ml: 330, caffeineMg: 150, alcoholG: 0, kcal: 165, p: 25, c: 9, f: 2.5 };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await pg.evaluate(([d, now]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'e1', kind: 'drink', at: now - 3600e3, drinkId: d.id, name: d.name, ml: d.ml, caffeineMg: d.caffeineMg, alcoholG: 0, kcal: d.kcal, p: d.p, c: d.c, f: d.f },
      { id: 'e2', kind: 'food', at: now - 1800e3, name: 'Lángos', grams: 250, macros: { kcal: 700, p: 15, c: 80, f: 35 } }];
    s.settings = { ...(s.settings || {}), halfLifeMin: 300, bedMinute: 1380, coffeeMg: 95, bodyKg: 78, usualDrink: d };
    localStorage.setItem(k, JSON.stringify(s)); }, [drink, NOW]);
  await pg.goto(APP + '#log'); await pg.reload(); await pg.waitForSelector('text=Logged today');
  const row = pg.getByRole('button', { name: /Change Protein coffee/ });
  const rowText = await row.innerText();
  check(`a logged protein drink shows its protein (${rowText.replace(/\n/g, ' ')})`, /P 25/.test(rowText) && /F 3/.test(rowText));
  await row.click();
  const form = pg.getByRole('form', { name: /Change Protein coffee/ });
  check('tapping it opens its numbers', await form.getByLabel('Protein g').inputValue() === '25' && await form.getByLabel('Caffeine mg').inputValue() === '150');
  await form.getByLabel('Protein g').fill('30'); await form.getByLabel('kcal').fill('185');
  await form.screenshot({ path: OUT + 'editentry.png' });
  await form.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(150);
  const e1 = (await st()).entries.find((e) => e.id === 'e1');
  check(`saved on that entry: protein 30, kcal 185, the rest unchanged (${JSON.stringify({ p: e1.p, kcal: e1.kcal, c: e1.c, caf: e1.caffeineMg })})`, e1.p === 30 && e1.kcal === 185 && e1.c === 9 && e1.caffeineMg === 150);
  check('the database drink is untouched', (await st()).settings.usualDrink.p === 25);
  check(`the row shows it (${(await row.innerText()).replace(/\n/g, ' ')})`, /P 30/.test(await row.innerText()));
  await pg.getByRole('button', { name: /Change Lángos/ }).click();
  const ff = pg.getByRole('form', { name: /Change Lángos/ });
  check('a food: kcal and macros, no caffeine field', await ff.getByLabel('Fat g').inputValue() === '35' && await ff.getByLabel('Caffeine mg').count() === 0);
  await ff.getByLabel('Fat g').fill('abc');
  check('a bad number can\'t be saved', await ff.getByRole('button', { name: 'Save' }).isDisabled());
  await ff.getByRole('button', { name: 'Cancel' }).click();
  check('Cancel leaves it as it was', (await st()).entries.find((e) => e.id === 'e2').macros.f === 35);
  // the usual drink, one tap on Today: protein comes along
  await pg.goto(APP + '#today'); await openCard(pg, 'caffeine'); await openCard(pg, 'caffeine');
  // wait for it to be saved: the store writes 150 ms after a change, and a read at 150 ms lost the race under load
  const drinks0 = (await st()).entries.filter((e) => e.kind === 'drink').length;
  await pg.getByRole('button', { name: '+ Protein coffee 330 ml' }).click();
  await pg.waitForFunction((n) => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').entries.filter((e) => e.kind === 'drink').length > n, drinks0, { timeout: 5000 }).catch(() => {});
  const last = (await st()).entries.filter((e) => e.kind === 'drink').sort((a, b) => b.at - a.at)[0];
  check(`one-tap usual drink keeps its protein (${JSON.stringify({ p: last.p, c: last.c, f: last.f })})`, last.p === 25 && last.c === 9 && last.f === 2.5);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
