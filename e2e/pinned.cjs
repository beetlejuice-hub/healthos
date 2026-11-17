// Pin the AI's numbers (PLAN 225; owner, 17 Nov: "4"). A morning read whose server check listed "49" as a number the AI
// wasn't given: opened, that number is dotted (with why on hover), the rest of the text plain, and a line under the read
// says what dotted means; a read with nothing listed has neither. The same in a chat reply.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-11-17T09:30:00').getTime(), KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const seed = (unpinned) => pg.evaluate(([k, now, u]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.ai = { ...(s.ai || {}), digest: { day: '2026-11-17', at: now - 30 * 60_000, greeting: 'Morning — a good night.', items: [{ type: 'pattern', title: 'Your heart overnight', text: 'HRV was 52 ms against a usual 44, and resting heart 49 bpm.' }], ...(u ? { unpinned: u } : {}) }, night: null,
      chat: [{ role: 'user', text: 'how was my HRV?', at: now - 60_000 }, { role: 'assistant', text: 'HRV was **52 ms**, resting heart 49 bpm.', at: now - 30_000, ...(u ? { unpinned: u } : {}) }] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW, unpinned]);
  const read = pg.getByRole('region', { name: 'Morning read' });
  const openRead = async () => { await pg.goto(APP + '#today'); await pg.reload(); await read.waitFor({ timeout: 8000 }).catch(() => {}); await read.locator('.mr-head').click().catch(() => {}); await pg.waitForTimeout(300); };

  await seed(null); await openRead();
  check('nothing listed: nothing dotted, no note', await read.count() === 1 && await read.locator('.unpin').count() === 0);
  await seed(['49']); await openRead();
  const dotted = await read.locator('.unpin').allInnerTexts();
  check(`"49" dotted, 52 and 44 not (${dotted.join(', ')})`, dotted.includes('49') && !dotted.includes('52') && !dotted.includes('44'));
  check(`why, on hover (${await read.locator('.unpin').first().getAttribute('title')})`, /Not one of your numbers/.test(await read.locator('.unpin').first().getAttribute('title') ?? ''));
  check(`the note says what dotted means (${(await read.locator('.unpin-note').innerText().catch(() => '')).slice(0, 80)})`, /dotted: a number the AI wrote that the app didn't give it/.test(await read.locator('.unpin-note').innerText().catch(() => '')));
  await read.screenshot({ path: OUT + 'pinned-read.png' });
  // the chat
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.chat');
  const inChat = await pg.locator('.chat .unpin').allInnerTexts();
  check(`the chat reply: 49 dotted, the bold 52 not (${inChat.join(', ')})`, inChat.join() === '49');
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
