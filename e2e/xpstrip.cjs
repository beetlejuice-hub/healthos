// Experiments easier to find (PLAN 160; owner, 21 Oct: "make experiments easier to find … a one-line running experiments
// strip on Today — start on these"). Three: one running (day 9 of 21), one done with its verdict, one stopped early. Today
// shows a line each — the running one with today's reminder, the done one with its result; a tap opens Insights →
// Training with the experiments in view; once opened, the done one's line goes. Nothing at all with no experiments.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const D = 86_400_000, NOW = new Date('2026-10-21T09:00:00').getTime(), KEY = 'healthos.v1:u-test';
const XS = [
  { id: 'r', name: 'No caffeine after 14:00', how: 'Last coffee by 14:00', days: 21, measure: 'energy', start: '2026-10-13' },
  { id: 'd', name: 'Protein at breakfast', how: '40 g before 10:00', days: 14, measure: 'energy', start: '2026-10-02',
    verdict: { at: NOW - 3 * 3_600_000, state: 'better', text: 'Energy went up 1.2 — clear.', next: 'Keep it', found: [] } },
  { id: 'e', name: 'Magnesium at 21:00', how: '300 mg', days: 14, measure: 'sleep', start: '2026-10-12', ended: '2026-10-18' },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const seed = (xs) => pg.evaluate(([k, x]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.ai = { ...(s.ai || {}), experiments: x }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, xs]);
  await seed([]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  check('no experiments: no strip', await pg.locator('.xp-strip').count() === 0);
  await seed(XS);
  await pg.reload(); await forYou(pg, 'experiment'); await pg.waitForSelector('.xp-strip', { timeout: 5000 }).catch(() => {});
  const lines = await pg.locator('.xp-strip li').evaluateAll((ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').replace(/ ›$/, '')));
  check(`a line each: running with today's reminder, done with its result, stopped early says so (${lines.join(' | ')})`, lines.length === 3
    && lines[0] === '🧪 No caffeine after 14:00 day 9 of 21 — today: last coffee by 14:00' && lines[1] === '🧪 Protein at breakfast worked for you · see why' && lines[2] === '🧪 Magnesium at 21:00 ended early — too few days to tell');
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('.xp-strip').screenshot({ path: OUT + 'xpstrip.png' });
  // a tap opens the experiments
  await pg.locator('.xp-strip li').nth(1).locator('button').click();
  await pg.waitForTimeout(900);
  const where = await pg.evaluate(() => location.hash), box = await pg.locator('#experiments').boundingBox().catch(() => null);
  check(`a tap opens Insights → Training with the experiments in view (${where}, top ${box && Math.round(box.y)})`, where === '#insights/training' && !!box && box.y >= -5 && box.y < 844);
  check('…with the verdict there', /worked for you\s*Energy went up 1\.2/.test(await pg.locator('#experiments').innerText()));
  // back on Today: the done one has been seen, its line is gone; the others stay
  await pg.goto(APP + '#today'); await pg.waitForSelector('.xp-strip');
  const after = await pg.locator('.xp-strip li b').allInnerTexts();
  check(`opened: the done one's line goes, the rest stay (${after.join(', ')})`, after.join('|') === 'No caffeine after 14:00|Magnesium at 21:00');
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
