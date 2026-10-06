// A workout the owner's way (6 Oct: "start set, finish all 3, choose another exercise (from premade or add,
// or choose like same muscle, diff exercise), and then the cardio"). Same screen as before, at phone size.
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
  const curName = async () => (await pg.locator('.tile.cur .ex b').innerText()).trim();
  const logSets = async (n) => { for (let k = 0; k < n; k++) { await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(60); } await pg.waitForTimeout(950); }; // the big button waits a beat before "Next"
  await pg.goto(APP + '#workout'); await pg.waitForSelector('text=Premade workouts');
  check('a new account starts on the plan, cardio shown after each day', /20 min stairmaster/.test(await pg.locator('.dcard', { hasText: 'Push + Quads' }).innerText()) && /20 min incline walk/.test(await pg.locator('.dcard', { hasText: 'Pull + Hamstrings' }).innerText()));
  await pg.locator('.dcard', { hasText: 'Push + Quads' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  check('starts on the first exercise, cardio listed at the end of the session', await curName() === 'Squat' && /Then: 20 min stairmaster/.test(await pg.locator('.tile.plan').innerText()));

  // Squat rack taken: swap, one tap, same muscle.
  await pg.locator('.tile.cur').getByRole('button', { name: 'Swap' }).click();
  const swapTxt = await pg.locator('.addex').innerText();
  check(`swap offers the same muscle in one tap (${swapTxt.split('\n').slice(1, 3).join(' ')})`, /Same muscle \(quads\)/.test(swapTxt) && /Hack squat/.test(swapTxt) && !/Leg extension\n/.test(swapTxt.split('Same muscle')[0]));
  check('…but not what\'s already planned today (leg extension is)', !(await pg.locator('.addex .picks button').allInnerTexts()).includes('Leg extension'));
  await pg.locator('.addex .picks button', { hasText: 'Hack squat' }).click(); await pg.waitForTimeout(150);
  check('tap → swapped', await curName() === 'Hack squat');

  // Owner, 6 Oct: "set the kg, and reps w the + - and it saves so i can just hit log … or keep same and hit again".
  await pg.getByRole('button', { name: 'More weight' }).click(); await pg.getByRole('button', { name: 'More weight' }).click();
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(80);
  const kgNow = await pg.getByRole('textbox', { name: 'Weight in kg' }).inputValue(), repsNow = +(await pg.getByRole('textbox', { name: 'Reps', exact: true }).inputValue());
  await pg.getByRole('button', { name: 'Fewer reps' }).click();
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(80);
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(950);
  const hs = (await st()).entries.filter((e) => e.kind === 'set' && e.exercise === 'Hack squat').map((e) => `${e.kg}x${e.reps}`);
  check(`kg and reps stay set between sets: change, keep, log again (${hs.join(', ')})`, kgNow === '25' && hs.length === 3 && hs[0] === `25x${repsNow}` && hs[1] === `25x${repsNow - 1}` && hs[2] === hs[1]);
  check('3 sets → "Next" plus a pick of the others', /Next: DB bench press/i.test(await pg.locator('.tile.cur').innerText()) && (await pg.locator('.tile.cur .picks button').allInnerTexts()).includes('Lateral raise'));
  await pg.screenshot({ path: OUT + 'session-pick.png' });
  await pg.locator('.tile.cur .picks button', { hasText: 'Lateral raise' }).click(); await pg.waitForTimeout(150);
  check('pick any of them, in any order', await curName() === 'Lateral raise');

  for (let k = 0; k < 5; k++) { await logSets(3); const nx = pg.getByRole('button', { name: /^Next: / }); if (await nx.count()) { await nx.click(); await pg.waitForTimeout(150); } }
  check('everything done → "all planned sets done" and the cardio', await pg.locator('.alldone').count() === 1 && /Then cardio\s*20 min stairmaster/i.test(await pg.locator('.tile.cardio').innerText()));
  check('Next skips what you already did (nothing left, so no Next)', await pg.getByRole('button', { name: /^Next: / }).count() === 0);

  // One more, same muscle as the last exercise.
  await pg.locator('.tile.cur .picks button', { hasText: '+ Add' }).click(); await pg.waitForTimeout(100);
  const last = await curName();
  const addTxt = await pg.locator('.addex').innerText();
  check(`add offers the same muscle as ${last}`, new RegExp(`Same muscle as ${last}`).test(addTxt) && await pg.locator('.addex .picks button').count() >= 1);
  const extra = (await pg.locator('.addex .picks button').allInnerTexts())[0];
  await pg.locator('.addex .picks button').first().click(); await pg.waitForTimeout(150);
  check(`added and on it (${extra})`, await curName() === extra && await pg.locator('.tile.cardio').count() === 0);
  await logSets(3);
  await pg.screenshot({ path: OUT + 'session-cardio.png' });
  await pg.locator('.tile.cardio').getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(150);
  let w = (await st()).workouts.find((x) => x.endedAt === null);
  check('cardio ticked, saved on the workout', w.cardio.what === '20 min stairmaster' && w.cardio.done === true && w.cardio.at > 0 && /✓ Done/.test(await pg.locator('.tile.cardio').innerText()));
  await pg.locator('.tile.cardio').getByRole('button', { name: 'undo' }).click(); await pg.waitForTimeout(150);
  w = (await st()).workouts.find((x) => x.endedAt === null);
  check('undo', w.cardio.done === undefined && await pg.locator('.tile.cardio').getByRole('button', { name: 'Done' }).count() === 1);
  check('the split itself didn\'t change', JSON.stringify((await st()).templates[0].exercises.map((e) => e.name)) === '["Squat","DB bench press","DB shoulder press","Leg extension","Lateral raise","Rope pushdown"]');
  check('nothing scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // The cardio is part of the day you can edit.
  await pg.getByRole('button', { name: /Finish/ }).click(); await pg.waitForTimeout(150);
  const fin = pg.getByRole('button', { name: /^(Finish|Save|Done)/ }).last(); await fin.click().catch(() => {}); await pg.waitForTimeout(300);
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(300);
  if (await pg.locator('.dcard').count()) {
    await pg.locator('.dcard', { hasText: 'Pull + Hamstrings' }).getByRole('button', { name: /^Edit/ }).click();
    await pg.getByLabel('Cardio after (optional)').fill('25 min incline walk');
    await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(200);
    check('cardio after a day is yours to change', (await st()).templates.find((t) => t.name === 'Pull + Hamstrings').cardio === '25 min incline walk' && /25 min incline walk/.test(await pg.locator('.dcard', { hasText: 'Pull + Hamstrings' }).innerText()));
  } else check('back on the split after finishing', false);
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
