// Experiments ask each morning (PLAN 189; owner, 3 Nov: "It should follow up every morning on last days experiment- if i did
// it or not. If not it should skip that day from experiment. Like i cant guarantee I'll do 14 days w no phone at night").
// "No phone at night", 14 days from Sat 17 Oct, the 17th–19th said done; Wed 21 Oct 08:30. For you asks about yesterday;
// "Didn't" leaves the day out — the experiment now runs to Sat 31 Oct — and Undo puts it back; the strip says the day and
// how many left out; Insights → Training shows its days as squares, a tap on one changes it. Controls: at 02:00 nothing is
// asked; an experiment stopped early is never asked about. 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const NOW = new Date('2026-10-21T08:30:00').getTime(), KEY = 'healthos.v1:u-test';
const XS = [
  { id: 'p', name: 'No phone at night', how: 'Phone out of the bedroom from 22:00', days: 14, measure: 'sleep', start: '2026-10-17', did: { '2026-10-17': true, '2026-10-18': true, '2026-10-19': true } },
  { id: 'e', name: 'Magnesium at 21:00', how: '300 mg', days: 14, measure: 'sleep', start: '2026-10-12', ended: '2026-10-18' },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-21T02:00:00').getTime() });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, x]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.ai = { ...(s.ai || {}), experiments: x }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, XS]);
  const did = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.find((x) => x.id === 'p').did, KEY);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  check('control: 02:00 — not asked yet', !(await forYou(pg, 'xpdid')) && await pg.locator('.xpdid').count() === 0);

  await pg.clock.setFixedTime(NOW); await pg.reload(); await pg.waitForSelector('#feel');
  const found = await forYou(pg, 'xpdid:p');
  const card = pg.locator('.fy-item[data-current] .xpdid'), t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`08:30: For you asks about yesterday (${t.slice(0, 160)})`, found && /^EXPERIMENT · 4 OF 14 DAYS No phone at night Phone out of the bedroom from 22:00 Yesterday — did you\? Did it Didn't/i.test(t) && /Now to Fri 30 Oct/.test(t));
  check('control: the one stopped early is never asked about', await pg.locator('.fy-item[data-key="xpdid:e"] > *').count() === 0);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card.screenshot({ path: OUT + 'xpdid.png' });

  await card.getByRole('button', { name: "Didn't" }).click(); await pg.waitForTimeout(300);
  const toast = (await pg.locator('.toast').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`"Didn't": yesterday left out, the end a day later, and Undo offered (${toast} · ${JSON.stringify(await did())})`, (await did())['2026-10-20'] === false && /Yesterday left out — No phone at night now runs to Sat 31 Oct/.test(toast));
  check('…and the question has gone', await pg.locator('.xpdid').count() === 0);
  await pg.locator('.toast button', { hasText: 'Undo' }).click(); await pg.waitForTimeout(300);
  check(`Undo: the answer put back as it was, the question back (${JSON.stringify(await did())})`, !('2026-10-20' in (await did())) && await pg.locator('.xpdid').count() === 1);
  await pg.locator('.xpdid').getByRole('button', { name: "Didn't" }).click(); await pg.waitForTimeout(300);

  // the strip
  await forYou(pg, 'experiment');
  const strip = (await pg.locator('.xp-strip li').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the strip: its day and how many left out (${strip})`, /No phone at night day 4 of 14 · 1 left out — today: phone out of the bedroom from 22:00/.test(strip));

  // Insights → Training: the squares
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('#experiments');
  const sq = pg.locator('#experiments .xp-days').first(), cls = await sq.locator('.xp-sq').evaluateAll((xs) => xs.map((x) => x.className.replace('xp-sq ', '')));
  check(`its days as squares: 3 done, yesterday left out, 11 to come (${cls.join(',')})`, cls.length === 15 && cls.slice(0, 3).every((c) => c === 'done') && cls[3] === 'out' && cls.slice(4).every((c) => c === 'tocome'));
  await sq.locator('.xp-sq').nth(3).click(); await pg.waitForTimeout(300);
  check(`a tap on the left-out day: done after all, the end back to Fri 30 Oct (${JSON.stringify(await did())}, ${await sq.locator('.xp-sq').count()} squares)`, (await did())['2026-10-20'] === true && await sq.locator('.xp-sq').count() === 14);
  const stopped = await pg.locator('#experiments .xp-days').nth(1).locator('.xp-sq').evaluateAll((xs) => xs.map((x) => x.className.replace('xp-sq ', '').replace(' unsaid', '')));
  check(`the one stopped on the 18th: its 6 days, then none (${stopped.join(',')})`, stopped.slice(0, 6).every((c) => c === 'done') && stopped.slice(6).every((c) => c === 'stopped'));
  await pg.locator('#experiments').screenshot({ path: OUT + 'xpdid-days.png' });
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
