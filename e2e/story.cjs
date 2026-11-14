// The Sunday story (owner, 14 Nov, item 12; canvas A). Sunday 25 Oct 19:00 on 60 days of the sample with its band: the
// brief offers "Your week"; it opens full screen, a card at a time (the week first, one thing to try last); a tap on the
// right goes on, on the left back; "Start it" starts the experiment; × closes. #today/story (the push) opens it straight.
// Tuesday: no story.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const { sampleBand, routeBand } = require('./tools/sampleband.cjs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(iso, hash = '#today') {
    const now = new Date(iso).getTime();
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
    await pg.goto(APP + hash); await pg.reload(); await pg.waitForSelector('nav.tabs'); await pg.waitForTimeout(2500);
    return { ctx, pg };
  }
  let { ctx, pg } = await open('2026-10-25T19:00:00');
  const row = pg.locator('.brief-row[data-row="story"]');
  check('Sunday 19:00: the brief offers "Your week"', await row.count() === 1);
  await row.getByRole('button', { name: 'Open' }).click(); await pg.waitForTimeout(300);
  const story = pg.getByRole('dialog', { name: 'Your week' });
  const first = await story.getAttribute('data-card').catch(() => null);
  const head = (await story.locator('h2').innerText().catch(() => '')).trim();
  check(`full screen, the week first (${first}: ${head})`, first === 'week' && head.length > 0);
  await story.screenshot({ path: OUT + 'story-1.png' }).catch(() => {});
  const keys = [first];
  for (let i = 0; i < 8; i++) { if (/tap to close/.test(await story.locator('.story-foot').innerText())) break; const box = await story.boundingBox(); await pg.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5); await pg.waitForTimeout(150); const k = await story.getAttribute('data-card').catch(() => null); if (!k || k === keys.at(-1)) break; keys.push(k); }
  check(`a tap on the right goes on, card by card (${keys.join(' → ')})`, keys.length >= 4 && keys[0] === 'week' && new Set(keys).size === keys.length);
  { const box = await story.boundingBox(); await pg.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5); await pg.waitForTimeout(150); }
  check('…on the left, back', await story.getAttribute('data-card') === keys.at(-2));
  if (keys.at(-1) === 'try') {
    const right = async () => { const bx = await story.boundingBox(); await pg.mouse.click(bx.x + bx.width * 0.85, bx.y + bx.height * 0.5); await pg.waitForTimeout(150); };
    await right(); await story.screenshot({ path: OUT + 'story-try.png' }).catch(() => {});
    await right();
    check('…and on the last, a tap on the right closes it', await pg.getByRole('dialog', { name: 'Your week' }).count() === 0);
    await pg.locator('.brief-row[data-row="story"]').getByRole('button', { name: 'Open' }).click(); await pg.waitForTimeout(200);
    for (let k = 1; k < keys.length; k++) { const bx = await story.boundingBox(); await pg.mouse.click(bx.x + bx.width * 0.85, bx.y + bx.height * 0.5); await pg.waitForTimeout(120); }
    await story.getByRole('button', { name: 'Start it' }).click(); await pg.waitForTimeout(300);
    const xs = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')).ai.experiments.map((x) => x.name));
    check(`"Start it" starts the experiment (${xs.join(', ')})`, xs.some((n) => /In bed by|No drinks/.test(n)) && /Started/.test(await story.innerText()));
  } else check(`the last card is the thing to try (${keys.at(-1)})`, false);
  await story.getByRole('button', { name: 'Close' }).click(); await pg.waitForTimeout(200);
  check('× closes it', await pg.getByRole('dialog', { name: 'Your week' }).count() === 0);
  await ctx.close();
  ({ ctx, pg } = await open('2026-10-25T19:05:00', '#today/story'));
  check('#today/story (the Sunday push) opens it straight', await pg.getByRole('dialog', { name: 'Your week' }).count() === 1);
  await ctx.close();
  ({ ctx, pg } = await open('2026-10-27T09:00:00'));
  check('Tuesday: no story', await pg.locator('.brief-row[data-row="story"]').count() === 0);
  await ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
