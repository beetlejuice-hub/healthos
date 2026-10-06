const { chromium, APP, OUT, handle } = require('./harness.cjs');
// Your own split: edit a day, add a day, up next, quick workout, add/swap in a session, history, note.
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  pg.on('dialog', (d) => d.accept());
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(200);
  const tiles = () => pg.locator('.dcard h2').allTextContents();
  const listOf = async (name) => { const c = pg.locator('.dcard', { hasText: name }); return (await c.locator('.dlist li span').count()) ? (await c.locator('.dlist li span').allInnerTexts()).join(' · ') : c.locator('.dex').innerText(); };

  check('new account: starts on the owner\'s plan, Push + Quads up next', JSON.stringify(await tiles()) === '["Push + Quads","Pull + Hamstrings","Mixed"]' && await pg.locator('.dcard.next').count() === 1);

  // Edit Push + Quads → "Push": rename, remove one, add one, reorder.
  await pg.locator('.dcard').first().getByRole('button', { name: /^Edit/ }).click();
  await pg.getByLabel('Name').fill('Push');
  await pg.getByRole('button', { name: 'Remove Leg extension' }).click();
  await pg.getByRole('button', { name: '+ Add exercise' }).click();
  const n = await pg.locator('.exname').count();
  await pg.getByLabel(`Exercise ${n}`).fill('Dips');
  await pg.locator('.exed').nth(n - 1).getByRole('button', { name: 'Move up' }).click();
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(150);
  check('renamed day saved with its new exercises', await listOf('Push') === 'Squat · DB bench press · DB shoulder press · Lateral raise · Dips · Rope pushdown');

  // Validation, then a new day.
  await pg.getByRole('button', { name: '+ New day' }).click();
  await pg.getByRole('button', { name: 'Save day' }).click();
  check('empty day explains what is missing', /Give the day a name\.[\s\S]*Add at least one exercise\./.test(await pg.locator('.kprob').innerText()));
  await pg.getByLabel('Name').fill('Arms');
  await pg.getByRole('button', { name: '+ Add exercise' }).click(); await pg.getByLabel('Exercise 1').fill('Hammer curl');
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(150);
  check('new day appears', (await tiles()).includes('Arms'));
  await pg.screenshot({ path: OUT + 'w-pick.png', fullPage: true });

  // Start Push: swap the first exercise, log a set, add one, see history and write a note.
  await pg.locator('.dcard').filter({ hasText: 'Push' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: 'Swap' }).click(); await pg.getByLabel('Exercise to add').fill('Hack squat'); await pg.locator('.addex').getByRole('button', { name: 'Swap', exact: true }).click();
  check('swap renames today\'s exercise', /Hack squat/.test(await pg.locator('.tile.cur .ex').innerText()));
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(100);
  check('no swap once a set is logged', await pg.locator('.exacts').getByRole('button', { name: 'Swap' }).count() === 0);
  await pg.locator('.tile.plan').getByRole('button', { name: '+ Add exercise' }).click();
  await pg.getByLabel('Exercise to add').fill('Face pull'); await pg.locator('.addex').getByRole('button', { name: 'Add' }).click();
  check('added exercise becomes current', /Face pull/.test(await pg.locator('.tile.cur .ex').innerText()));
  await pg.getByLabel('How did it feel?').fill('Strong today');
  await pg.getByRole('button', { name: 'Log set' }).click();
  await pg.getByRole('button', { name: 'Finish early…' }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(200);
  const pick = await pg.locator('.cockpit').innerText();
  check('saved split is unchanged by today\'s swap/add', await listOf('Push') === 'Squat · DB bench press · DB shoulder press · Lateral raise · Dips · Rope pushdown' && !/Face pull/.test(await listOf('Push')));
  check('note shows in Recent', /“Strong today”/.test(pick));
  check('up next moved on to the day after Push', (await tiles())[0] === 'Pull + Hamstrings');

  // History on the next time.
  await pg.locator('.dcard').filter({ hasText: 'Push' }).getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: 'Swap' }).click(); await pg.getByLabel('Exercise to add').fill('Hack squat'); await pg.locator('.addex').getByRole('button', { name: 'Swap', exact: true }).click();
  await pg.getByRole('button', { name: 'History' }).click();
  check('history shows last session', /\d+×\d+/.test(await pg.locator('.hist').innerText()));
  await pg.screenshot({ path: OUT + 'w-session.png', fullPage: true });
  await pg.getByRole('button', { name: 'Finish early…' }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(150);

  // Quick workout without a plan.
  await pg.getByRole('button', { name: 'Quick workout' }).click(); await pg.waitForTimeout(150);
  await pg.getByRole('button', { name: '+ Add exercise' }).click(); await pg.getByLabel('Exercise to add').fill('Pull-ups'); await pg.locator('.addex').getByRole('button', { name: 'Add' }).click();
  check('quick workout: first exercise added and ready', /Pull-ups/.test(await pg.locator('.tile.cur .ex').innerText()));
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.getByRole('button', { name: 'Finish early…' }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(150);
  check('a quick workout doesn\'t break the rotation', (await tiles())[0] === 'Pull + Hamstrings');

  // Delete a day.
  await pg.locator('.dcard').filter({ hasText: 'Arms' }).getByRole('button', { name: /^Edit/ }).click();
  await pg.getByRole('button', { name: 'Delete this day' }).click(); await pg.waitForTimeout(100);
  check('day deleted', !(await tiles()).includes('Arms'));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
