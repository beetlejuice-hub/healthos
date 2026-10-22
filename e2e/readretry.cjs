// The morning read never silent (owner, 22 Oct: "i did not get the morning digest today and i miss it"). A failed read was
// dropped and not tried again until the app was closed, and opening the app sent up to four research calls at once.
// Thursday 22 Oct 08:30, last night rated: the morning read, the week read, the deep dive and last night's read-back are
// all due. The fake AI is busy for the first morning read (429), fails the second (502), answers the third. The calls must
// go one at a time, the morning read first; Today must say it didn't come, why and when it tries again; it must try again
// by itself at 08:32; Try again must go at once and bring the read; Settings → AI must list both failures. Before last
// night is in (no rating, no band): Today says it waits for it, and nothing is sent.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const H = 3_600_000, NOW = new Date('2026-10-22T08:30:00').getTime(), KEY = 'healthos.v1:u-test';
const READ = { greeting: 'Morning — 7 h and a calm night.', items: [{ type: 'fact', title: 'Protein first', text: 'Words.', tip: 'Eggs before 10', measure: 'protein' }] };
const ANSWERS = {
  review: () => ({ title: 'A steady week', summary: 'Steady.', notices: [], next: [], remember: [] }),
  dive: () => ({ topic: 'Does a late dinner cost you sleep?', why: 'w', yourData: 'd', found: [], verdict: 'v', sure: 'weak' }),
  night: () => ({ summary: 'A day.', happened: [], notes: '', change: [], remember: [] }),
  questions: () => ({ questions: [] }),
};
const FAILS = [
  { status: 429, body: { error: 'busy', message: 'The AI is busy — try again in a minute.' } },
  { status: 502, body: { error: 'ai-error', message: 'The AI service failed (500).' } },
];
// three weeks of dinners (the deep dive needs 10 days logged; the week read a week with something in it), yesterday's evening too
const ENTRIES = Array.from({ length: 21 }, (_, k) => ({ id: 'f' + k, kind: 'food', at: new Date(2026, 9, 21 - k, 19, 30).getTime(), name: 'Chicken and rice', grams: 400, macros: { kcal: 650, p: 45, c: 70, f: 18 } }));
const RATED = { id: 'sl', kind: 'sleep', at: NOW - H, rating: 7 };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(entries) {
    const calls = [], st = { open: 0, most: 0, digests: 0 };
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', async (r) => {
      const body = r.request().postDataJSON(); calls.push(body.task);
      st.open++; st.most = Math.max(st.most, st.open);
      await new Promise((ok) => setTimeout(ok, 250)); // a call takes a while: one sent meanwhile would overlap
      st.open--;
      if (body.task === 'digest') {
        const f = FAILS[st.digests++];
        if (f) return r.fulfill({ status: f.status, contentType: 'application/json', body: JSON.stringify(f.body) });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: READ, usage: null, costUsd: 0.1, model: 'opus' }) });
      }
      if (!ANSWERS[body.task]) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWERS[body.task](body), usage: null, costUsd: 0.1, model: 'opus' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, es]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.ai = { ...(s.ai || {}), digest: null, night: null, dive: null, reviews: [], chat: [], failed: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, entries]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    return { ctx, pg, calls, st };
  }
  const note = (pg) => pg.locator('.mr-pending');
  // not a locator's 30 s wait when there's none (the old app had none)
  const state = async (pg) => ((await note(pg).count()) ? note(pg).getAttribute('data-state') : null);
  const text = async (pg) => ((await note(pg).count()) ? note(pg).innerText() : '');
  const until = async (f, n = 100) => { for (let i = 0; i < n && !(await f()); i++) await new Promise((ok) => setTimeout(ok, 100)); };

  // before last night is in: it says it waits, and sends nothing
  {
    const { ctx, pg, calls } = await open(ENTRIES);
    await until(async () => (await note(pg).count()) > 0, 60);
    const t = await text(pg);
    check(`last night not in yet: Today says the read waits for it (${t.replace(/\n/g, ' ')})`, /^Morning read\s+comes once last night is in — rate your sleep to have it now, or it comes at 11:00\.$/i.test(t) && await state(pg) === 'waiting');
    check(`…and no morning read is asked for (${calls.join(', ')})`, !calls.includes('digest'));
    await ctx.close();
  }

  const { pg, calls, st } = await open([...ENTRIES, RATED]);
  // 1. the first try: busy. One at a time, the morning read first; then the rest, still one at a time
  await until(async () => (await state(pg)) === 'failed');
  await until(async () => calls.length >= 4 && st.open === 0);
  check(`the research calls go one at a time, the morning read first (${calls.join(', ')}; at most ${st.most} at once)`, calls[0] === 'digest' && st.most === 1 && ['review', 'dive', 'night'].every((t) => calls.includes(t)));
  const t1 = await text(pg);
  check(`Today says it didn't come, why, and when it tries again (${t1.replace(/\n/g, ' · ')})`, /^Morning read\s+didn't come through\. The AI is busy — try again in a minute\. Trying again at 08:32\.\s*Try again$/i.test(t1));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  if (await note(pg).count()) { await note(pg).evaluate((e) => e.scrollIntoView({ block: 'center' })); await note(pg).screenshot({ path: OUT + 'readretry-failed.png' }); }
  await pg.screenshot({ path: OUT + 'readretry-today.png' });

  // 2. two minutes on: it tries again by itself (and fails: the AI service)
  const before = calls.filter((c) => c === 'digest').length;
  await pg.clock.runFor(2 * 60_000 + 2000);
  await until(async () => calls.filter((c) => c === 'digest').length > before && st.open === 0 && (await state(pg)) === 'failed');
  await pg.waitForTimeout(300);
  const t2 = await text(pg);
  check(`at 08:32 it tried again by itself (${calls.filter((c) => c === 'digest').length} morning-read calls)`, calls.filter((c) => c === 'digest').length === 2);
  check(`…and says why this time, and the next wait: 10 minutes (${t2.replace(/\n/g, ' · ')})`, /didn't come through\. The AI service failed \(500\)\. Trying again at 08:42\./.test(t2));

  // 3. Try again: at once, and the read comes
  await note(pg).getByRole('button', { name: 'Try again' }).click({ timeout: 2000 }).catch(() => {});
  await pg.waitForSelector('section.morning:not(.mr-pending)', { timeout: 5000 }).catch(() => {});
  const card = await pg.locator('section.morning').first().innerText({ timeout: 2000 }).catch(() => '');
  check(`Try again brings it, there and then (${card.split('\n').slice(0, 3).join(' · ')})`, calls.filter((c) => c === 'digest').length === 3 && /7 h and a calm night/.test(card) && await note(pg).count() === 0);

  // 4. Settings → AI: both failures, in among the calls, with why
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
  const calls4 = pg.locator('#ai .ai-calls');
  const sum = await calls4.locator('summary').innerText({ timeout: 2000 }).catch(() => '');
  check(`Settings → AI says some failed (${sum})`, /and 2 that failed/.test(sum));
  await calls4.locator('summary').click({ timeout: 2000 }).catch(() => {});
  const rows = await calls4.locator('li.ai-failed').allInnerTexts();
  check(`…each with when and why (${rows.map((r) => r.replace(/\n/g, ' ')).join(' | ')})`, rows.length === 2 && /^08:32 · morning read · failed\s+The AI service failed \(500\)\./.test(rows[0]) && /^08:30 · morning read · failed\s+The AI is busy/.test(rows[1]));
  await calls4.screenshot({ path: OUT + 'readretry-settings.png', timeout: 2000 }).catch(() => {});
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
