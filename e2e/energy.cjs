// The calorie goal from what you burn (PLAN 95; owner, 15 Oct: "lose fat and gain some muscles why being lean, in like
// 2-3 months? or faster even"). Settings → Daily goals: by hand, or burn − the pace's deficit, written into the goals
// once a day. The band says 2,700 a day; your own measured burn beats it; the two-week check-in's −150 stays on top.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-20T09:00:00').getTime(), D = 864e5;
const day = (i) => { const d = new Date(NOW - i * D); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const bandOf = (kcal, days) => Object.fromEntries([...Array(days)].map((_, i) => [day(i + 1), kcal]).concat([[day(0), 700]]));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(kcal, seed) {
    // each scene starts from an empty account (the fake server would otherwise hand back the last scene's pace)
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const st = kcal ? { connected: true, needsReconnect: false, connectedAt: NOW - 20 * D, lastSync: NOW - 60e3, latest: NOW - 5 * 60e3, error: null, gapSec: 60 } : { connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null };
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' && kcal ? { hr: [[NOW - 5 * 60e3, 70, 68, 72]], sleep: [], rhr: {}, hrv: {}, steps: [], kcal, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([now, seed]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), D = 864e5;
      s.goals = { kcal: 2600, p: 160, c: 300, f: 80 }; s.settings = { ...s.settings, energy: undefined, checkins: [] }; s.entries = [];
      const food = (id, at, kcal) => ({ id, kind: 'food', at, name: 'Meal', grams: 400, macros: { kcal, p: 40, c: 100, f: 30 } });
      if (seed === 'measured') for (let d = 27; d >= 0; d--) {
        // eating 2,900 while gaining 0.25 kg a week: a burn of about 2,625
        if (d > 0) s.entries.push(food('f' + d, now - d * D + 3 * 3600e3, 2900));
        s.entries.push({ id: 'w' + d, kind: 'weight', at: now - d * D - 2 * 3600e3, kg: Math.round((78 + 0.25 * (27 - d) / 7 + ((d * 7) % 5 - 2) * 0.1) * 100) / 100 });
      }
      if (seed === 'slow') for (let d = 27; d >= 0; d--) s.entries.push({ id: 'w' + d, kind: 'weight', at: now - d * D - 2 * 3600e3, kg: Math.round((80 - 0.1 * (27 - d) / 7 + ((d * 7) % 5 - 2) * 0.1) * 100) / 100 });
      localStorage.setItem(k, JSON.stringify(s)); }, [NOW, seed]);
    await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('.card.en');
    await pg.waitForTimeout(kcal ? 900 : 300);
    return { ctx, pg };
  }
  const st = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const card = (pg) => pg.locator('.card.en');
  const text = async (pg) => (await card(pg).innerText()).replace(/\s+/g, ' ');

  // 1 · the band's 2,700 a day, nothing logged yet
  let { ctx, pg } = await open(bandOf(2700, 10));
  let t = await text(pg);
  check(`by hand to start; it says what the burn would make it (${t.slice(-80)})`, /it would be 2,150 at 0.5 kg a week/.test(t) && (await st(pg)).goals.kcal === 2600);
  await card(pg).getByRole('button', { name: 'From your burn' }).click(); await pg.waitForTimeout(400);
  let s = await st(pg); t = await text(pg);
  check(`"From your burn": 2,700 − 550 = 2,150, carbs −113 g, protein and fat stay (${s.goals.kcal}, ${s.goals.c} g)`, s.goals.kcal === 2150 && s.goals.c === 187 && s.goals.p === 160 && s.goals.f === 80);
  check(`says where the burn comes from and what it comes to (${t.slice(0, 260)}…)`, /the band's average over 10 days/.test(t) && /Goal 2,150: 550 under it → about 0.50 kg a week, ~5.0 kg by 29 Dec/.test(t));
  check('the kcal box is "auto", not typeable', await card(pg).locator('[data-auto=kcal]').innerText().then((x) => /2,150/.test(x) && /auto/.test(x)) && await card(pg).locator('input').count() === 3);
  await card(pg).screenshot({ path: OUT + 'energy.png' });
  await card(pg).getByRole('button', { name: /Fast/ }).click(); await pg.waitForTimeout(400);
  s = await st(pg); t = await text(pg);
  check(`Fast (0.65) wants 715 under; capped at a quarter of 2,700 → 2,030 (${s.goals.kcal}; ${/Capped/.test(t)})`, s.goals.kcal === 2030 && /Capped at a quarter of your burn/.test(t) && /0\.61 kg a week/.test(t));
  await card(pg).getByRole('button', { name: /Fast/ }).click(); await pg.waitForTimeout(300);
  check('tapping it again changes nothing', (await st(pg)).goals.kcal === 2030 && (await st(pg)).goals.c === 157);
  await pg.reload(); await pg.waitForSelector('.card.en'); await pg.waitForTimeout(900);
  check('after a reload: still 2,030, still Fast', (await st(pg)).goals.kcal === 2030 && await card(pg).getByRole('button', { name: /Fast/ }).getAttribute('aria-pressed') === 'true');
  await pg.goto(APP + '#today'); await pg.waitForSelector('#fuel');
  check(`Today's Food card uses it (${(await pg.locator('#fuel h3').innerText()).replace(/\s+/g, ' ')})`, /goal 2,030 kcal/.test(await pg.locator('#fuel h3').innerText()));
  await pg.goto(APP + '#settings'); await pg.waitForSelector('.card.en');
  await card(pg).getByRole('button', { name: 'Set by hand' }).click(); await pg.waitForTimeout(300);
  await card(pg).getByLabel('kcal').fill('2400'); await pg.waitForTimeout(300);
  await pg.reload(); await pg.waitForSelector('.card.en'); await pg.waitForTimeout(900);
  check('back to by hand: the box is yours again and the burn leaves it alone', (await st(pg)).goals.kcal === 2400);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await ctx.close();

  // 2 · your own measured burn (27 days of food against the scale) beats the band's 3,400
  ({ ctx, pg } = await open(bandOf(3400, 10), 'measured'));
  await card(pg).getByRole('button', { name: 'From your burn' }).click(); await pg.waitForTimeout(400);
  s = await st(pg); t = await text(pg);
  const burn = Number((t.match(/You burn about ([\d,]+)/) || [])[1]?.replace(',', ''));
  check(`measured, not the band: about 2,625 (${burn}), goal 550 under it (${s.goals.kcal})`, /measured: 27 days of food/.test(t) && Math.abs(burn - 2625) <= 40 && s.goals.kcal === Math.round((burn - 550) / 10) * 10);
  check(`protein said per kg of you (${(t.match(/Protein[^.]*\./) || [''])[0]})`, /Protein 160 g ≈ 2\.0 g per kg of you \(7[89]\.\d kg\)/.test(t));
  await ctx.close();

  // 3 · the two-week check-in, losing 0.1 a week: its −150 sits on top of the burn and survives tomorrow's goal
  ({ ctx, pg } = await open(bandOf(2700, 10), 'slow'));
  await card(pg).getByRole('button', { name: 'From your burn' }).click(); await pg.waitForTimeout(400);
  await pg.goto(APP + '#today'); await pg.waitForTimeout(600);
  const ci = pg.getByRole('region', { name: 'Two-week check-in' });
  t = (await ci.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the check-in: cut 150 from the burn's goal (${t.slice(0, 120)}…)`, /cut 150: 2,150 → 2,000 kcal/.test(t));
  await ci.getByRole('button', { name: 'Set 2,000' }).click(); await pg.waitForTimeout(300);
  s = await st(pg);
  check('kept as −150 on top of the burn', s.goals.kcal === 2000 && s.settings.energy.offset === -150);
  await pg.clock.fastForward(D); await pg.reload(); await pg.waitForTimeout(900);
  check('the next day the goal from the burn doesn\'t undo it', (await st(pg)).goals.kcal === 2000);
  await pg.goto(APP + '#settings'); await pg.waitForSelector('.card.en');
  t = await text(pg);
  check('Settings says so, with a reset', /Check-ins moved it −150/.test(t));
  await card(pg).getByRole('button', { name: 'Reset' }).click(); await pg.waitForTimeout(400);
  check('reset: back to burn − 550', (await st(pg)).goals.kcal === 2150);
  await ctx.close();

  // 4 · no band, nothing logged: says what it needs, the goal stays
  ({ ctx, pg } = await open(null));
  await card(pg).getByRole('button', { name: 'From your burn' }).click(); await pg.waitForTimeout(400);
  t = await text(pg);
  check(`no burn yet: says what's missing, goal stays 2,600 (${t.slice(-150)})`, /No burn to work from yet: needs the band connected for 5 full days \(0 so far\), or 14 days of food and 8 weigh-ins/.test(t) && (await st(pg)).goals.kcal === 2600);
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
