// Ghost logging (PLAN 177, body lab 9; owner, 27 Oct: "okay?"; "i eat different stuff"). 21 logged days: a flat white
// ~09:10 every day, a 2nd at 14:30 on 16 of 21, the morning stack (creatine, vitamin D3), food different every day, and
// pancakes every Saturday; Sat 24 and Sun 25 not logged. Tuesday 09:00: Today drafts the weekend — the stack as one line,
// both coffees, pancakes on Saturday only, none of the varied food. Untick Sunday's 2nd coffee, keep the rest: exactly
// those are logged, at their usual times; the card goes; the "how did you eat?" card still asks (a coffee and pancakes
// aren't a day's food). Undo brings the drafts back. "None of it" logs nothing and doesn't ask again. 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';
const SUPPS = [{ id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }, { id: 'vitd', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: true }];
const at = (day, min) => new Date(`${day}T00:00:00`).getTime() + min * 60_000;
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function log() {
  const es = []; let n = 0;
  const days = [...Array.from({ length: 21 }, (_, i) => addDays('2026-10-03', i)), '2026-10-26'];
  days.forEach((d, i) => {
    es.push({ id: `d${n++}`, kind: 'drink', at: at(d, 9 * 60 + 5 + (i % 3) * 5), name: 'Flat white', ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 110 });
    if (i % 4 !== 3) es.push({ id: `d${n++}`, kind: 'drink', at: at(d, 14 * 60 + 30), name: 'Flat white', ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 110 });
    for (const s of ['cre', 'vitd']) es.push({ id: `s${n++}`, kind: 'supp', at: at(d, 8 * 60 + 5), suppId: s, status: 'taken', slot: 'morning' });
    es.push({ id: `f${n++}`, kind: 'food', at: at(d, 13 * 60), name: `Lunch ${i}`, grams: 300, macros: { kcal: 900, p: 40, c: 90, f: 30 } });
    es.push({ id: `f${n++}`, kind: 'food', at: at(d, 19 * 60 + 30), name: `Dinner ${i}`, grams: 300, macros: { kcal: 1000, p: 45, c: 100, f: 35 } });
    if (new Date(`${d}T12:00:00`).getDay() === 6) es.push({ id: `f${n++}`, kind: 'food', at: at(d, 10 * 60 + 30), name: 'Pancakes', grams: 200, macros: { kcal: 500, p: 12, c: 70, f: 18 } });
  });
  return es;
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, edit = (es) => es) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date('2026-10-27T09:00:00').getTime() });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, es, ss]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.supplements = ss; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, edit(log()), SUPPS]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
    return { ctx, pg };
  }
  const card = (pg) => pg.getByRole('region', { name: 'Usual things, drafted' });
  const store = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries, KEY);
  const lines = (pg) => card(pg).locator('.gh-item b').allInnerTexts();

  let { ctx, pg } = await open(390);
  const head = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the weekend, drafted (${head.slice(0, 120)})`, /^Not logged Sat 24 – Sun 25 Oct Your weekend, drafted/i.test(head));
  const l = await lines(pg);
  check(`Saturday: stack, coffee, pancakes, 2nd coffee; Sunday: stack, both coffees; no varied food (${l.join(' | ')})`, l.join('|') === '08:05 · Morning stack: Creatine, Vitamin D3|09:10 · Flat white|10:30 · Pancakes|14:30 · Flat white|08:05 · Morning stack: Creatine, Vitamin D3|09:10 · Flat white|14:30 · Flat white');
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card(pg).screenshot({ path: OUT + 'ghost.png' });
  // one ask about the same days at a time (28 Oct review: drafts and "how did you eat?" showed back to back)
  check('while drafted, "how did you eat?" waits', await pg.getByRole('region', { name: 'Days not logged' }).count() === 0);
  const before = (await store(pg)).length;
  await card(pg).locator('[data-draft="2026-10-25|drink:flat white|870"] input').uncheck();
  await card(pg).getByRole('button', { name: 'Keep the 6 ticked' }).click(); await pg.waitForTimeout(400);
  const es = await store(pg), wk = es.filter((e) => e.kind !== 'answer' && e.at >= new Date('2026-10-24T00:00:00').getTime() && e.at < new Date('2026-10-26T00:00:00').getTime());
  const hm = (e) => `${e.kind}:${e.name ?? e.suppId}@${new Date(e.at).getHours()}:${String(new Date(e.at).getMinutes()).padStart(2, '0')}`;
  const sun = wk.filter((e) => new Date(e.at).getDate() === 25).map(hm).sort();
  check(`kept: 8 entries on the weekend + 2 answers; Sunday's 2nd coffee not among them (${sun.join(', ')})`, es.length === before + 10 && wk.length === 8 && es.filter((e) => e.kind === 'answer' && /^ghost:/.test(e.key)).length === 2 && sun.join() === ['drink:Flat white@9:10', 'supp:cre@8:05', 'supp:vitd@8:05'].sort().join());
  check('the card goes; "how did you eat?" still asks', await card(pg).count() === 0 && await pg.getByRole('region', { name: 'Days not logged' }).count() === 1);
  await pg.getByRole('button', { name: 'Undo' }).click({ timeout: 2000 }).catch(() => {}); await pg.waitForTimeout(400);
  check(`Undo: back to before, drafts again (${(await store(pg)).length} entries)`, (await store(pg)).length === before && await card(pg).count() === 1);
  await card(pg).getByRole('button', { name: 'None of it' }).click(); await pg.waitForTimeout(400);
  const after = await store(pg), none = after.filter((e) => e.kind === 'answer' && /^ghost:/.test(e.key));
  const onWeekend = after.filter((e) => e.kind !== 'answer' && [24, 25].includes(new Date(e.at).getDate()) && new Date(e.at).getMonth() === 9);
  check(`None of it: only the two days answered, nothing logged (${none.map((e) => `${e.key}=${e.answer}`).join(', ')}; ${onWeekend.length} on the weekend)`, after.length === before + 2 && none.length === 2 && none.every((e) => e.answer === 'none') && onWeekend.length === 0);
  await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
  check('not asked again', await card(pg).count() === 0);
  await ctx.close();

  // yesterday a whole day not logged too (Sat–Mon): the catch-up leaves the coffee and the stack to the drafts — and after "None of it" too
  ({ ctx, pg } = await open(390, (es) => es.filter((e) => new Date(e.at).getDate() !== 26)));
  const days3 = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Sat–Mon drafted; the morning catch-up doesn't ask about the stack or coffee as well (${days3.slice(0, 60)}; catch-up rows: ${await pg.locator('#catchup .cu-row').count()})`, /^Not logged Sat 24 – Mon 26 Oct/i.test(days3) && await pg.locator('#catchup .cu-row[data-kind="supp"], #catchup .cu-row[data-kind="drink"]').count() === 0);
  await card(pg).getByRole('button', { name: 'None of it' }).click(); await pg.waitForTimeout(400);
  check(`…nor after "None of it" (${await pg.locator('#catchup .cu-row').count()} rows)`, await pg.locator('#catchup .cu-row[data-kind="supp"], #catchup .cu-row[data-kind="drink"]').count() === 0);
  await ctx.close();

  ({ ctx, pg } = await open(320));
  check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await card(pg).count() === 1 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'ghost-320.png' });
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
