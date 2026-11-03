// Press and hold, or swipe left, on a logged food (owner, 3 Nov: "I should be able to delete or change my logged food,
// maybe we can do long press and add options there or swipe"). Log → Logged today: hold Chicken rice → its sheet (the
// tap that ends the hold doesn't also open the numbers); ½ halves it, Undo puts it back; 200 g typed; 08:30 moves it;
// Log again adds one now. Today → What I ate: swipe left on the beer → Delete, Undo brings it back. Controls: a tap
// still opens the numbers as before; a slow scroll-like drag down opens nothing. 320 px fits. The server gets it all.
const { chromium, APP, OUT, handle, tables, openCard } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-11-03T21:00:00').getTime();
const t = (hm) => new Date(`2026-11-03T${hm}:00`).getTime();
const ENTRIES = [
  { id: 'rice', kind: 'food', at: t('13:05'), name: 'Chicken rice', grams: 300, macros: { kcal: 540, p: 36, c: 66, f: 12.5 } },
  { id: 'beer', kind: 'drink', at: t('20:00'), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215, c: 18 },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const e of ENTRIES) tables.entries.set(`u-test|${e.id}`, { user_id: 'u-test', id: e.id, kind: e.kind, at: new Date(e.at).toISOString(), data: e, deleted: false, updated_at: '2026-11-03T20:00:00.000Z' });
  const ctx = await b.newContext({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"off"}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').entries || []).some((e) => e.id === 'beer'), KEY, { timeout: 8000 });
  const all = async () => (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').entries || [], KEY)).filter((e) => e.kind === 'food' || e.kind === 'drink');
  const one = async (id) => (await all()).find((e) => e.id === id);
  // what the app has saved settles on a short delay: read until `ok`, at most 3 s
  const until = async (f, ok) => { let v; for (let i = 0; i < 30; i++) { v = await f(); if (ok(v)) break; await pg.waitForTimeout(100); } return v; };
  const hold = async (loc, ms = 650) => { await loc.scrollIntoViewIfNeeded(); const r = await loc.boundingBox(); await pg.mouse.move(r.x + 40, r.y + r.height / 2); await pg.mouse.down(); await pg.waitForTimeout(ms); await pg.mouse.up(); };
  const drag = async (loc, dx, dy) => { await loc.scrollIntoViewIfNeeded(); const r = await loc.boundingBox(); const x = r.x + r.width - 30, y = r.y + r.height / 2; await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + dx, y + dy, { steps: 8 }); await pg.mouse.up(); };
  const sheet = (name) => pg.getByRole('dialog', { name: `${name}: change or delete` });

  await pg.goto(APP + '#log'); await pg.waitForSelector('text=Logged today');
  const row = (name) => pg.locator('.holdable', { hasText: name }).first();
  check('Log says how (hold or swipe)', await pg.getByText('Hold or swipe left on a food or drink for its amount, time, again or delete.').count() === 1);

  // control: a tap is a tap — the numbers open, no sheet
  await row('Chicken rice').locator('.li-open').click(); await pg.waitForTimeout(150);
  check('control: a tap opens the numbers as before, no sheet', await pg.locator('.entry-edit').count() === 1 && await sheet('Chicken rice').count() === 0);
  await pg.locator('.entry-edit').getByRole('button', { name: 'Cancel' }).click();

  // hold
  await hold(row('Chicken rice')); await pg.waitForTimeout(150);
  const s = sheet('Chicken rice');
  check(`hold: its sheet opens, and the tap that ended it didn't open the numbers (${(await s.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80)})`, await s.count() === 1 && await pg.locator('.holdable .entry-edit').count() === 0);
  check(`it says what it is (${(await s.locator('.fa-head small').innerText()).trim()})`, /^Tue 3 Nov · 13:05 · 300 g · 540 kcal$/.test((await s.locator('.fa-head small').innerText()).trim()));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await s.screenshot({ path: OUT + 'foodactions-320.png' });
  await s.getByRole('button', { name: '½', exact: true }).click();
  let r = await until(() => one('rice'), (v) => v.grams === 150);
  check(`½: 150 g and half of every number (${r.grams} g, ${r.macros.kcal} kcal, P ${r.macros.p})`, r.grams === 150 && r.macros.kcal === 270 && r.macros.p === 18);
  check(`the sheet shows it at once (${(await s.locator('.fa-head small').innerText()).trim()})`, /150 g · 270 kcal$/.test((await s.locator('.fa-head small').innerText()).trim()));
  await pg.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  r = await until(() => one('rice'), (v) => v.grams === 300);
  check(`Undo: back to 300 g, 540 kcal (${r.grams} g, ${r.macros.kcal})`, r.grams === 300 && r.macros.kcal === 540);
  await s.getByLabel('Amount in g').fill('200'); await s.getByRole('button', { name: 'Set' }).click();
  r = await until(() => one('rice'), (v) => v.grams === 200);
  check(`200 g typed: two thirds of it (${r.grams} g, ${r.macros.kcal} kcal)`, r.grams === 200 && r.macros.kcal === 360);
  await s.getByLabel('Time').fill('08:30');
  r = await until(() => one('rice'), (v) => v.at === t('08:30'));
  check(`08:30: moved, same day (${new Date(r.at).toString().slice(0, 21)})`, r.at === t('08:30'));
  await s.getByRole('button', { name: 'Log again now' }).click();
  const rices = await until(async () => (await all()).filter((e) => e.name === 'Chicken rice'), (v) => v.length === 2);
  check(`Log again: a second one, now, the same amount (${rices.map((e) => `${e.grams} g ${new Date(e.at).toTimeString().slice(0, 5)}`).join(', ')})`, rices.length === 2 && rices.some((e) => Math.abs(e.at - NOW) < 5 * 60_000 && e.grams === 200) && await s.count() === 0);

  // Today → What I ate: swipe left on the beer → Delete → Undo (once "Logged … again · Undo" has gone: it sits over
  // sheets, so Undo can be tapped from one — a swipe starting under it is a tap on it)
  await pg.locator('.toast').waitFor({ state: 'detached', timeout: 9000 });
  await pg.goto(APP + '#today'); await openCard(pg, 'fuel');
  await pg.locator('#fuel .fuel-open').click();
  const day = pg.getByRole('dialog', { name: 'What I ate' }); await day.waitFor();
  // control: a drag down (a scroll) opens nothing
  await drag(row('Beer'), -10, 120); await pg.waitForTimeout(600);
  check('control: dragging down opens nothing', await sheet('Beer').count() === 0);
  await drag(row('Beer'), -120, 4); await pg.waitForTimeout(150);
  check('swipe left: the beer\'s sheet, over What I ate', await sheet('Beer').count() === 1 && await day.count() === 1);
  await sheet('Beer').getByRole('button', { name: 'Delete' }).click();
  const gone = await until(() => one('beer'), (v) => !v);
  check(`Delete: gone, the sheet closed, Undo offered (${await pg.locator('.toast').innerText().catch(() => 'no toast')})`, !gone && await sheet('Beer').count() === 0 && /Deleted Beer/.test(await pg.locator('.toast').innerText().catch(() => '')));
  await pg.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  const back = await until(() => one('beer'), (v) => !!v);
  check(`Undo: the beer is back as it was (${back?.ml} ml, ${back?.alcoholG} g)`, back?.ml === 500 && back?.alcoholG === 20 && await day.locator('.holdable', { hasText: 'Beer' }).count() === 1);

  // the server has what the phone has
  await pg.waitForTimeout(2500);
  const srv = [...tables.entries.values()].filter((x) => !x.deleted && (x.kind === 'food' || x.kind === 'drink')).map((x) => `${x.data.name} ${x.data.grams ?? x.data.ml}`).sort();
  check(`the server: two rice at 200 g, the beer back (${srv.join(', ')})`, srv.join('|') === 'Beer 500|Chicken rice 200|Chicken rice 200');
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
