// Today: "A pattern, with today on it" (owner, 28 Oct: "Now the today page feels too empty" · "I liked charts and
// connecting dots, trying to find patterns in a lot of data points"; then "Today's pattern card"). 60 planted days through
// the app's own pattern finder (no fakes): caffeine after 14:00 each afternoon, and the next morning's sleep rating
// 8 − mg/50 (± a little). Thu 29 Oct 17:00, 120 mg after 14:00 so far. Today shows the card after For you: the link's
// title, a dot for each day, the line, today's yellow ring "today, so far" at 120, the link in words with "clear", and
// "Today: 120 mg so far — on the line, that goes with your sleep rating 5.6 the next day". A tap on a dot names its day.
// Control: an account with no link found has no card. 390 and 320.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const day = (k) => { const x = new Date('2026-10-29T12:00:00'); x.setDate(x.getDate() - k); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function world(planted) {
  const entries = [];
  for (let k = 62; k >= 1; k--) {
    const d = day(k), mg = (k * 37) % 200, next = day(k - 1);
    entries.push({ id: `b${k}`, kind: 'food', at: T(d, '08:30'), name: 'Oats', grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } });
    if (mg > 0) entries.push({ id: `c${k}`, kind: 'drink', at: T(d, '16:00'), name: 'Coffee', ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 });
    const rating = planted ? Math.max(1, Math.min(10, Math.round(8 - mg / 50 + ((k % 3) - 1) * 0.4))) : 6 + (k % 3) - 1;
    entries.push({ id: `s${k}`, kind: 'sleep', at: T(next, '07:30'), rating });
  }
  entries.push({ id: 'b0', kind: 'food', at: T(day(0), '08:30'), name: 'Oats', grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } });
  entries.push({ id: 'c0', kind: 'drink', at: T(day(0), '15:00'), name: 'Coffee', ml: 250, caffeineMg: 120, alcoholG: 0, kcal: 2 });
  return entries;
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, entries) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: T(day(0), '17:00') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, entries]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = entries; s.workouts = []; s.ai = { ...(s.ai || {}), watches: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, entries]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    return { ctx, pg };
  }
  for (const width of [390, 320]) {
    const { ctx, pg } = await open(width, world(true));
    const card = pg.locator('section.todaypattern');
    await card.waitFor({ timeout: 8000 }).catch(() => {});
    check(`${width}: the card is on Today, after For you`, await card.count() === 1 && await pg.evaluate(() => { const f = document.querySelector('section.fy'), t = document.querySelector('section.todaypattern'); return !!(f && t && (f.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)); }));
    const txt = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`${width}: the link, clear, today in words (${txt.slice(0, 300)})`, /Caffeine( after 14:00)? → your sleep rating the next day/.test(txt) && /CLEAR/i.test(txt) && /Today: 120 mg so far — on the line, that goes with your sleep rating 5\.\d the next day\./.test(txt));
    const dots = await card.locator('svg circle').count();
    check(`${width}: a dot a day, and today's ring (${dots} circles)`, dots >= 55 && await card.locator('.tp-today circle').count() === 1 && /today, so far/.test(await card.locator('svg').textContent()));
    const ringX = await card.locator('.tp-today circle').getAttribute('cx'), lineY = await card.locator('.tp-today circle').getAttribute('cy');
    check(`${width}: the ring sits at today's 120 mg, on the line (cx ${ringX}, cy ${lineY})`, +ringX > 0 && +lineY > 0);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100);
    const box = await card.locator('svg').boundingBox(), first = await card.locator('svg circle').first().boundingBox();
    await pg.mouse.click(first.x + first.width / 2, first.y + first.height / 2); await pg.waitForTimeout(100);
    const hit = await card.locator('.tp-hit').innerText();
    check(`${width}: a tap on a dot names its day (${hit})`, /^\w{3} \d{1,2} \w{3}: \d+ mg → your sleep rating \d+ the next day$/.test(hit) && box.width > 0);
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
    check(`${width}: fits (${sw} px)`, sw <= width);
    await card.screenshot({ path: OUT + `todaypattern-${width}.png` });
    await ctx.close();
  }
  // control: nothing found → no card
  const { ctx, pg } = await open(390, world(false));
  await pg.waitForTimeout(800);
  check('control: no link in the data → no card', await pg.locator('section.todaypattern').count() === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
