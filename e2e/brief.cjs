// Today's brief and Sleep A (owner, 13 Nov: "A A A … make theese better and smarter"; canvas
// https://claude.ai/artifact/HLqpvYqyrUoW3hwV8n9cUC). On 60 days of the sample with a band that fits it, 21 Oct:
// 08:00 — the brief leads Today with last night, HRV against the usual and readiness, then the things to do now; Took all
// keeps its row, as taken, the same height (a vanishing row moved a tap onto Start); the check-in row scrolls to the
// check-in. 22:30 — no night line, the bedtime instead. The reading cards fold under "More about today". Sleep: the night
// in one line, its picture before the numbers, last night against your usual row by row, tonight's bedtime; the nights
// over time folded, and a fold left open stays open.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const { sampleBand, routeBand } = require('./tools/sampleband.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(time) {
    const now = new Date(`2026-10-21T${time}:00`).getTime();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.clock.install({ time: now });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
    const s = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
    await routeBand(ctx, sampleBand(s.entries || [], s.workouts || [], now), now);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('nav.tabs');
    await pg.waitForFunction(() => /Slept|Bed by/.test(document.querySelector('.brief')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    return { ctx, pg };
  }

  let { ctx, pg } = await open('08:00');
  const brief = pg.getByRole('region', { name: 'Your brief' });
  const say = (await brief.locator('.brief-say').innerText().catch(() => '')).trim();
  check(`08:00: the brief leads Today (${await pg.evaluate(() => document.querySelector('.today2 > section, .today2 > .card')?.getAttribute('aria-label'))})`, await pg.evaluate(() => document.querySelector('.today2 .brief') === document.querySelector('.today2 > .card, .today2 > section')));
  check(`…last night, HRV against your usual, readiness (${say})`, /^Slept \d+ h \d\d, score \d+\. HRV \d+, (your usual|(above|below) your usual \d+)\. Readiness \d+: [a-z ]+\.$/.test(say));
  const rows = await brief.locator('.brief-row').evaluateAll((els) => els.map((e) => e.dataset.row));
  check(`…then what to do now (${rows.join(', ')})`, rows.includes('feel') && rows.includes('workout') && rows[0] === (rows.includes('stack') ? 'stack' : 'feel'));
  await brief.screenshot({ path: OUT + 'brief-0800.png' });
  if (rows.includes('stack')) {
    const r = brief.locator('.brief-row[data-row="stack"]'), h0 = (await r.boundingBox()).height, y0 = (await brief.locator('.brief-row[data-row="workout"]').boundingBox()).y;
    await r.getByRole('button', { name: /Took/ }).click(); await pg.waitForTimeout(250);
    const h1 = (await r.boundingBox()).height, y1 = (await brief.locator('.brief-row[data-row="workout"]').boundingBox()).y;
    check(`Took all: the row stays, taken; nothing under it moves (${Math.round(h0)} → ${Math.round(h1)} px, Start ${Math.round(y0)} → ${Math.round(y1)})`, /✓ Taken/.test(await r.innerText()) && Math.abs(y1 - y0) <= 2);
  }
  await brief.locator('.brief-row[data-row="feel"]').getByRole('button', { name: 'Check in' }).click(); await pg.waitForTimeout(900);
  const fy = await pg.locator('#feel').evaluate((el) => el.getBoundingClientRect().top);
  check(`Check in → the check-in, on screen (top ${Math.round(fy)} px)`, fy > -10 && fy < 700);
  check('the reading cards are folded', await pg.locator('details.t2-more').getAttribute('open') === null && !(await pg.getByRole('region', { name: 'Why today' }).isVisible().catch(() => false)));
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // Sleep A
  await pg.goto(APP + '#insights/sleep'); await pg.waitForSelector('.sl-head', { timeout: 15000 }).catch(() => {});
  const head = (await pg.locator('.sl-head').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`Sleep: the night in one line (${head})`, /^\d+ [a-z]+ · \d+ h \d\d asleep, in bed \d\d:\d\d/.test(head));
  const order = await pg.evaluate(() => { const c = document.querySelector('.sl-chart'), n = document.querySelector('.sl-nums'); return c && n ? c.getBoundingClientRect().top < n.getBoundingClientRect().top : null; });
  check('…its picture before the numbers on a phone', order === true);
  const rr = await pg.locator('.sl-rows tr').evaluateAll((els) => els.map((e) => `${e.dataset.row}:${e.dataset.tone}`));
  check(`…last night against your usual, row by row (${rr.join(' ')})`, rr.length >= 5 && rr.some((x) => x.startsWith('asleep:')) && rr.some((x) => x.startsWith('bed:')));
  const tn = (await pg.getByRole('region', { name: 'Tonight' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`…tonight (${tn})`, /Your best nights started by \d\d:\d\d\./.test(tn));
  check('…the nights over time folded', await pg.locator('details.sl-over').getAttribute('open') === null && !(await pg.locator('.sl-minis').isVisible().catch(() => false)));
  await pg.locator('details.sl-over > summary').click(); await pg.waitForTimeout(200);
  check('opened: the last nights are there', await pg.locator('.sl-minis').isVisible());
  await pg.reload(); await pg.waitForSelector('.sl-head', { timeout: 15000 }).catch(() => {});
  check('…and open after a reload', await pg.locator('details.sl-over').getAttribute('open') !== null);
  check(`Sleep fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('.sl-b').screenshot({ path: OUT + 'sleep-a.png' }).catch(() => {});
  await ctx.close();

  ({ ctx, pg } = await open('22:30'));
  const b2 = pg.getByRole('region', { name: 'Your brief' });
  check(`22:30: no night line, the bedtime instead (${(await b2.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)})`, await b2.locator('.brief-say').count() === 0 && /Bed by \d\d:\d\d keeps your week regular\.|caffeine will still be in you/.test(await b2.innerText().catch(() => '')));
  await ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
