// The master graph, owner's pick (2 Oct): D (instrument panel) with feelings drawn as A — dots at real
// check-ins, joined only within hours, notes readable by pointing at them; an overview to move through time.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const [vw, vh] of [[1280, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date('2026-10-03T12:00:00') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), es = []; let n = 0;
      const D = (d, h, m = 0) => new Date(2026, 9, 3 - d, h, m).getTime();
      for (let d = 20; d >= 0; d--) {
        es.push({ id: 'c' + n++, kind: 'drink', at: D(d, 8, 10), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
        es.push({ id: 'm' + n++, kind: 'food', at: D(d, 13), name: 'Lunch', grams: 400, macros: { kcal: 750, p: 40, c: 80, f: 25 } });
        es.push({ id: 's' + n++, kind: 'sleep', at: D(d, 7, 45), rating: 5 + (d % 4) });
        if (d > 0) es.push({ id: 'f' + n++, kind: 'feel', at: D(d, 21), energy: 5, mood: 7, stress: 3, doing: ['social'] });
        es.push({ id: 'f' + n++, kind: 'feel', at: D(d, 10), energy: 7, mood: 6, stress: 4 });
        if (d === 1) es.push({ id: 'f' + n++, kind: 'feel', at: D(d, 15), energy: 4, mood: 4, stress: 8, doing: ['work'], note: 'deadline at work' });
      }
      s.entries = es; localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#insights'); await pg.reload(); await pg.waitForSelector('.master'); await pg.waitForTimeout(400);
    const cv = pg.locator('.mg-canvas');
    const lanes = (await cv.getAttribute('data-lanes')).split(',');
    check(`[${vw}] one How you felt lane, first (${lanes.join(' ')})`, lanes[0] === 'feel' && lanes.includes('slept') && !lanes.some((x) => ['mood', 'energy', 'stress'].includes(x)));
    check(`[${vw}] up close the key explains the ribbon`, /thickness = energy/.test(await pg.locator('.mg-key').innerText()));
    await pg.locator('.master').scrollIntoViewIfNeeded();
    // Point at Thursday 15:00's check-in (mood row; energy is the first feeling → its dot carries the note ring).
    await cv.evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); }); await pg.waitForTimeout(100); // the feeling lanes sit at the top; clear of the pinned bars
    const [t0, t1] = (await cv.getAttribute('data-view')).split(',').map(Number);
    const [ftop, fh] = (await cv.getAttribute('data-feel')).split(',').map(Number);
    const box = await cv.boundingBox(), [LEFT, RIGHT] = (await cv.getAttribute('data-plot')).split(',').map(Number);
    const at = new Date(2026, 9, 2, 15).getTime();
    const x = box.x + LEFT + ((at - t0) / (t1 - t0)) * (box.width - LEFT - RIGHT);
    const y = box.y + ftop + 4 + (fh - 8) - ((4 - 0.5) / 10) * (fh - 8);
    await pg.mouse.move(x, y); await pg.waitForTimeout(150);
    const read = await pg.locator('.readout').innerText();
    check(`[${vw}] pointing at a check-in reads it, note and all`, /Check-in · Fri 2 Oct 15:00/.test(read) && /energy 4 · mood 4 · stress 8/.test(read) && /“deadline at work”/.test(read) && /work/.test(read));
    await pg.locator('.master').screenshot({ path: OUT + `graph-${vw}.png` });
    // Zoomed out, each feeling turns into a daily-average line: the canvas must still draw and the readout still work.
    await pg.getByRole('button', { name: '30D', exact: true }).click(); await pg.waitForTimeout(150);
    check(`[${vw}] past a week the key switches to the life chart`, /above .* or below .* your own average/.test(await pg.locator('.mg-key').innerText()));
    await pg.locator('.master').screenshot({ path: OUT + `graph-30d-${vw}.png` });
    await pg.getByRole('button', { name: '3D', exact: true }).click(); await pg.waitForTimeout(150);
    // Overview: tap near its left edge → the window jumps back toward the start.
    const ov = pg.locator('.mg-overview'), ob = await ov.boundingBox();
    const before = Number((await ov.getAttribute('data-window')).split(',')[0]);
    await pg.mouse.click(ob.x + LEFT + 10, ob.y + ob.height / 2); await pg.waitForTimeout(150);
    const after = Number((await ov.getAttribute('data-window')).split(',')[0]);
    check(`[${vw}] tapping the overview jumps back in time (${new Date(after).toDateString()})`, after < before - 5 * 864e5);
    // Drag the window forward again.
    const [wa, wz] = (await ov.getAttribute('data-window')).split(',').map(Number);
    const ox = (t) => ob.x + LEFT + ((t - new Date(2026, 8, 12).getTime()) / (Date.now() - 0)) * 0; void ox;
    await pg.mouse.move(ob.x + LEFT + 14, ob.y + ob.height / 2); await pg.mouse.down(); await pg.mouse.move(ob.x + ob.width - RIGHT - 5, ob.y + ob.height / 2, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    const end = Number((await ov.getAttribute('data-window')).split(',')[1]);
    check(`[${vw}] dragging the overview window moves the view (${new Date(wa).toDateString()} → ends ${new Date(end).toDateString()})`, end > wz + 5 * 864e5);
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
