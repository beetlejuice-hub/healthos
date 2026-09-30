const { chromium, APP, OUT, handle, tables, users } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = []; const out = OUT;
  const device = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(name + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    return pg;
  };
  const login = async (pg, email) => {
    await pg.goto(APP); await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings', { timeout: 5000 });
  };
  const syncNow = async (pg) => { await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: 'Sync', exact: true }).click(); await pg.waitForTimeout(1000); };
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };

  const phone = await device('phone');
  await phone.goto(APP); await phone.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await phone.fill('input[type=password]', 'wrong-pass');
  await phone.getByRole('button', { name: 'Sign in' }).click(); await phone.waitForSelector('.err', { timeout: 4000 }).catch(() => {});
  check('wrong password shows an error', await phone.locator('.err').count() === 1);

  await login(phone, 'lukacsarnold9+healthtest@gmail.com');
  await phone.goto(APP + '#settings');
  check('tester sees Dev tools link', await phone.getByRole('link', { name: 'Dev tools' }).count() === 1);
  await phone.goto(APP + '#dev'); await phone.getByRole('button', { name: '7 days of sample' }).click();
  await phone.goto(APP + '#today'); await phone.getByRole('button', { name: '☆ Set usual drink' }).click(); await phone.getByRole('button', { name: /^Filter coffee/ }).click(); await phone.getByRole('button', { name: '+ Filter coffee' }).click();
  await phone.goto(APP + '#settings'); await phone.getByLabel('kcal', { exact: true }).fill('2450');
  await syncNow(phone);
  const serverEntries = [...tables.entries.values()].filter(r => r.user_id === 'u-test' && !r.deleted).length;
  check(`phone uploaded entries (${serverEntries})`, serverEntries > 50);
  check('phone has nothing left to upload', /up to date/.test(await phone.locator('.stack-row small').first().innerText()));

  const laptop = await device('laptop');
  await login(laptop, 'lukacsarnold9+healthtest@gmail.com'); await laptop.waitForTimeout(1500);
  await laptop.goto(APP + '#log');
  const coffeeOnLaptop = await laptop.locator('.li', { hasText: 'Filter coffee' }).count();
  check(`laptop sees the coffee logged on the phone (${coffeeOnLaptop})`, coffeeOnLaptop >= 1);
  await laptop.goto(APP + '#settings');
  check('laptop has the goal changed on the phone', await laptop.getByLabel('kcal', { exact: true }).inputValue() === '2450');

  await laptop.goto(APP + '#log');
  const before = await laptop.locator('.li', { hasText: 'Filter coffee' }).count();
  await laptop.locator('.li', { hasText: 'Filter coffee' }).last().getByRole('button').click();
  await syncNow(laptop);
  await syncNow(phone);
  await phone.goto(APP + '#log');
  check('delete on laptop reaches the phone', await phone.locator('.li', { hasText: 'Filter coffee' }).count() === before - 1);

  const personal = await device('personal');
  await login(personal, 'lukacsarnold9@gmail.com'); await personal.waitForTimeout(800);
  await personal.goto(APP + '#settings');
  check('personal account has no Dev tools', await personal.getByRole('link', { name: 'Dev tools' }).count() === 0);
  await personal.goto(APP + '#log');
  check("personal account sees none of the tester's data", await personal.locator('.li', { hasText: 'Filter coffee' }).count() === 0);
  await personal.goto(APP + '#dev');
  check('personal account cannot open #dev', await personal.getByText('Dev tools · tester account').count() === 0);

  await phone.goto(APP + '#dev'); await phone.getByRole('button', { name: 'Wipe account…' }).click(); await phone.getByRole('button', { name: /Yes: delete all/ }).click(); await phone.waitForTimeout(1000);
  check('wipe empties the server for the tester only', [...tables.entries.values()].filter(r => r.user_id === 'u-test').length === 0);
  await phone.screenshot({ path: out + 's-dev.png', fullPage: true });
  await phone.goto(APP + '#settings'); await phone.getByRole('button', { name: 'Sign out' }).click(); await phone.waitForTimeout(1200);
  check('sign out returns to the login screen', await phone.getByRole('button', { name: 'Sign in' }).count() === 1);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
