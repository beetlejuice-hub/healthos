// Today → the two-week check-in (owner, 6 Oct): his ±150 kcal rule, from weekly-average weight and lifts,
// offered as one tap that changes the calorie goal — and then quiet for two weeks.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-20T09:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const seed = (days, perWeek) => pg.evaluate(([days, perWeek]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), D = 864e5, now = Date.now();
    s.entries = (s.entries || []).filter((e) => e.kind !== 'weight');
    for (let d = days - 1; d >= 0; d--) s.entries.push({ id: 'w' + d, kind: 'weight', at: now - d * D - 2 * 3600e3, kg: Math.round((80 + perWeek * (days - 1 - d) / 7 + ((d * 7) % 5 - 2) * 0.1) * 100) / 100 });
    localStorage.setItem(k, JSON.stringify(s)); }, [days, perWeek]);
  const card = pg.getByRole('region', { name: 'Two-week check-in' });

  await seed(10, -0.1); await pg.reload(); await pg.waitForTimeout(600);
  check('ten days of weigh-ins: no check-in yet (needs the week two weeks ago too)', await card.count() === 0);

  await seed(28, -0.1); await pg.reload(); await pg.waitForTimeout(600);
  const t = await card.innerText().catch(() => '');
  check(`four weeks, losing ~0.1 kg a week: the rule says cut 150 (${t.replace(/\s+/g, ' ').slice(0, 140)}…)`, /losing about 0\.\d\d kg a week, under 0\.3 kg/.test(t) && /cut 150: 2,600 → 2,450 kcal/.test(t));
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100); await card.screenshot({ path: OUT + 'checkin.png' });
  await card.getByRole('button', { name: 'Set 2,450' }).click(); await pg.waitForTimeout(200);
  let s = await st();
  check('one tap sets the goal; carbs move by what the card said (−38 g), protein and fat stay', /−38 g/.test(t) && s.goals.kcal === 2450 && s.goals.c === 262 && s.goals.p === 160 && s.goals.f === 80);
  check('the answer is kept', s.settings.checkins.length === 1 && s.settings.checkins[0].kcalBefore === 2600 && s.settings.checkins[0].kcalAfter === 2450);
  check('and the card is gone', await card.count() === 0);
  await pg.reload(); await pg.waitForTimeout(600);
  check('…still gone after a reload', await card.count() === 0);

  // Two weeks later, losing 0.5 a week: keep.
  await pg.clock.fastForward(14 * 864e5); await seed(28, -0.5); await pg.reload(); await pg.waitForTimeout(600);
  const t2 = await card.innerText().catch(() => '');
  check('two weeks on, losing ~0.5 a week: keep, one OK', /inside 0\.3–0\.7 kg/.test(t2) && /keep 2,450 kcal/i.test(t2) && await card.getByRole('button', { name: 'OK' }).count() === 1);
  await card.getByRole('button', { name: 'OK' }).click(); await pg.waitForTimeout(200);
  s = await st();
  check('keeping changes nothing but is remembered', s.goals.kcal === 2450 && s.settings.checkins.length === 2);
  check('nothing scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= (window.matchMedia('(max-width: 700px)').matches ? 390 : window.innerWidth)));

  // PLAN 134 (owner, 20 Oct: "My weight going up could be muscle too, the creatin hitting plus im back at gym"): two weeks
  // on, the scale up 0.2 a week — but creatine started 10 days ago. The cut is held and says why; still his to make.
  await pg.clock.fastForward(14 * 864e5); await seed(28, 0.2);
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)), now = Date.now();
    s.supplements = [...(s.supplements || []).filter((x) => x.id !== 'creatine'), { id: 'creatine', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }];
    s.entries.push(...[10, 9, 8, 6, 4, 2, 1].map((d) => ({ id: 'cr' + d, kind: 'supp', at: now - d * 864e5, suppId: 'creatine', status: 'taken', slot: 'morning' })));
    localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForTimeout(600);
  const t3 = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`creatine 10 days in, the scale up: the cut is held, and says why (${t3.slice(0, 220)}…)`, /gaining about 0\.\d\d kg a week, under 0\.3 — but creatine started .* holds 1–2 kg of water/.test(t3) && /keep 2,450 kcal/i.test(t3));
  check('…still his call: "Cut 150 anyway" next to Keep', await card.getByRole('button', { name: 'Cut 150 anyway' }).count() === 1 && await card.getByRole('button', { name: 'Keep 2,450' }).count() === 1);
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100); await card.screenshot({ path: OUT + 'checkin-creatine.png' });
  await card.getByRole('button', { name: 'Cut 150 anyway' }).click(); await pg.waitForTimeout(200);
  s = await st();
  check(`"Cut 150 anyway" cuts (${s.goals.kcal})`, s.goals.kcal === 2300 && s.settings.checkins.length === 3 && s.settings.checkins[2].kcalAfter === 2300);
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
