// Stuck on "bite", and "Not this" (owner, 20 Oct: "today i logged 1 bite of schnitzel, now i cant put 1 full piece of
// schnitzel, i try to log, it comes back to the schnitzel but measured in bite, and cant change..can we add a button that
// says not this, then the app retries the search but removing that option"). His own AI-made Schnitzel knows a bite.
// "1 full piece of schnitzel" → a schnitzel in pieces (not full-fat yoghurt + a bite), his own one tap away. Not this →
// his own, saying it's counted in bites. Not this again → nothing else here knows it → the AI, once → logged in pieces.
// A food with one unit: the amount opens grams, so it can always be changed.
const { chromium, APP, OUT, handle, seed } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';
const SCH = { id: 'custom:ai-sch', name: 'Schnitzel', per100: { kcal: 280, p: 18, c: 14, f: 17 }, units: [{ name: 'bite', g: 25 }], servingG: 25, source: 'ai', aka: '1 bite of schnitzel' };
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
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: { items: [{ kind: 'food', name: 'Schnitzel, breaded pork', amount: '1 piece', per100: { kcal: 270, p: 19, c: 13, f: 16 }, unit: { name: 'piece', g: 160 }, count: 1, confidence: 'medium', note: 'a full home-made piece' }], dropped: [] }, usage: null, costUsd: 0.01, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await seed(pg, APP + '#log', ([k, sch]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.foods = [...(s.foods || []).filter((f) => f.id !== sch.id), sch];
    s.entries = [...(s.entries || []), { id: 'bite', kind: 'food', at: Date.now() - 3 * 3600e3, foodId: sch.id, name: sch.name, grams: 25, macros: { kcal: 70, p: 4.5, c: 3.5, f: 4.3 }, count: 1, unit: 'bite' }];
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, SCH]);
  await pg.waitForSelector('[aria-label="Type what you ate"]');
  const typeIt = async (t) => { await pg.getByLabel('Type what you ate').fill(t); await pg.getByRole('button', { name: 'Add', exact: true }).click(); await pg.waitForTimeout(250); };
  const lines = () => pg.locator('.basket .bline').allInnerTexts();

  await typeIt('1 full piece of schnitzel');
  let ls = await lines();
  check(`"1 full piece of schnitzel" → one line, a schnitzel in pieces (${ls.map((l) => l.replace(/\s+/g, ' ')).join(' | ')})`, ls.length === 1 && /Rántott hús/.test(ls[0]) && /1 piece/.test(ls[0]) && !/yoghurt|bite/i.test(ls[0]));
  check('…your own Schnitzel one tap away', await pg.locator('.basket .alts').getByRole('button', { name: 'Schnitzel', exact: true }).count() === 1);
  await pg.locator('.basket').screenshot({ path: OUT + 'notthis-1.png' });

  await pg.locator('.basket').getByRole('button', { name: 'Not this' }).click(); await pg.waitForTimeout(200);
  ls = await lines();
  check(`Not this → your own Schnitzel, saying it's counted in bites (${ls.map((l) => l.replace(/\s+/g, ' ')).join(' | ')})`, ls.length === 1 && /^Schnitzel/.test(ls[0]) && /Schnitzel is counted in bites, not pieces/.test(ls[0]) && !/Rántott/.test(ls[0]));
  check('…no AI call yet', !calls.some((c) => c.task === 'describe'));
  await pg.locator('.basket').screenshot({ path: OUT + 'notthis-2.png' });

  await pg.locator('.basket').getByRole('button', { name: 'Not this' }).click();
  await pg.waitForFunction(() => /breaded pork/.test(document.querySelector('.basket')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ls = await lines();
  const asked = calls.filter((c) => c.task === 'describe');
  check(`Not this again: nothing else here knows it → the AI, once, about what you typed (${asked.map((c) => c.text).join(', ')})`, asked.length === 1 && asked[0].text === '1 full piece of schnitzel');
  check(`…its answer replaces the line, in pieces (${ls.map((l) => l.replace(/\s+/g, ' ')).join(' | ')})`, ls.length === 1 && /Schnitzel, breaded pork/.test(ls[0]) && /1 piece/.test(ls[0]) && /AI estimate/.test(ls[0]));
  await pg.getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(300);
  const last = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries.filter((e) => e.kind === 'food').at(-1), KEY);
  check(`logged as 1 piece, 160 g (${last?.name}, ${last?.count} ${last?.unit}, ${last?.grams} g)`, last?.name === 'Schnitzel, breaded pork' && last.unit === 'piece' && last.grams === 160);

  // A food with one unit: the amount isn't a dead button any more — it opens grams.
  await typeIt('1 bite of schnitzel');
  ls = await lines();
  check(`"1 bite of schnitzel" is still yours, in bites (${ls.join(' | ').replace(/\s+/g, ' ')})`, ls.length === 1 && /^Schnitzel/.test(ls[0]) && /1 bite/.test(ls[0]) && !/counted in/.test(ls[0]));
  const amt = pg.locator('.basket .bline .amt');
  check('its amount can be tapped', !(await amt.isDisabled()));
  await amt.click(); await pg.waitForTimeout(150);
  check('…and opens grams', await pg.getByLabel('Grams (exact)').count() === 1);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
