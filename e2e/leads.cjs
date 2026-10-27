// Insights → Leads (PLAN 176 phase 2; owner, 27 Oct: "more likely for graphs and connections between things" — "1 do").
// 90 days where two beers one evening go with a low mood the next day (planted). Findings → Leads: the link is first,
// "strong · tested", drawn over 4 weeks with the drinking days lit; "Ask why" talks to the AI about that one link (it's
// handed the link and its numbers); "Test it" starts "No alcohol — does mood lift?" for 14 days, measured on mood, and the
// button then says it's running. On a phone.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-27T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [], chats = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON();
    if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    chats.push(body);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: { reply: 'Alcohol cuts **REM sleep** in the second half of the night — the usual suspect for a flat next day. [Study](https://example.org/rem)', remember: [] }, usage: null, costUsd: 0.02, model: 'sonnet' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, now, D]) => {
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
    s.ai = { ...(s.ai || {}), digest: { day: '2026-10-27', at: now, greeting: 'Morning.', items: [] }, night: null, chat: [], experiments: [] };
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, NOW, D]);
  await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
  const card = pg.locator('#scout .scard').first();
  const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Leads: the planted link first, strong · tested (${t.slice(0, 120)})`, /^strong · tested Alcohol and next-day mood move opposite ways/i.test(t) && /Held on \d+ of \d+/.test(t));
  const head = (await card.locator('.lc .dc-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const cols = await card.locator('.lc-a .dc-day').count(), lit = await card.locator('.lc-a .dc-day[data-lit]').count();
  check(`drawn over 4 weeks, the drinking days lit (${head}; ${cols} days, ${lit} lit)`, /^alcohol on top · mood, the next day under it · last 28 days$/.test(head) && cols === 28 && lit >= 4);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'leads-card.png' });

  // Ask why
  await card.getByRole('button', { name: 'Ask why' }).click();
  await card.getByRole('button', { name: 'Why might this be?' }).click();
  await card.locator('.ask-reply:not(.typing)').waitFor({ timeout: 5000 }).catch(() => {});
  const c = chats[0];
  check(`"Ask why" goes to the AI with the link and its numbers (${c?.messages.at(-1)?.text})`, /^Re “Alcohol and next-day mood move opposite ways”: Why might this be\?$/.test(c?.messages.at(-1)?.text ?? '') && /## The link this message is about \(Insights → Leads/.test(c?.context ?? '') && /held on \d+ of \d+ days/.test(c?.context ?? ''));
  check('…and the answer shows on the card, its study a real link', /REM sleep/.test(await card.locator('.ask-reply').innerText().catch(() => '')) && await card.locator('.ask-reply a[href="https://example.org/rem"]').count() === 1);
  await card.screenshot({ path: OUT + 'leads-ask.png' });

  // Test it
  await card.getByRole('button', { name: /^Test it: no alcohol, 14 days$/ }).click(); await pg.waitForTimeout(300);
  const xs = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.map((x) => `${x.name} | ${x.how} | ${x.days} | ${x.measure} | ${x.start}`), KEY);
  check(`"Test it" starts the experiment the link points to (${xs.join(' / ')})`, xs.length === 1 && xs[0] === 'No alcohol — does mood lift? | No alcohol at all — not even one | 14 | mood | 2026-10-27');
  check('…and the card says it\'s running', /Testing — see Experiments/.test(await card.innerText()));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
