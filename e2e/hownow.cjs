// How now? — the check-in at the top of Today: 1–10 taps, what you were up to (pre-ticked from logs,
// your own word), the small reward, then one calm line until it asks again ~2 h later.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T13:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const local = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const feels = async () => ((await local()).entries || []).filter((e) => e.kind === 'feel');

  // 13:00 — the first check-in: top of Today, a tap per feeling.
  const box = await pg.locator('#feel').boundingBox();
  check('How now? sits near the top of Today', box && box.y < 260);
  await pg.getByRole('button', { name: 'mood 4', exact: true }).click();
  await pg.getByRole('button', { name: 'stress 7', exact: true }).click();
  await pg.waitForTimeout(250);
  let f = await feels();
  check('two taps → one check-in with exactly mood 4 and stress 7', f.length === 1 && f[0].mood === 4 && f[0].stress === 7 && f[0].energy == null);
  check('shows the words: 4 · flat, 7 · high', /4 · flat/.test(await pg.locator('#feel').innerText()) && /7 · high/.test(await pg.locator('#feel').innerText()));
  await pg.getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(150);
  check('Done → one calm line', /Rated 13:00 · mood 4 · stress 7/.test(await pg.locator('#feel').innerText()) && await pg.locator('#feel .hn-nums').count() === 0);

  // A gym session at 15:00, logged.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.workouts = [...(s.workouts || []), { id: 'gw', template: 'Upper A', startedAt: new Date('2026-10-02T15:00:00').getTime(), endedAt: new Date('2026-10-02T16:00:00').getTime() }]; localStorage.setItem(k, JSON.stringify(s)); });
  // 17:10 — more than 2 h later: it asks again.
  await pg.clock.setFixedTime(new Date('2026-10-02T17:10:00')); await pg.reload(); await pg.waitForSelector('text=Settings');
  check('2 h later it asks again (rows open, last values shown faintly)', await pg.locator('#feel .hn-nums').count() === 4 && /was 4/.test(await pg.locator('#feel').innerText()));
  await pg.getByRole('button', { name: 'mood 8', exact: true }).click();
  await pg.getByRole('button', { name: 'stress 3', exact: true }).click(); await pg.waitForTimeout(250);
  const tags = pg.getByRole('group', { name: 'What were you up to' });
  check('gym pre-ticked from the logged workout', await tags.getByRole('button', { name: 'gym', exact: true }).getAttribute('aria-pressed') === 'true');
  check('not cluttered: at most 6 tags + "more"', await tags.locator('button').count() <= 7);
  await tags.getByRole('button', { name: 'outside', exact: true }).click();
  await tags.getByRole('button', { name: /more|your own/ }).click();
  await pg.getByLabel('Your own, one word').fill('Sauna time'); await pg.getByRole('button', { name: 'Add', exact: true }).click(); await pg.waitForTimeout(200);
  f = await feels();
  const latest = f.sort((a, z) => z.at - a.at)[0];
  check(`what you were up to saved (${(latest.doing || []).join(', ')})`, ['gym', 'outside', 'sauna'].every((t) => (latest.doing || []).includes(t)));
  const reward = await pg.locator('.hn-reward').innerText();
  check(`the small reward: changes since 13:00 and what was in between (${reward})`, /Since 13:00: mood \+4, stress −4 · .*the gym/.test(reward) && /time outside/.test(reward) && /sauna/.test(reward));
  check('progress toward the engine', /1 of 8 check-in pairs/.test(await pg.locator('#feel').innerText()));
  await pg.screenshot({ path: OUT + 'hownow-open.png', fullPage: false });

  // Owner, 2 Oct: the log should say what you were up to, your own word included.
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(150);
  check('the log line names what you were up to, your own word too', /mood 8 · stress 3 · [^\n]*gym[^\n]*sauna/.test(await pg.locator('text=Logged today').locator('..').innerText()));
  const tabBg = await pg.evaluate(() => getComputedStyle(document.querySelector('nav.tabs')).backgroundColor);
  check(`the tab bar is solid, not see-through (${tabBg})`, /^rgb\(/.test(tabBg));
  await pg.goto(APP + '#today'); await pg.waitForTimeout(150);
  // Untick works; own word comes back first next time (most used).
  await tags.getByRole('button', { name: 'gym', exact: true }).click(); await pg.waitForTimeout(150);
  f = await feels();
  check('untick removes it', !(f.sort((a, z) => z.at - a.at)[0].doing || []).includes('gym'));

  // Insights reads the stress line too (the log line shows stress).
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(200);
  check('log line shows mood and stress', /mood 8 · stress 3/.test(await pg.locator('body').innerText()));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
