// The night read at 23:47 (owner, 22 Oct: "Opened the app at 23;47 - no night digest so far…i miss it"). Reproduced: the
// weekly deep dive was due too, went first, and the night read waited behind it — minutes — with nothing on Today saying
// so. Now: the night read is asked for while the deep dive is still going (the reads have their own line); while it's
// written Today says so; when it fails, why and Try again; Try again brings it. The fake deep dive takes 8 s.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-22T23:47:00').getTime(), KEY = 'healthos.v1:u-test', H = 3_600_000;
const NIGHT = { summary: 'A calm day — dinner at 19:45, one coffee.', happened: [], notes: '', change: [], remember: [], items: [] };
const DIVE = { topic: 'Does a late dinner cost you sleep?', why: 'w', yourData: 'd', found: [], verdict: 'v', sure: 'weak' };

(async () => {
  const b = await chromium.launch(); const errs = [], seen = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  let nights = 0, diveDone = false;
  await ctx.route('**/api/ai?**', async (r) => {
    const body = r.request().postDataJSON(); seen.push(`${body.task}${diveDone ? '' : ' (dive still going)'}`);
    const reply = (status, json) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    if (body.task === 'dive') { await new Promise((ok) => setTimeout(ok, 8000)); diveDone = true; return reply(200, { answer: DIVE, usage: null, costUsd: 0.3, model: 'opus' }); }
    if (body.task === 'night') {
      await new Promise((ok) => setTimeout(ok, 1500));
      return nights++ === 0 ? reply(502, { error: 'ai-error', message: 'The AI service failed (500).' }) : reply(200, { answer: NIGHT, usage: null, costUsd: 0.1, model: 'opus' });
    }
    reply(500, { error: 'not in this test' });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, now, H]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    // three weeks of dinners (the deep dive is due: none this week), and today's
    s.entries = Array.from({ length: 21 }, (_, i) => ({ id: 'f' + i, kind: 'food', at: now - 4 * H - i * 864e5, name: 'Dinner', grams: 400, macros: { kcal: 700, p: 40, c: 70, f: 20 } }));
    s.workouts = []; s.ai = { ...(s.ai || {}), digest: { day: '2026-10-22', at: now - 16 * H, greeting: 'Morning', items: [] }, night: { day: '2026-10-21', at: now - 26 * H, summary: 'x', happened: [], notes: '', change: [], remember: [] },
      reviews: [{ kind: 'week', key: '2026-10-12', from: '2026-10-12', to: '2026-10-18', at: now - 3 * 864e5, title: 't', summary: 's', notices: [], next: [], remember: [], rows: [] }], dive: null, chat: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW, H]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  const note = pg.locator('.mr-pending[aria-label="Your day, read back"]');
  const state = async () => ((await note.count()) ? note.getAttribute('data-state') : null);
  for (let i = 0; i < 50 && !seen.some((x) => x.startsWith('night')); i++) await pg.waitForTimeout(100);
  check(`the night read is asked for while the deep dive is still going (${seen.join(', ')})`, seen.includes('dive (dive still going)') && seen.includes('night (dive still going)'));
  const w = (await note.count()) ? (await note.innerText()).replace(/\s+/g, ' ') : '';
  check(`while it's written, Today says so (${w})`, /^your day, read back writing it now…$/i.test(w));
  for (let i = 0; i < 40 && (await state()) !== 'failed'; i++) await pg.waitForTimeout(100);
  const f = (await note.count()) ? (await note.innerText()).replace(/\s+/g, ' ') : '';
  check(`when it fails: why, when it tries again, Try again (${f})`, /didn't come through\. The AI service failed \(500\)\. Trying again at 23:49\. Try again$/i.test(f));
  await note.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await note.screenshot({ path: OUT + 'nightlane-failed.png' }).catch(() => {});
  await note.getByRole('button', { name: 'Try again' }).click({ timeout: 2000 }).catch(() => {});
  await pg.waitForSelector('section.night:not(.mr-pending)', { timeout: 6000 }).catch(() => {});
  const card = (await pg.locator('section.night').count()) ? await pg.locator('section.night').innerText() : '';
  check(`Try again brings it (${card.split('\n').slice(0, 3).join(' · ')})`, /A calm day/.test(card) && await note.count() === 0);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
