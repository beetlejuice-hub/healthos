// One morning read a day (PLAN 215; owner, 12 Nov: "I got like 3 morning reads today its weird idk if it works pls fix").
// Another device has claimed this morning's read a few minutes ago: this one doesn't write a second, it waits for that
// one to sync over. Nobody has: this one claims it, writes it once — a reload doesn't write another — and Settings → AI
// says when and on what it was written.
const { chromium, APP, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-11-12T08:00:00').getTime(), DAY = '2026-11-12';
const READ = { greeting: 'Morning.', items: [{ type: 'pattern', title: 'A steady week', text: 'Nothing off.', measure: 'sleep' }] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(claimed) {
    tables.entries.clear(); tables.docs.clear();
    const calls = [];
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push(body.task);
      r.fulfill(body.task === 'digest' ? { status: 200, contentType: 'application/json', body: JSON.stringify({ answer: READ, usage: null, costUsd: 0.05, model: 'opus' }) } : { status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    // the phone claimed this morning's read 5 minutes ago (planted after signing in: a sign-in clears claims in the fake)
    if (claimed) tables.docs.set(`u-test|claim:digest:${DAY}`, { user_id: 'u-test', key: `claim:digest:${DAY}`, value: { device: 'phone1', at: NOW - 5 * 60e3, name: 'iPhone' }, updated_at: '2026-11-12T07:55:00.000Z' });
    // last night is in: rated at 07:50
    await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl', kind: 'sleep', at, rating: 7 }]; s.ai = { ...(s.ai || {}), digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW - 10 * 60e3]);
    await pg.reload(); await pg.waitForSelector('.t2-status');
    await pg.waitForTimeout(20000);
    return { ctx, pg, calls };
  }

  let { ctx, pg, calls } = await open(true);
  check(`another device claimed this morning's read: no second one written here (${calls.join(', ') || 'no calls'})`, !calls.includes('digest'));
  await ctx.close();

  ({ ctx, pg, calls } = await open(false));
  const n1 = calls.filter((c) => c === 'digest').length;
  const claim = tables.docs.get(`u-test|claim:digest:${DAY}`);
  check(`nobody had: claimed and written once (${n1}; claim by ${claim?.value?.name})`, n1 === 1 && !!claim?.value?.device);
  await pg.reload(); await pg.waitForSelector('.t2-status'); await pg.waitForTimeout(3000);
  check(`a reload writes no second one (${calls.filter((c) => c === 'digest').length})`, calls.filter((c) => c === 'digest').length === 1);
  await pg.goto(APP + '#settings'); await pg.waitForSelector('[data-testid="reads-wrote"]', { timeout: 8000 }).catch(() => {});
  const said = await pg.locator('[data-testid="reads-wrote"]').innerText().catch(() => '');
  check(`Settings → AI says where it came from (${said})`, /^Morning read: written 08:\d\d on (Mac|a browser|Windows)$/.test(said));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
