// Experiments in alternating blocks (PLAN 227; owner, 24 Nov: "4"). "No caffeine after 14:00", 16 days from 1 Nov in
// 4-day blocks OFF, ON, ON, OFF (each switch's first day left out); energy 5 on OFF days and 8 on ON days. On the 12th
// (block 3, ON): Today's strip says "today ON: …". On the 18th it's done: Insights → Training shows OFF days → ON days,
// "better", and "ON days beat OFF days in 100 % of pairs".
const { chromium, APP, OUT, handle, tables, forYou } = require('./harness.cjs');

const D = 864e5, KEY = 'healthos.v1:u-test';
const at = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
const days = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));
const ORDER = ['off', 'on', 'on', 'off'];
const onDay = (d) => { const k = days.indexOf(d); return k >= 0 && k < 16 && ORDER[Math.floor(k / 4)] === 'on'; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(now) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: now });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    const es = days.filter((d) => at(d, 20) < now).map((d, i) => ({ id: 'm' + i, kind: 'feel', at: at(d, 20), energy: onDay(d) ? 8 : 5, mood: 6 }));
    const did = Object.fromEntries(days.filter((d) => onDay(d) && at(d, 23) < now).map((d) => [d, true]));
    await pg.evaluate(([k, es, did]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es;
      s.ai = { ...(s.ai || {}), experiments: [{ id: 'x', name: 'No caffeine after 14:00', how: 'Last coffee by 14:00', days: 16, measure: 'energy', start: '2026-11-01', blocks: { len: 4, order: ['off', 'on', 'on', 'off'] }, did }] };
      localStorage.setItem(k, JSON.stringify(s)); }, [KEY, es, did]);
    return { ctx, pg };
  }
  let { ctx, pg } = await open(at('2026-11-12', 10));
  await pg.goto(APP + '#today'); await pg.reload(); await forYou(pg, 'experiment'); await pg.waitForSelector('.xp-strip', { timeout: 5000 }).catch(() => {});
  const line = (await pg.locator('.xp-strip li').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the 12th, an ON block: "today ON" with what to do (${line})`, /day 12 of 16 — today ON: last coffee by 14:00/.test(line));
  await ctx.close();
  ({ ctx, pg } = await open(at('2026-11-18', 10)));
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('#experiments', { timeout: 8000 }).catch(() => {});
  const t = (await pg.locator('#experiments').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`done: OFF days → ON days, better (${t.slice(0, 260)})`, /5\.0 OFF days → 8\.0 ON days/.test(t) && /better/.test(t));
  check(`the second readout: ON beat OFF in 100 % of pairs (${(t.match(/ON days beat[^.]*\./) || [''])[0]})`, /ON days beat OFF days in 100 % of pairs · alternating 4-day blocks/.test(t));
  await pg.locator('#experiments').screenshot({ path: OUT + 'xpblocks.png' });
  await ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
