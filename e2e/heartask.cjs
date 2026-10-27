// Heart-rate asks on Today (owner, 22 Oct: "App can ask about the unusually high or low heart bpm too like what were you
// doing in this time frame and it can connect event to it and track. In the today page"). 22 fake days of a band, awake
// around 66 bpm. Planted today, with nothing logged: +18 at 14:10–14:50 and −14 at 15:20–16:00. At 17:00 Today asks
// about one, then the other; each answer is saved as what you were doing in the middle of its stretch (so it explains it
// everywhere) and both are answered in the AI tab too. A control day with no plant asks nothing.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-22T17:00:00').getTime(), KEY = 'healthos.v1:u-test';
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
function world(plant) {
  const g = rng(7), hr = [], sleep = [];
  const push = (t, v) => { v = Math.round(v); hr.push([t, v, v - 2, v + 2]); };
  for (let k = 21; k >= 0; k--) {
    const day0 = new Date(2026, 9, 22 - k).getTime(), T = (h) => day0 + h * HOUR, today = k === 0;
    for (let t = T(8); t < (today ? T(16 + 40 / 60) : T(23.5)); t += 2 * MIN) {
      const h = (t - day0) / HOUR, up = plant && today && h >= 14 + 10 / 60 && h < 14 + 50 / 60, down = plant && today && h >= 15 + 20 / 60 && h < 16;
      push(t, 66 + g() * 1.5 + (up ? 18 : down ? -14 : 0));
    }
    if (today) break;
    const bed = T(23.5), up = bed + 8 * HOUR;
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: 450, awakeMin: 12, toFallAsleepMin: 12, nap: false, stageMin: {}, stages: [{ type: 'light', start: bed, end: up }] });
    for (let t = bed; t < up; t += 2 * MIN) push(t, 52 + g());
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const plant of [true, false]) {
    const w = world(plant), tag = plant ? 'planted' : 'control';
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: w.sleep.filter((x) => x.end >= from - D && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    const stored = async (f, ok) => { let v; for (let i = 0; i < 30; i++) { v = f(await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)); if (ok(v)) break; await pg.waitForTimeout(100); } return v; };
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.ai = { ...(s.ai || {}), inbox: [], sent: [], chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    const ask = pg.locator('.heart-ask');
    await ask.waitFor({ timeout: plant ? 15000 : 6000 }).catch(() => {});
    if (!plant) { check(`${tag}: nothing planted, nothing asked`, await ask.count() === 0); await ctx.close(); continue; }
    const titles = [];
    // the first answer as he typed it (27 Oct: "i wrote one drink and work but it cut off" — to "one")
    for (const word of ['one drink and work', 'stairs']) {
      const t = (await ask.locator('b').first().innerText().catch(() => '')).trim();
      titles.push(t);
      await ask.locator('input').fill(word);
      if (word === 'stairs') await ask.screenshot({ path: OUT + 'heartask-today.png' }).catch(() => {});
      await ask.getByRole('button', { name: /^Send/ }).click();
      await pg.waitForTimeout(300);
    }
    check(`${tag}: Today asks about both — the low one and the raised one (${titles.join(' | ')})`, titles.includes('Heart rate down 15:20–16:00') && titles.includes('Heart rate up 14:10–14:50'));
    const said = await stored((s) => s.entries.filter((e) => e.kind === 'feel').map((e) => `${new Date(e.at).toTimeString().slice(0, 5)} ${e.doing.join(',')}`).sort(), (v) => v.length === 2);
    check(`${tag}: each answer saved as what you were doing in the middle of its stretch, every word kept (${said.join(' | ')})`, said.join('|') === '14:30 stairs|15:40 one-drink,work' || said.join('|') === '14:30 one-drink,work|15:40 stairs');
    const replies = await stored((s) => (s.ai.inbox || []).map((n) => n.reply?.text).filter(Boolean), (v) => v.length === 2);
    check(`${tag}: …and shown as typed (${replies.join(' | ')})`, replies.includes('one drink, work'));
    check(`${tag}: …and the card's gone once both are answered`, await ask.count() === 0);
    const inbox = await stored((s) => (s.ai.inbox || []).map((n) => `${n.id.split(':')[0]}:${n.reply ? 'answered' : 'open'}`), () => true);
    check(`${tag}: answered in the AI tab too (${inbox.join(', ')})`, inbox.length === 2 && inbox.every((x) => x.endsWith('answered')) && inbox.some((x) => x.startsWith('lowered')));
    check(`${tag}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
