// The owner's 4-day plan (6 Oct: "make a workout plan for this, make sure its easily customizable"): it's in
// Premade workouts as he wrote it, becomes your split in two taps, and every day of it can be changed.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await pg.goto(APP + '#workout'); await pg.waitForSelector('text=Premade workouts');

  await pg.getByRole('button', { name: /Push · Pull · Mixed \+ cardio/ }).click(); await pg.waitForTimeout(150);
  const card = pg.locator('.prog-card.open'), txt = await card.innerText();
  check('the plan is there: three lifting days', ['Push + Quads', 'Pull + Hamstrings', 'Mixed'].every((d) => txt.includes(d)) && await card.locator('.prog-day button', { hasText: 'Start' }).count() === 3);
  check('with his swap and the cardio after each day', /Squat \(or hack squat\) 3×8/.test(txt) && /then 20 min stairmaster/.test(txt) && /then 20 min incline walk/.test(txt));
  check('the cardio day and rest days', /Cardio\s*40–45 min stairmaster plus incline walk/.test(txt) && /Rest days\s*Walking, abs/.test(txt));
  check('and his rules', /1–2 reps short of failure/.test(txt) && /150 kcal less/.test(txt) && /lighter week every 6–8 weeks/.test(txt));
  check('says how to change it', /press Edit on any day/.test(txt));
  check('nothing scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await card.screenshot({ path: OUT + 'plan-card.png' });

  await card.getByRole('button', { name: 'Make this my split…' }).click();
  await card.getByRole('button', { name: 'Replace my split' }).click(); await pg.waitForTimeout(200);
  let s = await st();
  check('two taps make it your split', JSON.stringify(s.templates.map((t) => t.name)) === '["Push + Quads","Pull + Hamstrings","Mixed"]');
  check('saved as plain days (no program notes in your data)', s.templates.every((t) => !('after' in t) && t.exercises.every((e) => !('or' in e))));

  // Customize: swap squat for hack squat, drop a set of leg extensions, add calves.
  await pg.locator('.tile.tpl', { hasText: 'Push + Quads' }).getByRole('button', { name: 'Edit' }).click();
  await pg.getByLabel('Exercise 1').fill('Hack squat');
  await pg.locator('.exed').nth(3).getByLabel('Sets').fill('2');
  await pg.getByRole('button', { name: '+ Add exercise' }).click();
  await pg.getByLabel('Exercise 7').fill('Calf raise');
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(200);
  s = await st();
  const push = s.templates.find((t) => t.name === 'Push + Quads');
  check(`edited day saved (${push.exercises.map((e) => e.name + ' ' + e.sets).join(', ')})`, push.exercises[0].name === 'Hack squat' && push.exercises[3].sets === 2 && push.exercises[6]?.name === 'Calf raise');
  await pg.locator('.tile.tpl', { hasText: 'Push + Quads' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  check('starting it uses your version', /Hack squat/.test(await pg.locator('.tile.cur').innerText()) && /Calf raise/.test(await pg.locator('.tile.plan').innerText()));
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
