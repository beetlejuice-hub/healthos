// Your own tips (owner, 28 Oct: "i will type anything in the box on today, things like music helps me focus, exercise
// clears my head, etc - whenever my focus is low it should recommend to put on my focus music"). 14:00, the real path: he
// types it in "Noticed something?"; a check-in with focus 7 suggests nothing; focus 3 brings "Focus 3 — what you said
// helps" first in "For you", both his tips in his words; "Doing it" on music is kept as an answer and the ask goes; Undo
// brings it back. Later he types "music doesn't help me focus anymore": the next low check-in offers exercise only. The AI
// is told his tips. 320 px fits.
const { chromium, APP, OUT, handle, rate, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const width of [390, 320]) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date('2026-10-28T14:00:00').getTime() });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.supplements = []; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(300);
    const ask = pg.getByRole('region', { name: 'Your own tip' }), cur = pg.locator('.fy-item[data-current]');
    const store = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries, KEY);
    // a new check-in, as he'd do it: "Rate again" once one's in (How now? shrinks to a line after rating)
    const checkIn = async (v) => { const again = pg.getByRole('button', { name: 'Rate again' }); if (await again.count()) { await again.click(); await pg.waitForTimeout(150); } await rate(pg, 'focus', v); await pg.waitForTimeout(400); };
    const say = async (t) => { await pg.getByLabel('Something you noticed').fill(t); await pg.getByLabel('Something you noticed').press('Enter'); await pg.waitForTimeout(300); };

    await say('music helps me focus, exercise clears my head');
    await checkIn(7);
    check(`${width}: focus 7 — nothing suggested`, await ask.count() === 0);
    await pg.clock.fastForward('00:30:00'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(300);
    await checkIn(3);
    const t = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`${width}: focus 3 — his tips, first in "For you" (${t})`, await cur.getAttribute('data-key').catch(() => '') === 'tip' && await ask.isVisible()
      && /^Focus 3 what you said helps/i.test(t) && /“?music helps me focus”?.*Doing it.*“?exercise clears my head”?.*Doing it/.test(t));
    check(`${width}: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= width);
    if (width === 390) await ask.screenshot({ path: OUT + 'tips-ask.png' });
    else { await ask.screenshot({ path: OUT + 'tips-ask-320.png' }); await ctx.close(); continue; }

    await ask.locator('li', { hasText: 'music' }).getByRole('button', { name: 'Doing it' }).click(); await pg.waitForTimeout(250);
    const did = (await store()).filter((e) => e.kind === 'answer' && e.key.startsWith('tip:'));
    check(`"Doing it" kept as an answer (${did.map((e) => `${e.key}: ${e.question} → ${e.answer}`).join(' | ')})`, did.length === 1 && did[0].key === 'tip:music' && did[0].question === 'Focus 3 — your tip: "music helps me focus"' && did[0].answer === 'doing it');
    check('…and the ask goes', await ask.count() === 0);
    await pg.getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(250);
    check('Undo brings it back', await ask.count() === 1 && (await store()).filter((e) => e.kind === 'answer').length === 0);

    // said the other way later: dropped; the next low check-in offers exercise only
    await say("music doesn't help me focus anymore");
    await pg.clock.fastForward('01:00:00'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(300);
    await checkIn(2);
    const t2 = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`"music doesn't help me focus anymore" — only exercise now (${t2})`, /exercise clears my head/.test(t2) && !/music/.test(t2));

    await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
    await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
    const seen = await pg.locator('.ctx').innerText().catch(() => '');
    check(`the AI is told his tips (${(seen.match(/## What helps me[^\n]*\n(- [^\n]*\n?)*/) || [''])[0].replace(/\n/g, ' | ')})`, /## What helps me, in my own words[^\n]*\n- focus: "exercise clears my head"/.test(seen) && !/- focus: "music helps me focus"/.test(seen));
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
