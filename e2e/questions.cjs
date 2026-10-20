// Today's quick questions (owner, 16 Oct: "Stop asking this is not working also i should be able to skip question"). Three
// questions for today, the first one asked daily: "Stop asking this" takes it away now and for good; "Skip" hides one for
// today only; answering still works; the next day the stopped one doesn't come back, the skipped kind does.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-16T15:00:00').getTime(), D = 864e5;
const Q = (key, text, repeat) => ({ id: `2026-10-16:${key}`, key, text, why: 'to see what lines up with your slumps', options: ['Small', 'Medium', 'Big'], repeat });
const q1 = Q('meal_size', 'Did you have a big meal before your afternoon check-in today?', 'daily');
const q2 = Q('nap', 'Did you nap today?', 'daily');
const q3 = Q('walk', 'Did you walk outside at lunch?', 'once');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  // the AI is on but must not be asked: today's questions are already written
  const calls = [];
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { calls.push(r.request().postDataJSON()); r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"off"}' }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([q1, q2, q3]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.ai = { ...(s.ai || {}), questions: { day: '2026-10-16', list: [q1, q2, q3] }, daily: [q1, q2], asked: [q1.text, q2.text, q3.text] };
    localStorage.setItem(k, JSON.stringify(s)); }, [q1, q2, q3]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.question');
  const card = pg.locator('.question');
  const head = async () => (await card.locator('h3').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const text = async () => card.locator('.q').innerText().catch(() => '');
  check(`three for today, the daily one first (${await head()})`, /1 of 3/.test(await head()) && (await text()) === q1.text);
  await card.screenshot({ path: OUT + 'questions-card.png' });

  await card.getByRole('button', { name: 'Stop asking this' }).click(); await pg.waitForTimeout(200);
  check(`"Stop asking this" takes it away now (${await text()} · ${await head()})`, (await text()) === q2.text && /1 of 2/.test(await head()));

  await card.getByRole('button', { name: 'Skip' }).click(); await pg.waitForTimeout(200);
  check(`"Skip" hides it for today (${await text()})`, (await text()) === q3.text && /pick one or more|1 of 1/.test(await head()));
  // owner, 20 Oct: "i should be able to choose multiple answers for a question" — tap picks, tap again unpicks, Send saves
  await card.getByRole('button', { name: 'Small' }).click(); await card.getByRole('button', { name: 'Big' }).click(); await card.getByRole('button', { name: 'Small' }).click();
  await card.getByRole('button', { name: 'Medium' }).click(); await pg.waitForTimeout(100);
  check('a tap picks, nothing is saved yet', await pg.locator('.question').count() === 1 && await card.locator('[aria-pressed="true"]').count() === 2);
  await card.screenshot({ path: OUT + 'questions-multi.png' });
  await card.getByRole('button', { name: 'Send 2' }).click(); await pg.waitForTimeout(200);
  const ans = (await pg.evaluate(() => (JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').entries || []).filter((e) => e.kind === 'answer'))).at(-1);
  check(`Send saves both, in the options' order (${ans && ans.answer})`, ans && ans.key === 'walk' && ans.answer === 'Medium, Big');
  check('answering the last one still works, and the card is gone', await pg.locator('.question').count() === 0);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check('after a reload: stopped and skipped stay away today', await pg.locator('.question').count() === 0);

  // the next day: the stopped daily one doesn't come back; the skipped daily one does
  await pg.clock.fastForward(D); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(400);
  const tomorrow = await text();
  check(`tomorrow: the skipped daily question is back, the stopped one isn't (${tomorrow})`, tomorrow === q2.text && !(await pg.locator('.question').innerText().catch(() => '')).includes(q1.text));
  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').ai);
  check('the stopped one is remembered, so the AI is told not to ask it again', (st.stopped || []).includes('meal_size') && !st.daily.some((q) => q.key === 'meal_size'));
  check('no answer was saved for a stop or a skip', (await pg.evaluate(() => (JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').entries || []).filter((e) => e.kind === 'answer').map((e) => e.key))).join() === 'walk');

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
