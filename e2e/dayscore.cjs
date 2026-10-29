// Your food as whole days, out of 100 (owner, 21 Oct: "food notrution score can be bult too" … "do whatever"). Two days
// worked out by hand in src/lib/dayscore.test.ts: the day before yesterday hits everything (100), yesterday is pizza, three
// beers and late chips (32). Today's Food card says yesterday's score in its folded line and, open, what cost it, with a
// way to the breakdown; Insights → Intake draws a bar a day and, for the day tapped, its parts; the AI is told the same.
const { chromium, APP, OUT, handle, openCard } = require('./harness.cjs');

const NOW = new Date('2026-10-21T09:00:00').getTime(), KEY = 'healthos.v1:u-test';
const D1 = '2026-10-19', D2 = '2026-10-20';
const food = (id, kcal, p, c, f, nutri) => ({ id, name: id[0].toUpperCase() + id.slice(1), per100: { kcal, p, c, f }, source: 'custom', ...(nutri ? { nutri } : {}) });
const FOODS = [
  food('porridge', 380, 13, 68, 7, { sugar: 1, satFat: 1, fiber: 10, salt: 0 }), food('whey', 400, 80, 8, 6, { sugar: 4, satFat: 2, fiber: 0, salt: 0.5 }),
  food('chicken', 165, 31, 0, 3.6, { sugar: 0, satFat: 1, fiber: 0, salt: 0.2 }), food('rice', 130, 2.7, 28, 0.3, { sugar: 0.1, satFat: 0.1, fiber: 0.4, salt: 0 }),
  food('veg', 35, 2.5, 6, 0.3, { sugar: 2, satFat: 0, fiber: 3, salt: 0.1, fvl: 100 }), food('apple', 52, 0.3, 14, 0.2, { sugar: 10, satFat: 0, fiber: 2.4, salt: 0, fvl: 100 }),
  food('salmon', 200, 22, 0, 12, { sugar: 0, satFat: 2.5, fiber: 0, salt: 0.2 }), food('potato', 77, 2, 17, 0.1, { sugar: 0.9, satFat: 0, fiber: 1.8, salt: 0.01 }),
  food('pizza', 250, 10, 31, 9, { sugar: 3.5, satFat: 4.5, fiber: 2, salt: 1.3 }), food('chips', 540, 6, 50, 35, { sugar: 1, satFat: 3, fiber: 4, salt: 1.5 }),
];
let n = 0;
const eat = (day, id, g, hm) => { const f = FOODS.find((x) => x.id === id), k = g / 100; return { id: 'e' + n++, kind: 'food', at: new Date(`${day}T${hm}:00`).getTime(), foodId: id, name: f.name, grams: g, macros: { kcal: f.per100.kcal * k, p: f.per100.p * k, c: f.per100.c * k, f: f.per100.f * k } }; };
const beer = (day, hm) => ({ id: 'b' + n++, kind: 'drink', at: new Date(`${day}T${hm}:00`).getTime(), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 });
const ENTRIES = [
  eat(D1, 'porridge', 100, '08:00'), eat(D1, 'whey', 40, '08:00'), eat(D1, 'chicken', 200, '13:00'), eat(D1, 'rice', 250, '13:00'), eat(D1, 'veg', 300, '13:00'),
  eat(D1, 'apple', 200, '16:00'), eat(D1, 'salmon', 150, '19:00'), eat(D1, 'potato', 300, '19:00'),
  eat(D2, 'pizza', 400, '13:00'), beer(D2, '21:30'), beer(D2, '21:45'), beer(D2, '22:00'), eat(D2, 'chips', 100, '22:30'),
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, es, fs]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.foods = fs; s.workouts = []; s.goals = { ...(s.goals || {}), kcal: 2000, p: 150 }; s.settings = { ...(s.settings || {}), bedMinute: 23 * 60 }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, ENTRIES, FOODS]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  await openCard(pg, 'fuel'); // Today A (28 Oct): the Food card opens from its tile; its head keeps the one-line read
  const fold = await pg.locator('#fuel .fold-head').innerText().catch(() => '');
  check(`Today's Food card, its head: yesterday's score (${fold.split('\n').slice(0, 2).join(' · ')})`, /yesterday 32\/100/.test(fold));
  const line = await pg.locator('.fuel-score').innerText().catch(() => '');
  check(`…open: what it was and what cost it (${line})`, line === "Yesterday's food 32/100 · off goal — protein low (46 g of 150) ›");
  await pg.locator('.fuel-score').screenshot({ path: OUT + 'dayscore-today.png' }).catch(() => {});
  await pg.locator('.fuel-score').click(); await pg.waitForTimeout(400);
  check(`a tap opens Insights → Intake (${await pg.evaluate(() => location.hash)})`, await pg.evaluate(() => location.hash) === '#insights/intake');
  await pg.waitForSelector('.gl-foodscore', { timeout: 10000 }).catch(() => {});
  const panel = pg.locator('.gl-foodscore');
  const bars = await panel.locator('.fs-day').evaluateAll((g) => g.map((x) => [x.dataset.day, +x.dataset.score]));
  check(`a bar a day that was logged in full (${JSON.stringify(bars)})`, JSON.stringify(bars) === JSON.stringify([[D1, 100], [D2, 32]]));
  const ans = await panel.locator('.gp-ans').innerText().catch(() => '');
  check(`…the average over them (${ans})`, /^Average 66\/100 over 2 days logged in full\.$/.test(ans));
  const parts = () => panel.locator('.sl-sp').evaluateAll((els) => els.map((e) => [e.dataset.part, +e.dataset.got]));
  check(`yesterday's parts, as worked out by hand (${JSON.stringify(await parts())})`, JSON.stringify(await parts()) === JSON.stringify([['protein', 0], ['spread', 3], ['kcal', 15], ['fiber', 6], ['plants', 0], ['limits', 7.7], ['late', 0], ['alcohol', 0]]));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  // …and uses it: the panel the width of the page, not one of its 12 columns (it was 40 px wide)
  const pw = await panel.evaluate((e) => Math.round(e.getBoundingClientRect().width));
  check(`the panel spans the phone's width (${pw} px)`, pw >= 330);
  await panel.screenshot({ path: OUT + 'dayscore-intake.png' });
  await panel.locator(`.fs-day[data-day="${D1}"]`).click(); await pg.waitForTimeout(150);
  check(`tapping the day before: its 100, every part full (${await panel.locator('.fs-sel').getAttribute('data-day')})`, (await panel.locator('.fs-sel').getAttribute('data-day')) === D1 && (await parts()).every(([, got], i) => got === [25, 10, 15, 15, 15, 10, 5, 5][i]));
  // the AI is told yesterday's score
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
  await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
  const seen = await pg.locator('.ctx').innerText().catch(() => '');
  check('the AI is told yesterday\'s food score with its parts', /- Food score yesterday \(out of 100\): 32\/100 \(off goal\) — Protein 0\/25 \(46 g of 150\); Protein spread 3\/10/.test(seen));
  // reform I6 (owner, 29 Oct: Yes to "Fibre, veg and sugar aren't scored yet: most foods you log don't carry them"): a day
  // mostly of a home dish with no nutrients says what's left out in one plain line, no percentages
  const HOME = { id: 'homemade', name: 'Homemade stew', per100: { kcal: 200, p: 8, c: 20, f: 9 }, source: 'custom' };
  const home = (g, hm) => ({ id: 'h' + n++, kind: 'food', at: new Date(`${D2}T${hm}:00`).getTime(), foodId: 'homemade', name: HOME.name, grams: g, macros: { kcal: 2 * g, p: 0.08 * g, c: 0.2 * g, f: 0.09 * g } });
  await pg.evaluate(([k, es, fs]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries = es; s.foods = fs; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, [...ENTRIES.filter((e) => !e.at || new Date(e.at).getDate() !== 20), home(500, '13:00'), home(400, '19:00'), eat(D2, 'chicken', 200, '19:00')], [...FOODS, HOME]]);
  await pg.goto(APP + '#insights/intake'); await pg.reload(); await pg.waitForSelector('.gl-foodscore', { timeout: 10000 }).catch(() => {});
  await pg.locator(`.gl-foodscore .fs-day[data-day="${D2}"]`).click().catch(() => {}); await pg.waitForTimeout(200);
  const note = await pg.locator('.gl-foodscore .sl-note').innerText().catch(() => '');
  check(`a day mostly without nutrients: one plain line (${note})`, note === "Fibre, veg, salt, fat and sugar aren't scored yet: too few of the foods you logged carry them.");
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
