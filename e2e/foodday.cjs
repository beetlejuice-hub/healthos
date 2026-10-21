// What I ate (PLAN 128; owner, 20 Oct: "a simple window showing what i ate, the macros summary basically for the day would
// be nice, when clicking on food on today page", "looking back to yesterday too") — and #113: "WHY CANT I REMOVE A FOOD I
// LOGGED…??" (only today's food could be deleted, at the bottom of Log). From Today's Food card: today's meals with the
// day's macros, the same total as the card; × then "Delete?" removes one; ‹ to yesterday, delete one there too, change a
// drink's calories; Add food to yesterday opens Log on yesterday. Then the proof it's really gone: a reload, and a second
// phone signing in fresh from the server — neither brings the deleted food back.
const { chromium, APP, OUT, handle, tables, openCard } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-10-16T14:00:00').getTime();
const t = (d, hm) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const food = (id, at, name, kcal, p, more = {}) => ({ id, kind: 'food', at, name, grams: 100, macros: { kcal, p, c: 20, f: 8 }, ...more });
const ENTRIES = [
  food('oats', t('16', '07:40'), 'Oats', 380, 13, { count: 1, unit: 'bowl', grams: 80, foodId: 'basic:oats-zabpehely' }),
  { id: 'cof', kind: 'drink', at: t('16', '07:45'), name: 'Long coffee', ml: 300, caffeineMg: 150, alcoholG: 0, kcal: 4 },
  food('toast', t('16', '12:30'), 'Toast', 180, 6, { count: 2, unit: 'slice', grams: 70, foodId: 'basic:toast-white' }),
  food('pizza', t('15', '20:10'), 'Pizza', 900, 35, { foodId: 'basic:pizza-margherita' }),
  { id: 'beer', kind: 'drink', at: t('15', '21:00'), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const phone = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"off"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    return pg;
  };
  // logged earlier (as if on another phone): on the server, so the app pulls them the way it really gets them
  for (const e of ENTRIES) tables.entries.set(`u-test|${e.id}`, { user_id: 'u-test', id: e.id, kind: e.kind, at: new Date(e.at).toISOString(), data: e, deleted: false, updated_at: '2026-09-29T11:00:00.000Z' });
  const pg = await phone();
  await pg.goto(APP + '#today'); await pg.waitForSelector('#fuel'); await openCard(pg, 'fuel');
  await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').entries || []).some((e) => e.id === 'pizza'), KEY, { timeout: 8000 });
  const ids = async (p = pg) => (await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').entries || [], KEY)).map((e) => e.id);
  const sheet = pg.getByRole('dialog', { name: 'What I ate' });
  const meals = async () => (await sheet.locator('.fd-meal').allInnerTexts()).map((m) => m.replace(/\s+/g, ' '));

  const open = pg.locator('#fuel .fuel-open');
  check(`Today's Food card: "What I ate" with today's count (${await open.innerText()})`, /What I ate · 3 items/.test(await open.innerText()));
  await open.click(); await sheet.waitFor();
  const kc = async () => (await sheet.locator('.fd-kcal b').innerText()).replace(/,/g, '');
  check(`opens on today: 564 kcal, the card's total (${await kc()})`, await kc() === '564' && (await sheet.locator('.fd-head b').innerText()) === 'Today');
  const m0 = await meals();
  check(`by meal, what was in each, with its score (${m0.join(' | ')})`, m0.length === 2 && /^BREAKFAST 384 kcal · 65 Oats 07:40 · 1 bowl · 80 g · P 13 g 65 380 × Long coffee 07:45 · 300 ml 4 ×/i.test(m0[0]) && /^LUNCH 180 kcal · 47 Toast 12:30 · 2 slices · 70 g · P 6 g 47 180 ×/i.test(m0[1]));
  // PLAN 139 (owner, 20 Oct: "a score next to the plate, for each item and for in total too … i can click on it and observe whats up")
  await sheet.getByRole('button', { name: 'Toast: score 47 — why' }).click();
  const why = (await sheet.locator('.fd-why').innerText()).replace(/\s+/g, ' ');
  check(`tap a score: its three parts, and why (${why})`, /For your goal 9\/45 3\.3 g protein per 100 kcal Quality 18\/35 Nutri-Score C Timing 20\/20 3 h or more before bed/.test(why));
  await sheet.screenshot({ path: OUT + 'foodday-scores.png' });
  await sheet.getByRole('button', { name: 'Toast: score 47 — why' }).click();
  check('no day after today', await sheet.getByRole('button', { name: 'Day after' }).isDisabled());
  await sheet.screenshot({ path: OUT + 'foodday-today.png' });

  // delete: × asks, the second tap deletes
  await sheet.getByRole('button', { name: 'Delete Toast' }).click();
  check('× asks first — nothing deleted yet', (await ids()).includes('toast') && await sheet.getByRole('button', { name: 'Delete?' }).count() === 1);
  await sheet.getByRole('button', { name: 'Delete?' }).click(); await pg.waitForTimeout(150);
  check(`Delete? removes it; the day's total follows (${await kc()})`, !(await ids()).includes('toast') && await kc() === '384' && !/Toast/.test((await meals()).join()));

  // yesterday: the #113 case — food from an earlier day
  await sheet.getByRole('button', { name: 'Day before' }).click(); await pg.waitForTimeout(100);
  check(`‹ → yesterday's food (${(await meals()).join(' | ')})`, (await sheet.locator('.fd-head b').innerText()) === 'Yesterday' && await kc() === '1110' && /Pizza/.test((await meals()).join()) && /Beer/.test((await meals()).join()));
  check(`yesterday's dinner: pizza 41, beer 10 (alcohol, 2 h before bed), the plate by calories 35 (${(await meals()).join(' | ')})`, /^DINNER 1,110 kcal · 35 Pizza .* 41 900 × Beer .* 10 210 ×/i.test((await meals())[0] ?? ''));
  await sheet.getByRole('button', { name: 'Delete Pizza' }).click(); await sheet.getByRole('button', { name: 'Delete?' }).click(); await pg.waitForTimeout(150);
  check('yesterday\'s pizza deleted', !(await ids()).includes('pizza') && await kc() === '210');
  await sheet.getByRole('button', { name: 'Change Beer' }).click();
  await sheet.getByLabel('kcal').fill('250'); await sheet.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(150);
  check(`tap an item to change its numbers (${await kc()})`, await kc() === '250');
  await sheet.screenshot({ path: OUT + 'foodday-yesterday.png' });
  await sheet.getByRole('button', { name: 'Day before' }).click(); await pg.waitForTimeout(100);
  check('a day with nothing says so', /Nothing logged on/.test(await sheet.innerText()) && await kc() === '0');

  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  check('Escape closes it', await sheet.count() === 0);
  check(`Today's card counts what's left (${await open.innerText()})`, /What I ate · 2 items/.test(await open.innerText()));

  // really gone: a reload, then the server, then a second phone signing in fresh
  await pg.reload(); await pg.waitForSelector('#fuel'); await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(1500);
  check('after a reload: still gone', !(await ids()).includes('toast') && !(await ids()).includes('pizza') && (await ids()).includes('oats'));
  const row = (id) => [...tables.entries.values()].find((r) => r.id === id);
  check(`the server has them as deleted (toast ${row('toast')?.deleted}, pizza ${row('pizza')?.deleted})`, row('toast')?.deleted === true && row('pizza')?.deleted === true);
  const pg2 = await phone();
  await pg2.goto(APP + '#today'); await pg2.waitForSelector('#fuel'); await pg2.waitForLoadState('networkidle'); await pg2.waitForTimeout(1500);
  const two = await pg2.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').entries || [], KEY);
  check(`a second phone, fresh from the server: the deleted ones aren't there, the beer is 250 (${two.filter((e) => ['oats', 'cof', 'toast', 'pizza', 'beer'].includes(e.id)).map((e) => e.id).join(',')})`,
    two.some((e) => e.id === 'oats') && !two.some((e) => e.id === 'toast' || e.id === 'pizza') && two.find((e) => e.id === 'beer')?.kcal === 250);

  // add food to an earlier day: Log opens on that day
  await openCard(pg, 'fuel'); await pg.locator('#fuel .fuel-open').click(); await sheet.getByRole('button', { name: 'Day before' }).click();
  await sheet.getByRole('button', { name: /Add food to yesterday/ }).click(); await pg.waitForTimeout(300);
  check(`"+ Add food to yesterday" opens Log on yesterday (${await pg.locator('.log-for').innerText().catch(() => '—')})`, /#log/.test(pg.url()) && /Logging for yesterday/.test(await pg.locator('.log-for').innerText().catch(() => '')));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
