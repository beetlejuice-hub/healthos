// A study every morning, and no silent drops (PLAN 193; owner, 4 Nov: "tooday morning read had absolutely no study").
// A fake AI writes the morning read at 07:40 through the app's own path.
// 1. Its three hold no study, its spare is one: the read shows the study in the third's place.
// 2. The Worker left the study out over its link (`unlinked`): opened, the read says so.
// Control: a study among the three and nothing left out — the spare stays out, no note. 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (h, m = 0) => new Date(2026, 10, 4, h, m).getTime();
const it = (type, n) => ({ type, topic: `t-${type}-${n}`, title: `${type} ${n}: beer nights cost you sleep`, text: '6.1 after drinks vs 7.2 without.', sure: 'yours' });
const study = { type: 'study', topic: 'creatine-sleep', title: 'Creatine eases the sleep-loss slump', text: 'A 2024 trial: 0.35 g/kg kept reaction time up after a short night.', sure: 'some', source: { title: 'Creatine and sleep deprivation', url: 'https://pubmed.ncbi.nlm.nih.gov/38418484/' } };
const READS = {
  spare: { greeting: 'Morning.', items: [it('pattern', 1), it('try', 2), it('connection', 3), study] },
  dropped: { greeting: 'Morning.', items: [it('pattern', 1), it('try', 2), it('connection', 3)], unlinked: ['study'] },
  control: { greeting: 'Morning.', items: [it('pattern', 1), study, it('try', 2), { ...study, topic: 'magnesium-sleep', title: 'Magnesium and deep sleep' }] },
};

async function open(b, read) {
  const errs = [], calls = [];
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body);
    const a = body.task === 'digest' ? READS[read] : body.task === 'questions' ? { questions: [] } : null;
    if (!a) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: a, usage: null, costUsd: 0.05, model: 'sonnet' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T(7, 40) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // last night rated, so the morning read is written (written after the sync's own save, then checked — harness seed())
  for (let k = 0; k < 3; k++) {
    await pg.waitForLoadState('networkidle');
    await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl', kind: 'sleep', at, rating: 7 }]; s.ai = { ...(s.ai || {}), digest: null, night: null, said: [], shown: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(7, 20)]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
    if (await pg.evaluate((k) => (JSON.parse(localStorage.getItem(k)).entries || []).some((e) => e.id === 'sl'), KEY)) break;
  }
  for (let i = 0; i < 80 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(100);
  await forYou(pg, 'morning');
  const mr = pg.locator('section.morning:not(.mr-pending)');
  await mr.waitFor({ timeout: 8000 }).catch(() => {});
  await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  return { ctx, pg, errs, mr };
}
const kinds = (mr) => mr.locator('.mr-kind').allInnerTexts();
const note = async (mr) => (await mr.locator('.rd-unlinked').count()) ? (await mr.locator('.rd-unlinked').innerText()).replace(/\s+/g, ' ') : '';

(async () => {
  const b = await chromium.launch();
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };

  // 1. no study in the three; the spare is one
  let { ctx, pg, errs, mr } = await open(b, 'spare');
  const k1 = await kinds(mr);
  check(`no study in the three: the spare study takes the third's place (${k1.join(' · ')})`, k1.length === 3 && /^new study$/i.test(k1[2]) && (await mr.locator('.mr-row b').nth(2).innerText()) === study.title);
  check(`…and nothing was left out, so no note (${await note(mr)})`, (await note(mr)) === '');
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await mr.screenshot({ path: OUT + 'readstudy-spare.png' });
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();

  // 2. the study left out over its link: said, not lost
  ({ ctx, pg, errs, mr } = await open(b, 'dropped'));
  const n2 = await note(mr);
  check(`the study left out over its link: the read says so (${n2})`, n2 === "The study was left out — its link didn't open, or the page was about something else.");
  check('…kept with the read', JSON.stringify((await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.digest.unlinked, KEY))) === '["study"]');
  await mr.screenshot({ path: OUT + 'readstudy-dropped.png' });
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();

  // control: a study among the three, nothing left out
  ({ ctx, pg, errs, mr } = await open(b, 'control'));
  const k3 = await kinds(mr), titles = await mr.locator('.mr-row b').allInnerTexts();
  check(`control: a study already there — the three as written, the spare stays out, no note (${k3.join(' · ')})`, k3.length === 3 && titles[2].startsWith('try 2') && !titles.includes('Magnesium and deep sleep') && (await note(mr)) === '');
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
