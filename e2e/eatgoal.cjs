// The calorie goal from what you eat (PLAN 173; owner, 27 Oct: "the calorie goal of 1500 kcal … sounds way too low for me.
// i want it to change dynamically, and smartly so it adjusts to how much i actually eat and tries to slowly nudge it down" —
// "1a keep lowering but also learn what i actually eat and try to help do a managable goal"). His case: the goal from the
// burn, floored at 1,500 because weekends weren't logged; he eats ~2,300 on the days he logs and the scale isn't moving.
// (1) Opening the app moves it once to "from what you eat": 2,300, carbs with it; Settings says why. (2) Three weeks on,
// still eating 2,300 and not losing: 2,300 → 2,250 → 2,200 → 2,150, never more than 150 under what he eats. (3) A pick of
// "From your burn" after the move stays.
const { chromium, APP, OUT, handle, tables, openCard } = require('./harness.cjs');

const NOW = new Date('2026-10-20T09:00:00').getTime(), D = 864e5; // a Tuesday
const day = (i) => { const d = new Date(NOW - i * D); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(energy, width = 390) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null }) }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([now, energy]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), D = 864e5;
      s.goals = { kcal: 1500, p: 160, c: 150, f: 60 }; s.settings = { ...s.settings, energy, checkins: [] }; s.entries = [];
      for (let d = 60; d >= 0; d--) {
        const at = now - d * D, wd = new Date(at).getDay();
        // ~2,300 on the days he logs; Saturdays and Sundays not logged (or a coffee); weighed most mornings, flat
        if (d > 0 && wd !== 0 && wd !== 6) s.entries.push({ id: 'f' + d, kind: 'food', at: at + 3 * 3600e3, name: 'Meals', grams: 900, macros: { kcal: 2300 + ((d * 37) % 5 - 2) * 20, p: 150, c: 250, f: 70 } });
        if (wd === 6) s.entries.push({ id: 'c' + d, kind: 'drink', at: at + 3600e3, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
        if (d % 7 !== 3) s.entries.push({ id: 'w' + d, kind: 'weight', at: at - 2 * 3600e3, kg: Math.round((82 + ((d * 7) % 5 - 2) * 0.15) * 100) / 100 });
      }
      localStorage.setItem(k, JSON.stringify(s)); }, [NOW, energy]);
    await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('.card.en'); await pg.waitForTimeout(900);
    return { ctx, pg };
  }
  const st = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const card = (pg) => pg.locator('.card.en');
  const text = async (pg) => (await card(pg).innerText()).replace(/\s+/g, ' ');

  // 1 · his settings as they were: from the burn, never moved
  let { ctx, pg } = await open({ mode: 'burn', pace: 0.5, offset: 0 });
  let s = await st(pg), t = await text(pg);
  check(`moved once to "from what you eat", from today (${s.settings.energy.mode}, ${s.settings.energy.since})`, s.settings.energy.mode === 'eat' && s.settings.energy.since === day(0) && s.settings.energy.moved === true);
  check(`the goal is what he eats — 2,300, not 1,500 — carbs up with it, protein and fat kept (${s.goals.kcal}, ${s.goals.c} g)`, s.goals.kcal === 2300 && s.goals.c === 350 && s.goals.p === 160 && s.goals.f === 60);
  check(`Settings says why, the skipped weekends as gaps (${t.slice(0, 330)}…)`, /You usually eat 2,300 kcal — the middle of your 10 fully logged days in the two weeks before Monday\. A day you didn't log is a gap, not a fast: left out\./.test(t)
    && /This week 2,300 — what you eat now\. Each Monday it steps 50 lower while the scale isn't dropping 0\.3 kg a week\./.test(t) && /Next step Mon, 26 Oct/.test(t));
  check('"From what you eat" is the one pressed; the kcal box is auto', await card(pg).getByRole('button', { name: 'From what you eat' }).getAttribute('aria-pressed') === 'true' && /auto/.test(await card(pg).locator('[data-auto=kcal]').innerText()));
  await card(pg).screenshot({ path: OUT + 'eatgoal-start.png' });
  await pg.goto(APP + '#today'); await openCard(pg, 'fuel');
  check(`Today's Food card uses it (${(await pg.locator('#fuel h3').innerText()).replace(/\s+/g, ' ')})`, /goal 2,300 kcal/.test(await pg.locator('#fuel h3').innerText()));
  // 3 · a pick of the burn after the move stays
  await pg.goto(APP + '#settings'); await pg.waitForSelector('.card.en');
  await card(pg).getByRole('button', { name: 'From your burn' }).click(); await pg.waitForTimeout(400);
  await pg.reload(); await pg.waitForSelector('.card.en'); await pg.waitForTimeout(900);
  check('"From your burn" picked after it: stays the burn', (await st(pg)).settings.energy.mode === 'burn');
  await ctx.close();

  // 2 · on since three Mondays ago, still eating 2,300, the scale flat: 50 a week, kept at 150 under what he eats
  ({ ctx, pg } = await open({ mode: 'eat', pace: 0.5, offset: 0, since: day(22), moved: true }, 320));
  s = await st(pg); t = await text(pg);
  check(`2,300 → 2,250 → 2,200 → 2,150 (${s.goals.kcal}; ${(t.match(/Since[^.]*\./) || [''])[0]})`, s.goals.kcal === 2150 && /Since Mon, 28 Sept: 2,300 → 2,250 → 2,200 → 2,150\./.test(t));
  check(`…and why: the scale isn't dropping (${(t.match(/This week[^.]*\./) || [''])[0]})`, /This week 2,150, 50 under last week's: you're (losing|gaining) 0\.\d\d kg a week — under your 0\.3–0\.7\./.test(t));
  check(`fits 320 px (${await pg.evaluate(() => document.documentElement.scrollWidth)})`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'eatgoal-weeks.png' });
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
