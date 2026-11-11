// Your guess, how sure, your gut (PLAN 210; owner, 11 Nov: "guess sounds good could make a low friction version of it").
// "Try it" on a researched protocol (AI tab): the guess row right under it — one tap saves it and goes. Two finished
// experiments planted with 60 days of check-ins: energy +1.5 during the first (guessed "helps"), nothing during the second
// (guessed "hurts"). Insights → Experiments: how sure for each — 95 %+ it helped; not sure for the other — the guesses
// right and not, and the gut: right 1 of 2. No AI needed (every call fails). On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const START = day(NOW - 28 * D);
  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, START]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = [];
      let x = 3; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
      const g = () => (r() + r() + r() - 1.5) * 1.1;
      for (let i = 60; i >= 1; i--) {
        const d0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)), day = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
        const lift = day >= START && i > 14 ? 1.5 : 0;
        s.entries.push({ id: 'm' + i, kind: 'feel', at: d0.getTime() + 15 * 36e5, mood: Math.round(6 + g() * 0.8), energy: Math.round(Math.min(10, 5.5 + lift + g() * 0.8)), stress: 4, focus: 6 });
      }
      s.ai = { ...(s.ai || {}), digest: { day: '2026-11-11', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], seenAt: now,
        experiments: [
          { id: 'xa', name: 'Morning walk', how: '20 min outside before 9', days: 14, measure: 'energy', start: START, guess: 'helps' },
          { id: 'xb', name: 'No screens in bed', how: 'Phone out of the bedroom', days: 14, measure: 'mood', start: START, guess: 'hurts' },
        ],
        researched: [{ key: 'mine:x', area: 'mine', name: 'your own data', title: 'Why evenings show up in your mornings', known: 'Late light delays sleep.', forYou: '', tip: '', found: [], sure: 'moderate',
          protocol: { name: 'Dim lights after 21:00', how: 'Lamps only after 21:00.', days: 14, measure: 'energy' }, at: now - D, day: '2026-11-10', usd: 0.05 }] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, START]);
    await pg.reload(); await pg.waitForTimeout(1000);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(1200);
  const tryIt = pg.getByRole('button', { name: 'Try it for 14 days' }).first();
  await tryIt.click().catch(() => {}); await pg.waitForTimeout(300);
  const row = pg.getByRole('group', { name: 'Your guess for Dim lights after 21:00' });
  check(`right after "Try it": your guess? (${flat(await row.innerText().catch(() => ''))})`, /Your guess\? Helps No change Hurts/.test(flat(await row.innerText().catch(() => ''))));
  await row.getByRole('button', { name: 'Helps' }).click(); await pg.waitForTimeout(300);
  const g = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.find((x) => x.name === 'Dim lights after 21:00')?.guess, KEY);
  check(`one tap saves it and the row goes (${g})`, g === 'helps' && await row.count() === 0);

  await pg.goto(APP + '#insights/training'); await pg.waitForTimeout(1500);
  const sec = pg.locator('#experiments');
  await sec.scrollIntoViewIfNeeded().catch(() => {});
  const li = (n) => sec.locator('.li.exp').filter({ hasText: n });
  const a = flat(await li('Morning walk').innerText().catch(() => '')), bb = flat(await li('No screens in bed').innerText().catch(() => ''));
  const sa = +(await li('Morning walk').locator('.xp-sure').getAttribute('data-sure').catch(() => 'NaN')), sb = +(await li('No screens in bed').locator('.xp-sure').getAttribute('data-sure').catch(() => 'NaN'));
  check(`energy +1.5: how sure 95 %+ it helped (${a.match(/How sure[^.]*?it \w+/)?.[0]})`, sa >= 95 && /How sure (9\d) % it helped/.test(a) && !/100 %/.test(a));
  check(`nothing planted: not sure either way (${sb} · ${bb.match(/How sure[^)]*\)/)?.[0]})`, sb > 20 && sb < 80 && /How sure not sure either way \(\d+ % it helped\)/.test(bb));
  check(`your guesses: right, then not (${a.match(/You guessed[^—]*— [^ ]+ \w+/)?.[0]} · ${bb.match(/You guessed[^—]*— [^ ]+ \w+/)?.[0]})`, /You guessed helps — ✓ right/.test(a) && /You guessed hurts — ✗ not this time/.test(bb));
  check(`your gut so far (${flat(await sec.locator('.xp-gut').innerText().catch(() => ''))})`, flat(await sec.locator('.xp-gut').innerText().catch(() => '')) === 'Your gut so far: right 1 of 2.');
  await sec.screenshot({ path: OUT + 'guess-1280.png' });
  await ctx.close();

  ({ ctx, pg } = await open(390));
  await pg.goto(APP + '#insights/training'); await pg.waitForTimeout(1500);
  await pg.locator('#experiments').scrollIntoViewIfNeeded().catch(() => {});
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('#experiments').screenshot({ path: OUT + 'guess-390.png' }).catch(() => {});
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
