// Settings → Start over: everything goes — server, this device, and another device that was offline
// with an unsent change — and the engines start from nothing. (Owner, 1 Oct: "make sure it actually
// resets from calculations etc".)
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const ME = 'u-me', EMAIL = 'lukacsarnold9@gmail.com';
const mine = (t) => [...tables[t].values()].filter((r) => r.user_id === ME);
const local = (pg) => pg.evaluate((uid) => JSON.parse(localStorage.getItem(`healthos.v1:${uid}`) || '{}'), ME);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const device = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', EMAIL); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    return { ctx, pg };
  };
  const weigh = async (pg, kg) => { await pg.goto(APP + '#log/body'); await pg.getByLabel('kg', { exact: true }).fill(kg); await pg.getByRole('button', { name: 'Log weight' }).click(); await pg.waitForTimeout(1500); };

  // Phone: some data, a changed goal, and a dismissed card kept outside the state.
  const phone = await device();
  await weigh(phone.pg, '80.4');
  await phone.pg.goto(APP + '#log/drink'); await phone.pg.getByLabel('Find a drink').fill('espresso'); await phone.pg.getByRole('button', { name: /^Espresso/ }).first().click(); await phone.pg.waitForTimeout(1500);
  await phone.pg.evaluate(() => localStorage.setItem('healthos.noticed.hidden', 'x'));
  tables.docs.set(`${ME}|ai_usage`, { user_id: ME, key: 'ai_usage', value: { month: '2026-10', calls: 4 }, updated_at: '2026-09-29T12:00:00.000Z' });
  check('phone data reached the server', mine('entries').length === 2);

  // Laptop: syncs it, then goes offline with an edit of its own queued.
  const laptop = await device();
  await laptop.pg.waitForTimeout(1500);
  check('laptop has the phone\'s data', (await local(laptop.pg)).entries?.length === 2);
  const SB = 'https://ubfvaewfdbmecowoeuni.supabase.co/**';
  await laptop.ctx.unroute(SB); await laptop.ctx.route(SB, (r) => r.abort('internetdisconnected'));
  await weigh(laptop.pg, '79.9');
  check('laptop holds an unsent weigh-in', (await local(laptop.pg)).entries?.length === 3 && mine('entries').length === 2);

  // Phone: Settings → Start over.
  await phone.pg.goto(APP + '#settings');
  const card = phone.pg.locator('.card.reset');
  await card.getByRole('button', { name: 'Reset all data…' }).click();
  const del = card.getByRole('button', { name: 'Delete everything' });
  check('needs the typed word', await del.isDisabled());
  await card.getByLabel('Type RESET to confirm').fill('reset');
  await phone.pg.screenshot({ path: OUT + 'reset-confirm.png', fullPage: true });
  await del.click();
  await phone.pg.waitForSelector('text=Everything\'s deleted', { timeout: 5000 }).catch(() => {});
  check('says it\'s done', await card.getByText(/Everything's deleted/).count() === 1);
  check('server: no entries left', mine('entries').length === 0);
  check('server: only the reset marker and the AI cost record remain', JSON.stringify(mine('docs').map((d) => d.key).sort()) === '["ai_usage","reset"]');
  const p = await local(phone.pg);
  check('phone: no entries, default goals, empty memos', p.entries?.length === 0 && Object.keys(p.scout || {}).length === 0 && (p.ai?.chat || []).length === 0);
  check('no stale Undo offered after the reset', await phone.pg.getByRole('button', { name: 'Undo' }).count() === 0);
  check('phone: device-only keys cleared too', await phone.pg.evaluate(() => localStorage.getItem('healthos.noticed.hidden')) === null);

  // The engines start from nothing: Today has no caffeine, Body has no weigh-ins.
  await phone.pg.goto(APP + '#today'); await phone.pg.waitForTimeout(300);
  check('Today: no caffeine counted', /Caffeine\s*0\s*mg/i.test(await phone.pg.locator('.t2-status').innerText()));
  await phone.pg.screenshot({ path: OUT + 'reset-today.png', fullPage: true });

  // Laptop back online: it sees the reset before sending, so its queued weigh-in never goes up.
  await laptop.ctx.unroute(SB); await laptop.ctx.route(SB, handle);
  await laptop.pg.goto(APP + '#today'); await laptop.pg.reload(); await laptop.pg.waitForSelector('text=Settings'); await laptop.pg.waitForTimeout(2000);
  check('laptop: wiped itself', (await local(laptop.pg)).entries?.length === 0);
  check('server: the stale weigh-in did not come back', mine('entries').length === 0);

  // And the account works normally afterwards, on both.
  await weigh(laptop.pg, '78.0');
  await phone.pg.reload(); await phone.pg.waitForSelector('text=Settings'); await phone.pg.waitForTimeout(1500);
  check('after the reset, new data syncs as usual', mine('entries').length === 1 && (await local(phone.pg)).entries?.length === 1);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
