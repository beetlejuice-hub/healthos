// The feelings slider (owner, 2 Oct: replace the big 1–10 grid with "a slider, nice and creative"):
// tap, drag with a live bubble, one save per drag, a vertical swipe never rates, keys work.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const [w, h] of [[390, 844], [1180, 820]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date('2026-10-02T09:00:00') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    const feels = async () => (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).entries?.filter((e) => e.kind === 'feel') ?? [];
    const sl = (n) => pg.locator(`#feel [role=slider][data-name="${n}"]`);
    const at = async (n, v) => { const bb = await sl(n).boundingBox(); return [bb.x + ((v - 1) / 9) * bb.width, bb.y + bb.height / 2]; };
    const card = await pg.locator('#feel').boundingBox();
    if (w === 390) check(`compact: the card is ${Math.round(card.height)} px tall with sleep (grid was ~430)`, card.height < 330);

    // A vertical swipe that starts on a slider scrolls; it doesn't rate.
    let [x, y] = await at('energy', 3);
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 3, y + 40, { steps: 4 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    check('a vertical swipe over a slider rates nothing', (await feels()).length === 0);

    // Drag energy from 2 to 8: a bubble while dragging, one saved value at the end.
    [x, y] = await at('energy', 2); const [x8] = await at('energy', 8);
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 30, y, { steps: 3 });
    await pg.mouse.move(x8, y, { steps: 6 });
    const bubble = await pg.locator('#feel .fs-bubble').innerText().catch(() => '');
    check(`dragging shows the word in a bubble (${bubble})`, bubble === 'steady');
    check('nothing saved mid-drag', (await feels()).length === 0);
    if (w === 390) await pg.screenshot({ path: OUT + 'slider-drag.png' });
    await pg.mouse.up(); await pg.waitForTimeout(200);
    let f = await feels();
    check('released at 8 → one check-in, energy 8', f.length === 1 && f[0].energy === 8);

    // Tap, and keys.
    await rate(pg, 'stress', 3); await pg.waitForTimeout(150);
    await sl('mood').focus(); await pg.keyboard.press('End'); await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(150);
    f = await feels();
    check('tap sets stress 3; End then ← sets mood 9; still one check-in', f.length === 1 && f[0].stress === 3 && f[0].mood === 9);
    await rate(pg, 'sleep', 7); await pg.waitForTimeout(150);
    const sleep = ((await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')))).entries || []).filter((e) => e.kind === 'sleep');
    check('the sleep slider saves last night', sleep.length === 1 && sleep[0].rating === 7);
    await pg.locator('#feel').screenshot({ path: OUT + `slider-${w}.png` });
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
