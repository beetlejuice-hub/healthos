// The night read waits for your other device's food (owner, 28 Oct: "i ate around 1900 kcal (160 left), yet ai digest
// says i ate 650 something" — "the food was logged before the digest i think..like i logged the food, then opened the
// app after 21:00"). Two devices: this one (the laptop) knows breakfast and lunch (671 kcal); dinner (1,330 kcal) was
// logged on the phone at 19:30 and is on the server. 21:09, a slow connection (the server answers in 2.5 s): the app
// opens (or the tab left open comes back), and the read must be written from the day with dinner in it, not before
// the pull lands. Same for the morning
// read and last night's sleep rating. Control: offline (the pull fails) — the read still comes, from what's here.
const { chromium, APP, handle, tables } = require('./harness.cjs');

const T = (hm, d = '2026-10-28') => new Date(`${d}T${hm}:00`).getTime(), KEY = 'healthos.v1:u-test';
const food = (id, hm, kcal, p) => ({ id, kind: 'food', at: T(hm), name: id, grams: 100, macros: { kcal, p, c: 0, f: 0 } });
const DAY = [food('Oats', '08:30', 380, 14), food('Tuna', '13:00', 291, 44)], DINNER = food('Chicken pasta', '19:30', 1330, 30);
const NIGHT = { summary: 'ok', happened: [], notes: '', change: [], remember: [] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function run(label, { offline = false, resume = false } = {}) {
    tables.entries.clear(); tables.docs.clear();
    const calls = [];
    let slow = false;
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', async (route) => {
      const u = new URL(route.request().url());
      if (slow && /\/rest\/v1\//.test(u.pathname)) { if (offline) return route.abort('internetdisconnected'); await new Promise((r) => setTimeout(r, 2500)); }
      return handle(route);
    });
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push({ ...body, t: Date.now() });
      r.fulfill(body.task === 'night' ? { status: 200, contentType: 'application/json', body: JSON.stringify({ answer: NIGHT, usage: null, costUsd: 0.02, model: 'sonnet' }) } : { status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: T('18:00') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    // the laptop at 18:00: breakfast and lunch, synced
    await pg.evaluate(([k, d]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = d; s.goals = { kcal: 2160, p: 160, c: 220, f: 70 }; s.ai = { ...(s.ai || {}), night: null, digest: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, DAY]);
    await pg.reload(); await pg.waitForSelector('.t2-status'); await pg.waitForTimeout(1500);
    // the phone, 19:30: dinner, on the server
    tables.entries.set('u-test|dinner', { user_id: 'u-test', id: DINNER.id, kind: 'food', at: new Date(DINNER.at).toISOString(), data: DINNER, deleted: false, updated_at: '2026-09-30T00:00:00.000Z' });
    // 21:09, a slow connection: the laptop opens again
    slow = true;
    await pg.clock.setSystemTime(T('21:09'));
    if (resume) await pg.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); // the tab, left open since 18:00, comes back
    else { await pg.reload(); await pg.waitForSelector('.t2-status'); }
    for (let i = 0; i < 80 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
    const sent = calls.find((c) => c.task === 'night'), tot = (sent?.context.match(/Totals, as the app counts them \(food and drinks\): ([\d,]+) kcal · P (\d+) g/) || []);
    return { ctx, pg, sent, tot };
  }

  let { ctx, sent, tot } = await run('slow');
  check(`a slow connection: the read waits for the phone's dinner (${tot[1]} kcal, ${tot[2]} g)`, !!sent && tot[1] === '2,001' && tot[2] === '88' && /19:30 ate Chicken pasta/.test(sent.context));
  await ctx.close();

  ({ ctx, sent, tot } = await run('resume', { resume: true }));
  check(`the tab left open comes back at 21:09: the same (${tot[1]} kcal)`, !!sent && tot[1] === '2,001');
  await ctx.close();

  ({ ctx, sent, tot } = await run('offline', { offline: true }));
  check(`control: offline — the read still comes, from what's here (${tot[1]} kcal)`, !!sent && tot[1] === '671');
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
