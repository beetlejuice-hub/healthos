// The reads compute (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 1). The morning read may ask the app for its own numbers
// before it writes: here it asks "sleep the next day, with drinks vs without". The app must work that out from the log —
// the real tool, the real engine — and send it back in the next round. Planted: a beer every third evening, and the next
// morning's sleep rated ~5 against ~8. The answer sent back must find it ("clear", ~5 vs ~8); the same evenings without the
// plant must come back "not clear". The read, once written, says what it was checked with.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const H = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-21T08:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function log(plant) {
  const es = [];
  for (let k = 30; k >= 1; k--) {
    const eve = new Date(2026, 9, 21 - k, 21, 0).getTime(), drank = k % 3 === 0;
    if (drank) es.push({ id: 'b' + k, kind: 'drink', at: eve, name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 });
    // dinner every day: a day with nothing logged can't say there were no drinks, so the app leaves it out
    es.push({ id: 'f' + k, kind: 'food', at: eve - 2 * H, name: 'Chicken and rice', grams: 400, macros: { kcal: 650, p: 45, c: 70, f: 18 } });
    // the morning after: rated lower after a beer when planted; the same wobble either way
    const wobble = [0, 0.5, -0.5, 1, -1][k % 5];
    es.push({ id: 's' + k, kind: 'sleep', at: eve + 11 * H, rating: Math.max(1, Math.min(10, Math.round((plant && drank ? 5 : 8) + wobble))) });
  }
  return es;
}
const CALL = { id: 'tu_1', name: 'compare', input: { measure: 'sleep', thing: 'drinks', when: 'next_day', from: ymd(NOW - 30 * D), to: ymd(NOW - D) } };
const FINAL = { greeting: 'Morning.', items: [{ type: 'pattern', title: 'Beer nights cost you sleep', text: 'The app\'s test: 5 after a beer vs 8 without — clear.', tip: 'Skip the beer tonight', measure: 'sleep' }] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const plant of [true, false]) {
    const tag = plant ? 'planted' : 'control', calls = [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push(body);
      // the morning read: first it asks for the app's numbers, then — with them — it answers
      if (body.task !== 'digest') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      const answer = body.turn ? FINAL : { calls: [CALL], turn: [{ role: 'assistant', content: [{ type: 'tool_use', ...CALL }] }] };
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'opus' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.ai = { ...(s.ai || {}), digest: null, chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, log(plant));
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    for (let i = 0; i < 200 && calls.filter((c) => c.task === 'digest').length < 2; i++) await pg.waitForTimeout(100);
    const dg = calls.filter((c) => c.task === 'digest'), sent = dg[1]?.turn ?? [];
    const result = sent.at(-1)?.content?.find((x) => x.type === 'tool_result');
    const text = result?.content ?? '';
    check(`${tag}: the read asked, the app answered in the next round, the AI's turn sent back as it came (${dg.length} calls)`,
      dg.length === 2 && !dg[0].turn && sent[0]?.role === 'assistant' && sent[0].content[0].id === 'tu_1' && result?.tool_use_id === 'tu_1' && !dg[1].final); // the last allowed round, not yet the forced one
    if (plant) check(`${tag}: the app's own test finds the planted effect (${text})`,
      /^Sleep rating the next day with drinks vs without, 2026-09-21 to 2026-10-20 — with: average [45]\.\d\/10 over 10 days; without: [78]\.\d\/10 over 20\. Difference −[23]\.\d\/10 .*: clear\./.test(text));
    else check(`${tag}: …and finds nothing when nothing's there (${text})`, /with: average [78]\.\d\/10 over 10 days; without: [78]\.\d\/10 over 20\. .*not clear/.test(text));
    if (plant) {
      await pg.waitForSelector('section.morning .mr-row', { timeout: 5000 }).catch(() => {});
      await forYou(pg, 'morning');
      const mr = pg.locator('section.morning');
      await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
      const looked = await mr.locator('.mr-looked').innerText().catch(() => '');
      check(`${tag}: the read says what it was checked with (${looked})`, looked === 'Checked against your data by the app: its test');
      await mr.screenshot({ path: OUT + 'readlooks.png' });
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
