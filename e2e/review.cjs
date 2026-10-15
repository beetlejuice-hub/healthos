// The week read (PLAN 65; owner: "AI should look at data at eod, eow, eom, and make suggestions, summaries, etc, even make
// graphs or like interesting notices"; 15 Oct: "do the digests"). Monday 19 Oct 09:00, 10 weeks behind: mood about 6, the
// last week 7.5; ~2,400 kcal, protein 150 against a 160 goal. A fake AI writes the read; the card's table and charts must
// come from the app's numbers. Asked once; an empty account asks nothing.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-19T09:00:00').getTime();
const calls = [];
const REVIEW = { title: 'Better mood, protein a bit short', summary: 'Mood averaged **7.5** against your usual 6 — your best week in two months.', notices: [
  { title: 'Mood up all week', text: 'Every day above your usual band, 7.1 to 7.8.', measure: 'mood' },
  { title: 'Protein just under goal', text: '150 g a day against 160.', measure: 'protein' },
  { title: 'Steady training', text: 'Two sessions, as usual.', measure: '' },
], next: [{ what: 'A protein snack after training', why: 'closes the 10 g gap' }], remember: [] };
const ANSWERS = {
  review: () => REVIEW,
  digest: () => ({ greeting: 'Morning!', items: [] }),
  questions: () => ({ questions: [] }),
  night: () => ({ summary: 'A day.', happened: [], notes: '', change: [], remember: [] }),
};

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(seed) {
    tables.entries.clear(); tables.docs.clear(); calls.length = 0;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWERS[body.task](body), usage: null, costUsd: 0.1, model: 'opus' }) }); });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([now, seed]) => {
      const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), D = 864e5, e = [];
      s.goals = { kcal: 2400, p: 160, c: 300, f: 80 }; s.ai = { ...(s.ai || {}), reviews: [], seenAt: 0 };
      if (seed) for (let i = 70; i >= 1; i--) {
        const day = now - i * D, last = i <= 7, w = [0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.1][i % 7], noise = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 - 0.5;
        e.push({ id: 'f' + i, kind: 'feel', at: day - 4 * 3600e3, mood: (last ? 7.5 : 6) + w });
        e.push({ id: 'k' + i, kind: 'food', at: day + 4 * 3600e3, name: 'Meal', grams: 500, macros: { kcal: Math.round(2400 + noise * 400), p: 150, c: 250, f: 80 } });
      }
      s.entries = e; localStorage.setItem(k, JSON.stringify(s));
    }, [NOW, seed]);
    await pg.reload(); await pg.waitForSelector('nav.tabs');
    await pg.waitForFunction(() => true); await pg.waitForTimeout(1200);
    return { ctx, pg };
  }

  let { ctx, pg } = await open(true);
  const asked = calls.filter((c) => c.task === 'review');
  check(`Monday 09:00: the week just gone asked for once (${asked.map((c) => `${c.kind} ${c.from}–${c.to}`).join(', ')})`, asked.length === 1 && asked[0].kind === 'week' && asked[0].from === '2026-10-12' && asked[0].to === '2026-10-18');
  check('the AI gets the app\'s numbers for the week', /## The week 12 Oct–18 Oct, as the app measured it/.test(asked[0]?.context ?? '') && /\[mood\] Mood: 7\.\d\/10 \(usual 6\.\d\), higher than usual — the better way/.test(asked[0]?.context ?? ''));
  check(`the AI tab's red number counts it (${await pg.locator('nav.tabs a[href="#ai"] .tabbadge').textContent().catch(() => '')})`, Number(await pg.locator('nav.tabs a[href="#ai"] .tabbadge').textContent().catch(() => '0')) >= 1);
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.msg.review');
  const card = pg.locator('.msg.review');
  const txt = (await card.innerText()).replace(/\s+/g, ' ');
  check(`the card: its week, title, summary (${txt.slice(0, 120)}…)`, /YOUR WEEK · 12 OCT–18 OCT/i.test(txt) && /Better mood, protein a bit short/.test(txt) && /Mood averaged 7\.5/.test(txt) && await card.locator('p b', { hasText: '7.5' }).count() === 1);
  const mood = await card.locator('tr[data-k="mood"]').evaluate((tr) => ({ cells: [...tr.querySelectorAll('td.sh')].map((td) => [td.textContent, td.dataset.tone ?? '']), wk: tr.querySelector('.rv-wk').textContent, tone: tr.querySelector('.rv-wk').dataset.tone }));
  check(`the table: mood each day shaded better, the week ↑ (${mood.cells.map((c) => c.join('')).join(' ')} | ${mood.wk})`, mood.cells.length === 7 && mood.cells.every(([, t]) => t === 'better') && /^7\.\d↑$/.test(mood.wk) && mood.tone === 'better');
  const kc = await card.locator('tr[data-k="kcal"] td.sh').allTextContents();
  check(`calories in the table, Sunday included (${kc.join(' ')})`, kc.length === 7 && kc.every((c) => /^2\.\dk$/.test(c)));
  const notes = await card.locator('.rv-n').evaluateAll((els) => els.map((e) => [e.querySelector('b').textContent, e.querySelectorAll('.rv-dot').length, [...e.querySelectorAll('.rv-dot')].map((d) => d.dataset.tone ?? '').join(',')]));
  check(`each notice drawn from the app's numbers when it names a measure; none when it doesn't (${notes.map((n) => `${n[0]}: ${n[1]} dots`).join(' · ')})`, notes.length === 3 && notes[0][1] === 7 && notes[0][2].split(',').every((t) => t === 'better') && notes[1][1] === 7 && notes[2][1] === 0);
  check('next week, maybe', /NEXT WEEK, MAYBE A protein snack after training closes the 10 g gap/i.test(txt));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'review-week.png' });
  await pg.reload(); await pg.waitForTimeout(1200);
  check('reloaded: still there, not asked again', calls.filter((c) => c.task === 'review').length === 1 && await pg.locator('.msg.review').count() === 1);
  await ctx.close();

  ({ ctx, pg } = await open(false));
  check('an empty account: no week read asked for', calls.filter((c) => c.task === 'review').length === 0);
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
