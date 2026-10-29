// Reform T1 (owner, 29 Oct, on "questions about yesterday stop at noon": "Actually we can keep it, w the option to skip,
// so if i dont remember something i can just skip, like foods i ate, etc"). Every question about yesterday keeps asking,
// and each has "Don't remember": it goes, stays gone after a reload, and is never kept as a "no" or a zero.
// A — Fri 9 Oct 07:50, yesterday only lunch logged: the catch-up's magnesium row → no supplement logged (not "skipped"),
//     the other rows stay; the cigarettes card → kept as "don't remember", the day's cigarettes stay unknown. Control:
//     tonight's cigarettes question still comes at 21:00. 320 px fits with the third button.
// B — Tue 27 Oct 09:00, the weekend not logged: the drafts → both days answered, nothing logged for them; then "how did
//     you eat?" → "Don't remember" too. A reload asks neither again.
const { chromium, APP, OUT, handle, tables, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';
const at = (day, min) => new Date(`${day}T00:00:00`).getTime() + min * 60_000;
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// A: 12 days of habits (magnesium each evening, coffee each morning, lunch and dinner), yesterday only lunch
function habits() {
  const es = [];
  for (let k = 13; k >= 2; k--) {
    const d = addDays('2026-10-09', -k);
    es.push({ id: `m${k}`, kind: 'supp', at: at(d, 21 * 60 + 35), suppId: 'mag', status: 'taken', slot: 'evening' });
    es.push({ id: `c${k}`, kind: 'drink', at: at(d, 8 * 60 + 10 + (k % 3) * 5), name: 'Flat white', ml: 200, caffeineMg: 130, alcoholG: 0, kcal: 110 });
    es.push({ id: `l${k}`, kind: 'food', at: at(d, 12 * 60 + 40), name: 'Chicken rice', grams: 400, macros: { kcal: 650, p: 45, c: 80, f: 15 } });
    es.push({ id: `d${k}`, kind: 'food', at: at(d, 19 * 60 + 20), name: 'Salmon & potatoes', grams: 450, macros: { kcal: 700, p: 40, c: 60, f: 28 } });
    es.push({ id: `s${k}`, kind: 'answer', at: at(d, 21 * 60), key: `smoke:${d}`, question: 'Cigarettes that day?', answer: '0' });
  }
  es.push({ id: 'ly', kind: 'food', at: at('2026-10-08', 12 * 60 + 50), name: 'Chicken rice', grams: 400, macros: { kcal: 650, p: 45, c: 80, f: 15 } });
  return { entries: es.sort((a, b) => a.at - b.at), supplements: [{ id: 'mag', name: 'Magnesium glycinate', dose: '200 mg', slot: 'evening', at: 21 * 60 + 30, active: true }] };
}
// B: 21 logged days (3–23 Oct) and Mon 26, the weekend not logged
function weekend() {
  const es = []; let n = 0;
  const days = [...Array.from({ length: 21 }, (_, i) => addDays('2026-10-03', i)), '2026-10-26'];
  days.forEach((d, i) => {
    es.push({ id: `d${n++}`, kind: 'drink', at: at(d, 9 * 60 + 5 + (i % 3) * 5), name: 'Flat white', ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 110 });
    for (const s of ['cre', 'vitd']) es.push({ id: `s${n++}`, kind: 'supp', at: at(d, 8 * 60 + 5), suppId: s, status: 'taken', slot: 'morning' });
    es.push({ id: `f${n++}`, kind: 'food', at: at(d, 13 * 60), name: `Lunch ${i}`, grams: 300, macros: { kcal: 900, p: 40, c: 90, f: 30 } });
    es.push({ id: `f${n++}`, kind: 'food', at: at(d, 19 * 60 + 30), name: `Dinner ${i}`, grams: 300, macros: { kcal: 1000, p: 45, c: 100, f: 35 } });
  });
  return { entries: es, supplements: [{ id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }, { id: 'vitd', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: true }] };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, time, w) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date(time).getTime() });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, w]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries; s.supplements = w.supplements; localStorage.setItem(k, JSON.stringify(s)); localStorage.removeItem('healthos.catchup.no'); }, [KEY, w]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
    return { ctx, pg, store: () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries, KEY) };
  }
  const sw = (pg) => pg.evaluate(() => document.documentElement.scrollWidth);

  // A — the catch-up and the cigarettes, at 320 (three buttons on a row)
  let { ctx, pg, store } = await open(320, '2026-10-09T07:50:00', habits());
  await forYou(pg, 'catchup');
  const card = pg.locator('#catchup');
  const kinds = () => card.locator('.cu-row').evaluateAll((els) => els.map((e) => e.dataset.kind));
  check(`the catch-up asks: magnesium, the coffee, dinner (${(await kinds()).join(', ')})`, (await kinds()).join() === 'supp,drink,meal');
  check('"Don\'t remember" on the magnesium and coffee rows; dinner keeps its Skip', await card.locator('.cu-row[data-kind="supp"] .cu-unsure').count() === 1 && await card.locator('.cu-row[data-kind="drink"] .cu-unsure').count() === 1 && await card.locator('.cu-row[data-kind="meal"] .cu-unsure').count() === 0);
  check(`320: fits (${await sw(pg)} px)`, await sw(pg) <= 320);
  await card.screenshot({ path: OUT + 'dontremember-catchup-320.png' });
  const n0 = (await store()).length;
  await card.locator('.cu-row[data-kind="supp"]').getByRole('button', { name: "Don't remember" }).click(); await pg.waitForTimeout(300);
  check(`magnesium: the row goes, nothing logged — not "skipped" (${(await store()).length - n0} new entries; rows ${(await kinds()).join(', ')})`, (await store()).length === n0 && (await kinds()).join() === 'drink,meal');
  await forYou(pg, 'smoke');
  const smoke = pg.getByRole('region', { name: 'Cigarettes' });
  check('the cigarettes card asks about yesterday, with "Don\'t remember"', /Cigarettes\s+yesterday\?/i.test(await smoke.innerText()) && await smoke.getByRole('button', { name: "Don't remember" }).count() === 1);
  await smoke.getByRole('button', { name: "Don't remember" }).click(); await pg.waitForTimeout(300);
  const ans = (await store()).filter((e) => e.key === 'smoke:2026-10-08');
  check(`kept as "don't remember" on yesterday; the card goes (${ans.map((e) => e.answer).join()})`, ans.length === 1 && ans[0].answer === "don't remember" && await smoke.count() === 0);
  await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
  check('after a reload: neither asks again', await pg.getByRole('region', { name: 'Cigarettes' }).count() === 0 && (await pg.locator('#catchup .cu-row[data-kind="supp"]').count()) === 0);
  // the day's cigarettes stay unknown: Log shows the answer in words, not "None"
  await pg.clock.setSystemTime(new Date('2026-10-09T21:00:00').getTime()); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
  await forYou(pg, 'smoke');
  check('control: tonight\'s cigarettes question still comes at 21:00', /Cigarettes\s+today\?/i.test(await pg.getByRole('region', { name: 'Cigarettes' }).innerText().catch(() => '')));
  await ctx.close();

  // B — the weekend's drafts, then "how did you eat?"
  ({ ctx, pg, store } = await open(390, '2026-10-27T09:00:00', weekend()));
  await forYou(pg, 'ghost');
  const ghost = pg.getByRole('region', { name: 'Usual things, drafted' });
  const m0 = (await store()).length;
  await ghost.getByRole('button', { name: "Don't remember" }).click(); await pg.waitForTimeout(400);
  const es = await store(), gh = es.filter((e) => e.kind === 'answer' && /^ghost:/.test(e.key));
  const logged = es.filter((e) => e.kind !== 'answer' && [24, 25].includes(new Date(e.at).getDate()) && new Date(e.at).getMonth() === 9);
  check(`drafts: both days answered "don't remember", nothing logged for them (${gh.map((e) => `${e.key}=${e.answer}`).join(', ')}; ${logged.length} logged)`, es.length === m0 + 2 && gh.length === 2 && gh.every((e) => e.answer === "don't remember") && logged.length === 0 && await ghost.count() === 0);
  await forYou(pg, 'foodgap');
  const gap = pg.getByRole('region', { name: 'Days not logged' });
  check('"how did you eat?" asks next, with "Don\'t remember"', await gap.getByRole('button', { name: "Don't remember" }).count() === 1);
  await gap.getByRole('button', { name: "Don't remember" }).click(); await pg.waitForTimeout(400);
  const ate = (await store()).filter((e) => e.kind === 'answer' && /^ate:/.test(e.key));
  check(`kept as not sure, no guess at what you ate (${ate.map((e) => `${e.key}=${e.answer}`).join(', ')})`, ate.length >= 1 && ate.every((e) => e.answer === 'unsure'));
  await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(400);
  check('after a reload: neither asks again', await pg.getByRole('region', { name: 'Usual things, drafted' }).count() === 0 && await pg.getByRole('region', { name: 'Days not logged' }).count() === 0);
  check(`390: fits (${await sw(pg)} px)`, await sw(pg) <= 390);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
