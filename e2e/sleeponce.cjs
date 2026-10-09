// Owner, 9 Oct: "i logged my sleep score (1-10) at start of day now it asks again when i click log again (mental)".
// Last night's sleep is asked once a morning: once rated, "Rate again" opens the feelings only, with last night's
// rating as one line you can tap to change — never the sleep question again.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-09T07:30:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const saved = async (k) => (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).entries?.filter((e) => e.kind === k) ?? [];
  const sl = (n) => pg.locator(`#feel [role=slider][data-name="${n}"]`);
  const tap = async (n, v) => { const bb = await sl(n).boundingBox(); await pg.mouse.click(bb.x + ((v - 1) / 9) * bb.width, bb.y + bb.height / 2); await pg.waitForTimeout(200); };

  // 07:30: the morning card asks about last night, and how you feel.
  check('morning: the card asks about last night', await sl('sleep').count() === 1);
  await tap('sleep', 7); await tap('mood', 6);
  check('sleep 7 and mood 6 saved', (await saved('sleep'))[0]?.rating === 7 && (await saved('feel'))[0]?.mood === 6);

  // 08:10, back to log how you feel again (mental): the sleep question isn't asked a second time.
  await pg.clock.setSystemTime(new Date('2026-10-09T08:10:00')); await pg.reload(); await pg.waitForSelector('#feel');
  await pg.getByRole('button', { name: 'Rate again' }).click(); await pg.waitForTimeout(200);
  check('"Rate again" after rating sleep: the feelings, not the sleep question again', await sl('mood').count() === 1 && await sl('sleep').count() === 0);
  const line = await pg.locator('#feel .hn-slept').innerText().catch(() => '');
  check(`…last night's rating shows as one line instead (${line})`, /Last night\s*7\s*\/\s*10/.test(line));
  await pg.locator('#feel').screenshot({ path: OUT + 'sleeponce-again.png' });
  // It can still be changed, on purpose.
  await pg.getByRole('button', { name: /change last night/i }).click(); await pg.waitForTimeout(150);
  check('tapping it opens the sleep slider to change it', await sl('sleep').count() === 1);
  await tap('sleep', 5);
  const s = await saved('sleep');
  check(`changing it updates the one rating, no second one (${s.map((x) => x.rating).join(', ')})`, s.length === 1 && s[0].rating === 5);

  // Next morning, nothing rated yet: asked again — it's a new night.
  await pg.clock.setSystemTime(new Date('2026-10-10T07:45:00')); await pg.reload(); await pg.waitForSelector('#feel');
  check('the next morning asks about the new night', await sl('sleep').count() === 1);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
