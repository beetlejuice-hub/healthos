const { chromium, APP, OUT, handle } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Before About me: black seed has no condition to be checked against.
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(200);
  check('without About me, stack shows no known link', await pg.locator('.sbadge').filter({ hasText: 'No known link' }).count() === 5);

  // About me: psoriasis, recognised as you type.
  await pg.goto(APP + '#settings');
  await pg.getByLabel('Conditions').fill('pikkelysömör');
  check('condition recognised in Hungarian', await pg.getByText('Recognised: Psoriasis').count() === 1);
  await pg.getByLabel('Conditions').press('Enter');
  await pg.getByLabel('Medications').fill('Xyzzamab');
  check('unknown medication is said out loud', await pg.getByText(/Not in the checked list yet/).count() === 1);
  await pg.getByLabel('Medications').fill('Otezla'); await pg.locator('#about .tags').nth(1).getByRole('button', { name: 'Add' }).click();
  await pg.locator('#about').screenshot({ path: OUT + 'sc-about.png' });

  // Log a beer so alcohol is checked.
  await pg.goto(APP + '#log/drink'); await pg.getByRole('button', { name: /Beer/ }).first().click(); await pg.waitForTimeout(150);

  // Stack badges.
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(200);
  const badge = (i) => pg.locator('.sbadge').nth(i).innerText();
  check('black cumin: black seed + Otezla caution', /Caution/.test(await badge(2)));
  check('vitamin D: mixed evidence', /Mixed evidence/.test(await badge(1)));
  await pg.locator('.sbadge').nth(2).getByRole('button').click();
  check('tapping shows reason, grade and source', /CYP450/.test(await badge(2)) && /Evidence: theoretical · reviewed 2026-09-30 · to verify/.test(await badge(2)));
  // Warning while adding.
  await pg.getByRole('button', { name: '+ Add supplement' }).click();
  await pg.locator('.field input').filter({ hasText: '' }).nth(0);
  const names = pg.getByLabel('Name'); const n = await names.count();
  await names.nth(n - 1).fill("St John's wort");
  check('typing St John\'s wort warns before you take it', /Avoid/.test(await pg.locator('.sbadge').nth(n - 1).innerText()));
  await pg.screenshot({ path: OUT + 'sc-stack.png', fullPage: true });

  // Today: red only.
  await pg.goto(APP + '#today'); await pg.waitForTimeout(300);
  check('Today shows the avoid alert', /St John's wort \+ Otezla: avoid combining/.test(await pg.locator('.noticed-line.alert').innerText()));
  await pg.screenshot({ path: OUT + 'sc-today.png' });
  await pg.locator('.noticed-line.alert').click(); await pg.waitForTimeout(800);
  const panel = await pg.locator('#stackcheck').innerText();
  check('Insights panel lists reds first', /Avoid[\s\S]*Caution[\s\S]*Mixed evidence/.test(panel));
  check('panel: alcohol + psoriasis caution', /Alcohol \+ pikkelysömör/.test(panel));
  check('panel: coffee checked, no link', /Checked, no link found: Coffee \/ caffeine/.test(panel) || !/Coffee/.test(panel));
  check('panel: worth asking about fish oil and vitamin D test', /Fish oil doesn't work on its own/.test(panel) && /vitamin D blood test/.test(panel));
  await pg.setViewportSize({ width: 1440, height: 900 }); await pg.waitForTimeout(300);
  await pg.locator('#stackcheck').screenshot({ path: OUT + 'sc-panel.png' });

  // Remove the risky one: alert disappears.
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: 'Remove' }).last().click();
  await pg.goto(APP + '#today'); await pg.waitForTimeout(300);
  check('removing it clears the alert', await pg.locator('.noticed-line.alert').count() === 0);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
