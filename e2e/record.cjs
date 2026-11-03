// The app's track record (PLAN 188 phase 3; owner, 3 Nov: "the app should find these connections autonomusly and then start
// tracking them, and see if it was right or no"; the canvas's A, on each card). 90 days where two beers one evening go with
// a low mood the next day (planted, as in leads.cjs). The record holds the lead, said 45 days ago — on the days since, it
// held — and a contrary claim said then too ("after a drinking day, mood is higher"), which didn't. Leads opens with the
// score, the lead card says how it did, the one that didn't hold is in a fold; Noticed's finding joins the record today
// and says it's checking. Then the lead's own record turned the wrong way: it leaves Leads for the fold. 390 px.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-27T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SAID = ymd(NOW - 45 * D);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const lead = { id: 'lead:alc~feel', from: 'lead', text: 'Alcohol and next-day mood move opposite ways', said: SAID, x: 'alcohol', y: 'mood', lag: 1, sign: -1 };
  const contrary = { id: 'lead:alc~mood-up', from: 'lead', text: 'After a drinking day, mood tends to be higher', said: SAID, x: 'alcohol', y: 'mood', lag: 1, sign: 1 };
  await pg.evaluate(([k, now, D, record]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
    let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let drank = false;
    for (let i = 90; i >= 1; i--) {
      const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
      s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 18 * 36e5, mood: Math.max(1, Math.min(10, Math.round(7 + (r() - 0.5) * 2 - (drank ? 2.5 : 0)))), energy: 6 });
      s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
      drank = r() < 0.3;
      if (drank) s.entries.push({ id: 'b' + i, kind: 'drink', at: day0 + 21 * 36e5, name: 'Beer', ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430 });
    }
    s.ai = { ...(s.ai || {}), digest: null, night: null, chat: [], experiments: [], record };
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, NOW, D, [lead, contrary]]);
  const record = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.record, KEY);
  await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
  await pg.waitForTimeout(800);

  const score = (await pg.locator('#scout .rec-score').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Leads opens with the score of the app's calls (${score})`, /^The app's calls since September: 1 held · \d+ checking · 1 didn't hold$/.test(score));
  const card = (await pg.locator('#scout .scard').filter({ hasText: 'Alcohol and next-day mood' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const line = (card.match(/held Said .*? vs \d\.\d/) || [''])[0];
  check(`the lead's card: said 45 days ago, held on the days since — the drinking days' mood against the rest (${line || card.slice(0, 260)})`, /^held Said Sat 12 Sep · since: \d+ days with more alcohol than usual, \d+ with less — mood \d\.\d vs \d\.\d$/.test(line) && (() => { const m = line.match(/mood (\d\.\d) vs (\d\.\d)/); return m && +m[1] < +m[2] - 1; })());
  await pg.locator('#scout .scard').first().screenshot({ path: OUT + 'record-lead.png' });
  // the one that didn't hold: in the fold, not on the list
  const fold = pg.locator('#scout .rec-gone');
  check(`"Didn't hold · 1", folded (${await fold.locator('summary').innerText().catch(() => '')})`, (await fold.locator('summary').innerText().catch(() => '')) === "Didn't hold · 1" && !(await fold.evaluate((d) => d.open).catch(() => true)));
  await fold.locator('summary').click();
  const gone = (await fold.innerText()).replace(/\s+/g, ' ');
  check(`…opened: the contrary claim, its numbers, probably chance (${gone.slice(0, 170)})`, /After a drinking day, mood tends to be higher didn't hold Said Sat 12 Sep · since: \d+ days with more alcohol than usual, \d+ with less — mood \d\.\d vs \d\.\d — probably chance; it's off the list\./.test(gone));
  check(`…and it isn't a card on the list (${await pg.locator('#scout .scard').filter({ hasText: 'mood tends to be higher' }).count()})`, await pg.locator('#scout .scard').filter({ hasText: 'mood tends to be higher' }).count() === 0);
  await fold.screenshot({ path: OUT + 'record-fold.png' });

  // Noticed's finding joins the record today, and says it's checking
  const kept = await record(), noticed = kept.filter((c) => c.from === 'noticed');
  check(`Noticed's finding is kept from today (${JSON.stringify(noticed.map((c) => [c.id, c.said]))})`, noticed.length >= 1 && noticed.every((c) => c.said === '2026-10-27') && kept.find((c) => c.id === lead.id).said === SAID);
  const nline = (await pg.locator('#noticed .ncard .rec-line').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`…its card: checking on the days since (${nline})`, /^checking Said Tue 27 Oct · checking it on the days since \(0 with, 0 without — 8 of each before it can say\)$/.test(nline));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // best and worst days (Insights → Mind): a clear row joins the record today, and says it's checking (PLAN 188)
  await pg.goto(APP + '#insights/mind'); await pg.waitForSelector('.gl-patterns', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(800);
  const pats = (await record()).filter((c) => c.from === 'pattern');
  const pline = (await pg.locator('.gl-patterns .pt-row.clear .rec-line').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`best/worst days: a clear row kept from today, checking on the days since (${JSON.stringify(pats.map((c) => [c.id, c.said]))} · ${pline})`, pats.length >= 1 && pats.every((c) => c.said === '2026-10-27' && c.cut != null) && /^checking Said Tue 27 Oct · checking it on the days since \(0 (lowest|best) days, 0 others — 5 of each before it can say\)$/.test(pline));
  await pg.locator('.gl-patterns .pt-best').screenshot({ path: OUT + 'record-patterns.png' }).catch(() => {});
  await pg.goto(APP + '#insights/connections'); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});

  // the lead's own record the wrong way: it leaves Leads for the fold
  await pg.evaluate(([k, id]) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.record = s.ai.record.map((c) => (c.id === id ? { ...c, sign: 1 } : c)); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, lead.id]);
  await pg.reload(); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(800);
  check(`a lead that didn't hold leaves the list (${await pg.locator('#scout .scard').filter({ hasText: 'Alcohol and next-day mood' }).count()} cards) for the fold (${await pg.locator('#scout .rec-gone summary').innerText().catch(() => '')})`,
    await pg.locator('#scout .scard').filter({ hasText: 'Alcohol and next-day mood' }).count() === 0 && (await pg.locator('#scout .rec-gone summary').innerText().catch(() => '')) === "Didn't hold · 2");
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
