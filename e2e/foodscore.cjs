// The food score's quality (PLAN 139, phase 2). A pack from Open Food Facts carries its own Nutri-Score; a food the AI
// made before nutrients were asked for has none yet — "—", and why — and "✨ Ask the AI for its nutrients" asks once (one
// light call, on the tap), keeps the answer on the food, and the item gets its score. Owner, 20 Oct: "I wont really b able
// to add the number or letter for home foods etc".
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-10-16T14:00:00').getTime();
const t = (hm) => new Date(`2026-10-16T${hm}:00`).getTime();
const SCH = { id: 'custom:ai-sch', name: 'Schnitzel', per100: { kcal: 280, p: 18, c: 14, f: 17 }, units: [{ name: 'piece', g: 160 }], servingG: 160, source: 'ai', note: 'home-made' };
const BAR = { id: 'off:599', name: 'Choco bar', brand: 'Brand', per100: { kcal: 500, p: 6, c: 60, f: 25 }, source: 'off', grade: 'e', barcode: '599' };
const ENTRIES = [
  { id: 'sch', kind: 'food', at: t('12:30'), foodId: SCH.id, name: 'Schnitzel', grams: 160, macros: { kcal: 448, p: 28.8, c: 22.4, f: 27.2 }, count: 1, unit: 'piece' },
  { id: 'bar', kind: 'food', at: t('10:00'), foodId: BAR.id, name: 'Choco bar', grams: 50, macros: { kcal: 250, p: 3, c: 30, f: 12.5 } },
];
const calls = [];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'describe') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: { items: [{ kind: 'food', name: 'Schnitzel', amount: '1 piece', per100: SCH.per100, unit: { name: 'piece', g: 160 }, count: 1, confidence: 'medium', note: 'breaded pork',
      nutri: { sugar: 0.8, satFat: 4, salt: 0.9, fiber: 0.8, fvl: 0, redMeat: true, cheese: false } }], dropped: [] }, usage: null, costUsd: 0.002, model: 'haiku' }) });
  });
  for (const e of ENTRIES) tables.entries.set(`u-test|${e.id}`, { user_id: 'u-test', id: e.id, kind: e.kind, at: new Date(e.at).toISOString(), data: e, deleted: false, updated_at: '2026-09-29T11:00:00.000Z' });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').entries || []).some((e) => e.id === 'sch'), KEY, { timeout: 8000 });
  await pg.evaluate(([k, foods]) => { const s = JSON.parse(localStorage.getItem(k)); s.foods = [...foods, ...(s.foods || []).filter((f) => !foods.some((x) => x.id === f.id))]; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, [SCH, BAR]]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#fuel');
  const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  if (!(await st()).foods.some((f) => f.id === SCH.id)) { await pg.evaluate(([k, foods]) => { const s = JSON.parse(localStorage.getItem(k)); s.foods = [...foods, ...(s.foods || [])]; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, [SCH, BAR]]); await pg.reload(); await pg.waitForSelector('#fuel'); }

  await pg.locator('#fuel .fuel-open').click();
  const sheet = pg.getByRole('dialog', { name: 'What I ate' });
  await sheet.waitFor();
  const chip = (name) => sheet.getByRole('button', { name: new RegExp(`^${name}: score`) });
  check(`the pack's own grade: Choco bar scored, Nutri-Score E from the pack (${await chip('Choco bar').innerText()})`, /^\d+$/.test((await chip('Choco bar').innerText()).trim()));
  await chip('Choco bar').click();
  check('…and says so', /Nutri-Score E, from the pack/.test(await sheet.locator('.fd-why').innerText()));
  await chip('Choco bar').click();

  check(`the schnitzel the AI made earlier: no score yet (${await chip('Schnitzel').innerText()})`, (await chip('Schnitzel').innerText()).trim() === '—');
  await chip('Schnitzel').click();
  const why = await sheet.locator('.fd-why').innerText();
  check(`…says what's missing, offers to ask (${why.replace(/\s+/g, ' ')})`, /aren't known yet/.test(why) && await sheet.getByRole('button', { name: '✨ Ask the AI for its nutrients' }).count() === 1);
  check('nothing asked before the tap', !calls.some((c) => c.task === 'describe'));
  await sheet.screenshot({ path: OUT + 'foodscore-ask.png' });
  await sheet.getByRole('button', { name: '✨ Ask the AI for its nutrients' }).click();
  await pg.waitForFunction(() => /^\d+$/.test(document.querySelector('[aria-label^="Schnitzel: score"]')?.textContent?.trim() || ''), null, { timeout: 5000 }).catch(() => {});
  const asked = calls.filter((c) => c.task === 'describe');
  check(`one light call, about this food and its numbers (${asked.map((c) => c.text).join(' | ')})`, asked.length === 1 && /^Schnitzel — per 100 g: 280 kcal, protein 18 g/.test(asked[0].text));
  const s1 = (await chip('Schnitzel').innerText()).trim();
  // red meat: protein capped at 2; energy 3 + satFat 3 + salt 4 = 10 bad − 2 = 8 → C · 6.43 g/100 kcal → 33.2 + 17.5 + 20 (12:30) = 70.7
  check(`now scored: 71 (${s1})`, s1 === '71');
  await pg.waitForTimeout(400);
  const sch = (await st()).foods.find((f) => f.id === SCH.id);
  check(`kept on the food, so it's never asked again (${JSON.stringify(sch.nutri)})`, sch.nutri && sch.nutri.redMeat === true && sch.nutri.satFat === 4);
  await sheet.screenshot({ path: OUT + 'foodscore-after.png' });

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
