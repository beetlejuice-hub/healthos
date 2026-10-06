// The owner's 4-day plan (6 Oct: "make a workout plan for this, make sure its easily customizable"): it's in
// Premade workouts as he wrote it, becomes your split in two taps, and every day of it can be changed.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

// The pre-6 Oct starter split, as an account that never changed it has it on the server.
const STARTER = [
  { id: 'upper-a', name: 'Upper A', exercises: [{ name: 'Bench press', sets: 3, reps: 6, restSec: 150 }, { name: 'Barbell row', sets: 3, reps: 8, restSec: 120 }, { name: 'Overhead press', sets: 3, reps: 6, restSec: 150 }, { name: 'Lat pulldown', sets: 3, reps: 10, restSec: 90 }] },
  { id: 'lower-a', name: 'Lower A', exercises: [{ name: 'Squat', sets: 3, reps: 5, restSec: 180 }, { name: 'Romanian deadlift', sets: 3, reps: 8, restSec: 150 }, { name: 'Leg press', sets: 3, reps: 10, restSec: 120 }, { name: 'Calf raise', sets: 3, reps: 12, restSec: 60 }] },
  { id: 'upper-b', name: 'Upper B', exercises: [{ name: 'Overhead press', sets: 3, reps: 6, restSec: 150 }, { name: 'Pull-ups', sets: 3, reps: 8, restSec: 120 }, { name: 'Incline DB press', sets: 3, reps: 10, restSec: 120 }, { name: 'Bicep curl', sets: 3, reps: 12, restSec: 60 }] },
  { id: 'lower-b', name: 'Lower B', exercises: [{ name: 'Deadlift', sets: 3, reps: 5, restSec: 180 }, { name: 'Front squat', sets: 3, reps: 6, restSec: 150 }, { name: 'Leg curl', sets: 3, reps: 12, restSec: 90 }] },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  tables.docs.set('u-test|templates', { user_id: 'u-test', key: 'templates', value: STARTER, updated_at: '2026-09-29T12:00:00.000Z' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await pg.goto(APP + '#workout'); await pg.waitForSelector('text=Premade workouts'); await pg.waitForTimeout(1200);
  const days = () => pg.locator('.dcard h2').allTextContents();
  // Owner, 6 Oct: the starter split "should be replaced w the saved workouts".
  check(`an untouched starter split from the server shows as his plan (${(await days()).join(', ')})`, JSON.stringify(await days()) === '["Push + Quads","Pull + Hamstrings","Mixed"]');
  await pg.reload(); await pg.waitForSelector('text=Premade workouts'); await pg.waitForTimeout(600);
  check('…and still after a reload', JSON.stringify(await days()) === '["Push + Quads","Pull + Hamstrings","Mixed"]');
  await pg.screenshot({ path: OUT + 'plan-split.png' });
  // Switch to another program, so making this one the split can be tested.
  await pg.getByRole('button', { name: /Push \/ Pull \/ Legs/ }).click();
  await pg.getByRole('button', { name: 'Make this my split…' }).click(); await pg.getByRole('button', { name: 'Replace my split' }).click(); await pg.waitForTimeout(200);
  check('a changed split is left alone', JSON.stringify(await days()) === '["Push","Pull","Legs"]');

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
  check('saved as split days with their cardio, no program notes', s.templates.every((t) => !('after' in t) && t.cardio && t.exercises.every((e) => !('or' in e))));

  // Customize: swap squat for hack squat, drop a set of leg extensions, add calves.
  await pg.locator('.dcard', { hasText: 'Push + Quads' }).getByRole('button', { name: /^Edit/ }).click();
  await pg.getByLabel('Exercise 1').fill('Hack squat');
  await pg.locator('.exed').nth(3).getByLabel('Sets').fill('2');
  await pg.getByRole('button', { name: '+ Add exercise' }).click();
  await pg.getByLabel('Exercise 7').fill('Calf raise');
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(200);
  s = await st();
  const push = s.templates.find((t) => t.name === 'Push + Quads');
  check(`edited day saved (${push.exercises.map((e) => e.name + ' ' + e.sets).join(', ')})`, push.exercises[0].name === 'Hack squat' && push.exercises[3].sets === 2 && push.exercises[6]?.name === 'Calf raise');
  await pg.locator('.dcard', { hasText: 'Push + Quads' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  check('starting it uses your version', /Hack squat/.test(await pg.locator('.tile.cur').innerText()) && /Calf raise/.test(await pg.locator('.tile.plan').innerText()));
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
