// The workout screen, 14 Oct (PLAN 94; owner: "Can take out heartrate btw from workout screen", "Add more exercise options so
// i can change if i dont wanna do an exericse or machine is used", "Add leg pushing machine", "when typing it should appear
// not make a completely new exercise thats the same", "Should be able to start cardio even when not done w all exercises").
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  pg.on('dialog', (d) => d.accept());
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(200);
  const cur = () => pg.locator('.tile.cur .ex b').innerText();
  const options = () => pg.locator('.exp-list button').evaluateAll((els) => els.map((e) => [e.querySelector('b').textContent, e.querySelector('small').textContent, e.getAttribute('aria-selected')]));
  const width = () => pg.evaluate(() => document.documentElement.scrollWidth);

  await pg.locator('.dcard', { hasText: 'Push + Quads' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  check(`no heart-rate tile on the workout screen (${(await pg.locator('.cockpit').innerText()).match(/heart rate|bpm/i) ?? 'none'})`, !/heart rate|bpm|connect the band/i.test(await pg.locator('.cockpit').innerText()));

  // swap the squat: every same-muscle exercise, and typing finds the leg press by the owner's words
  await pg.locator('.exacts').getByRole('button', { name: 'Swap' }).click();
  const chips = await pg.locator('.addex .picks button').allInnerTexts();
  check(`swap: all the quad exercises, machines too (${chips.length}: ${chips.join(', ')})`, chips.length >= 8 && chips.includes('Leg press') && chips.includes('Pendulum squat') && !chips.includes('Leg extension'));
  await pg.getByLabel('Exercise to add').fill('leg push'); await pg.waitForTimeout(100);
  const legs = await options();
  check(`typing "leg push": the leg press first, with its muscle (${legs.map((o) => o[0]).join(', ')})`, legs[0] && legs[0][0] === 'Leg press' && /quads/.test(legs[0][1]));
  const btn = await pg.locator('.addex .kbtn.pri').innerText();
  check(`the button says what it takes — the leg press, not a new "leg push" (${btn})`, /^Swap → Leg press$/i.test(btn.trim()));
  await pg.locator('.addex').screenshot({ path: OUT + 'workoutpick-swap.png' });
  check(`the box fits a phone (${await width()} px)`, await width() <= 390);
  await pg.locator('.exp-list button', { hasText: 'Leg press' }).first().click(); await pg.waitForTimeout(150);
  check(`tapped: today's squat is now the leg press (${await cur()})`, await cur() === 'Leg press');

  // add by a name written another way: the existing exercise, not a new one
  await pg.locator('.tile.plan').getByRole('button', { name: '+ Add exercise' }).click();
  await pg.getByLabel('Exercise to add').fill('pullups'); await pg.waitForTimeout(100);
  const pu = await options();
  check(`"pullups" is Pull-ups — marked, and no "new exercise" row (${pu.map((o) => o.join('/')).join(', ')})`, pu[0][0] === 'Pull-ups' && pu[0][2] === 'true' && !pu.some((o) => /new exercise/.test(o[1])));
  await pg.getByLabel('Exercise to add').press('Enter'); await pg.waitForTimeout(150);
  check(`Enter adds "Pull-ups", not "pullups" (${await cur()})`, await cur() === 'Pull-ups');
  await pg.locator('.tile.plan').getByRole('button', { name: '+ Add exercise' }).click();
  await pg.getByLabel('Exercise to add').fill('csukló'); await pg.waitForTimeout(100);
  const wr = await options();
  check(`"csukló" finds the wrist work first (${wr.map((o) => o[0]).join(', ')})`, wr[0][0] === 'Wrist curl' && wr[1][0] === 'Reverse wrist curl');
  await pg.getByLabel('Exercise to add').fill('Zercher squat'); await pg.waitForTimeout(100);
  const zs = await options();
  check(`a really new name says so (${zs.map((o) => o.join('/')).join(', ')})`, zs.some((o) => /“Zercher squat”/.test(o[0]) && o[1] === 'new exercise'));
  await pg.locator('.exp-list .exp-new').click(); await pg.waitForTimeout(150);
  check(`…and is added as typed (${await cur()})`, await cur() === 'Zercher squat');

  // cardio before the sets are done
  const row = pg.locator('.tile.plan .cardio-row');
  check(`the day's cardio can start now (${(await row.innerText()).replace(/\n/g, ' ')})`, /20 min stairmaster/.test(await row.innerText()) && await row.getByRole('button', { name: 'Start now' }).count() === 1);
  await row.getByRole('button', { name: 'Start now' }).click(); await pg.waitForTimeout(150);
  const ct = (await pg.locator('.tile.cardio').innerText()).replace(/\n/g, ' ');
  check(`started early: its tile shows, with the sets still planned (${ct})`, /Cardio · started \d\d:\d\d/i.test(ct) && /\d+ sets still planned/.test(ct));
  check('…and the sets are still there to log', await pg.getByRole('button', { name: 'Log set' }).count() === 1);
  // the sets left done after it: still says when it started, not "Then cardio"
  // (only "Next" waits: it ignores a tap within 0.9 s of a set, by design)
  for (let k = 0; k < 40 && await pg.getByRole('button', { name: 'Log set' }).count(); k++) { await pg.getByRole('button', { name: 'Log set' }).click(); const nx = pg.getByRole('button', { name: /^Next:/ }); if (await nx.count()) { await pg.waitForTimeout(950); await nx.click(); } }
  check(`all sets done after the cardio: it still says when it started (${(await pg.locator('.tile.cardio .k').innerText())})`, /Cardio · started \d\d:\d\d/i.test(await pg.locator('.tile.cardio .k').innerText()) && !/still planned/.test(await pg.locator('.tile.cardio').innerText()));
  await pg.locator('.tile.cardio').getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(150);
  check(`cardio done (${(await pg.locator('.tile.cardio').innerText()).replace(/\n/g, ' ')})`, /✓ Done/.test(await pg.locator('.tile.cardio').innerText()));
  const w1 = (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).workouts.find((w) => w.endedAt === null);
  check(`saved: started and done times (${JSON.stringify(w1.cardio)})`, w1.cardio.startedAt > 0 && w1.cardio.done === true && w1.cardio.at >= w1.cardio.startedAt);
  await pg.locator('.tile.cardio').screenshot({ path: OUT + 'workoutpick-cardio.png' });
  await pg.getByRole('button', { name: /^Finish/ }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(200);

  // a new day typed loosely: "pull up" is saved as Pull-ups; no cardio planned → "+ Cardio"
  await pg.getByRole('button', { name: '+ New day' }).click();
  await pg.getByLabel('Name').fill('Back day');
  await pg.getByRole('button', { name: '+ Add exercise' }).click(); await pg.getByLabel('Exercise 1').fill('pull up');
  await pg.getByRole('button', { name: '+ Add exercise' }).click(); await pg.getByLabel('Exercise 2').fill('wrist');
  const wo = await pg.locator('.exed').nth(1).locator('.exp-list button b').allInnerTexts().then((xs) => xs.map((x) => [x]));
  check(`the day editor suggests too (${wo.map((o) => o[0]).join(', ')})`, wo.some((o) => o[0] === 'Wrist curl'));
  await pg.locator('.exp-list button', { hasText: 'Wrist curl' }).first().click();
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(150);
  const day = (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).templates.find((t) => t.name === 'Back day');
  check(`saved as the exercises you have: ${day && day.exercises.map((e) => e.name).join(', ')}`, !!day && day.exercises.map((e) => e.name).join('|') === 'Pull-ups|Wrist curl');
  await pg.locator('.dcard', { hasText: 'Back day' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  await pg.locator('.tile.plan').getByRole('button', { name: '+ Cardio' }).click();
  await pg.locator('.addcardio').getByRole('button', { name: 'Bike' }).click(); await pg.waitForTimeout(150);
  check(`no cardio planned: one tap adds and starts it (${(await pg.locator('.tile.cardio').innerText()).replace(/\n/g, ' ')})`, /Cardio · started/i.test(await pg.locator('.tile.cardio').innerText()) && /Bike/.test(await pg.locator('.tile.cardio').innerText()));
  check(`nothing wider than the phone (${await width()} px)`, await width() <= 390);
  await pg.screenshot({ path: OUT + 'workoutpick.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
