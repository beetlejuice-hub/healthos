// How's your body? — chips with how much on the check-in (PLAN 178 phase 2; owner, 28 Oct, picked C on the canvas). On a
// phone: hidden until you're answering (the card stays small — owner, 2 Oct); a slider tapped, they're there; a chip once is
// "a bit" (●), again "a lot" (●●), a third time clears it — all on that one check-in; your own words, two at once ("knee
// pain, cramps and exhausted" → knee pain, cramps, and tired's chip). Done shows it on the one line; a reload keeps it; the Log and the AI say it in words; tomorrow "knee pain" is its
// own chip. Then 90 days of chips: after two beers "weak" a lot 8 times in 10 — Leads says it and its chart reads "a lot";
// control: the same chips at random — no lead about feeling weak. Fits 390 and 320.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-28T15:40:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, seed) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, seed]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
      s.ai = { ...(s.ai || {}), digest: { day: '2026-10-28', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [] };
      if (seed != null) {
        let x = 31; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
        let drank = false;
        for (let i = 90; i >= 1; i--) {
          const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime(), body = {};
          if (seed === 'planted' ? r() < (drank ? 0.8 : 0.06) : r() < 0.25) body.weak = seed === 'planted' ? (drank ? 2 : 1) : (r() < 0.4 ? 2 : 1);
          if (r() < 0.12) body.tired = 1;
          s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 18 * 36e5, mood: Math.max(1, Math.min(10, Math.round(6.5 + (r() - 0.5) * 3))), energy: Math.max(1, Math.min(10, Math.round(6 + (r() - 0.5) * 3))), ...(Object.keys(body).length ? { body } : {}) });
          s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
          drank = r() < 0.3;
          if (drank) s.entries.push({ id: 'b' + i, kind: 'drink', at: day0 + 21 * 36e5, name: 'Beer', ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430 });
        }
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, seed ?? null]);
    await pg.reload(); await pg.waitForSelector('#feel');
    return { ctx, pg };
  }
  const store = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
  // the store saves 150 ms after a burst of taps
  const feels = async (pg) => { await pg.waitForTimeout(250); return (await store(pg)).entries.filter((e) => e.kind === 'feel'); };

  let { ctx, pg } = await open(390);
  const chips = pg.getByRole('group', { name: "How's your body" });
  check('not there until you\'re answering (the card stays small)', await chips.count() === 0);
  await pg.getByRole('slider', { name: 'Energy' }).click();
  const chip = (name) => chips.getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
  const names = (await chips.getByRole('button').allInnerTexts()).map((t) => t.trim());
  check(`the chips, in order (${names.join(' | ')})`, names.join('|') === 'weak|tired|sore|headache|bloated|dizzy|foggy|+ your own');
  await chip('weak').click();
  let f = await feels(pg);
  check(`a tap: weak, a bit, on the open check-in (${JSON.stringify(f.map((x) => x.body))})`, f.length === 1 && f[0].energy != null && JSON.stringify(f[0].body) === '{"weak":1}' && (await chip('weak').getAttribute('data-level')) === '1');
  await chip('weak').click(); await chip('tired').click();
  check(`again: a lot (●●); tired a bit (${(await chip('weak').innerText()).trim()} / ${(await chip('tired').innerText()).trim()})`, (await chip('weak').getAttribute('data-level')) === '2' && /●●$/.test((await chip('weak').innerText()).trim()) && /^tired\s*●$/.test((await chip('tired').innerText()).trim()));
  check('the key shows once something is picked', await pg.getByText('● a bit · ●● a lot · a third tap clears it').count() === 1);
  await chip('weak').click();
  f = await feels(pg);
  check(`a third tap clears it (${JSON.stringify(f[0].body)})`, (await chip('weak').getAttribute('aria-pressed')) === 'false' && JSON.stringify(f[0].body) === '{"tired":1}');
  // undo it all: nothing picked, the check-in keeps its rating and no body at all
  await chip('tired').click(); await chip('tired').click();
  f = await feels(pg);
  check(`cleared to nothing: the check-in has no body left, its energy kept (${JSON.stringify(f[0])})`, f.length === 1 && f[0].body === undefined && f[0].energy != null);
  await chip('tired').click(); await chip('weak').click(); await chip('weak').click();
  await chips.getByRole('button', { name: '+ your own' }).click();
  await pg.getByLabel('How your body feels, your own words').fill('knee pain, cramps and exhausted');
  await pg.locator('.hn-body').getByRole('button', { name: 'Add' }).click();
  f = await feels(pg);
  check(`your own words, two at once: knee pain and cramps their own chips, "exhausted" is tired — kept at a bit (${JSON.stringify(f[0].body)})`, JSON.stringify(f[0].body) === '{"tired":1,"weak":2,"knee-pain":1,"cramps":1}' && (await chip('knee pain').getAttribute('data-level')) === '1' && (await chip('cramps').getAttribute('data-level')) === '1');
  await pg.getByRole('slider', { name: 'Mood' }).click();
  f = await feels(pg);
  check(`another slider: still the one check-in (${f.length} check-in, mood ${f[0].mood})`, f.length === 1 && f[0].mood != null && f[0].body.weak === 2);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('#feel').screenshot({ path: OUT + 'bodychips.png' });
  await pg.locator('#feel').getByRole('button', { name: 'Done' }).click();
  const line = (await pg.locator('#feel').innerText()).replace(/\s+/g, ' ');
  check(`Done: on the one line (${line.slice(0, 90)})`, /^Rated 15:4\d · energy \d+ · mood \d+ · tired ●, weak ●●, knee pain ●, cramps ●/.test(line));
  await pg.reload(); await pg.waitForSelector('#feel');
  // the check-in is still open after a reload (Done isn't remembered across one): the chips hold their levels
  const lv = async (n) => pg.getByRole('group', { name: "How's your body" }).getByRole('button', { name: new RegExp(`^${n}(,|$)`) }).getAttribute('data-level');
  check(`a reload keeps it (weak ${await lv('weak')}, tired ${await lv('tired')}, knee pain ${await lv('knee pain')})`, (await lv('weak')) === '2' && (await lv('tired')) === '1' && (await lv('knee pain')) === '1');
  await pg.goto(APP + '#log'); await pg.waitForSelector('text=Logged today');
  const log = (await pg.locator('main').innerText()).replace(/\s+/g, ' ');
  check('the Log says it in words', /tired \(a bit\), weak \(a lot\), knee pain \(a bit\), cramps \(a bit\)/.test(log));
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
  await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
  const seen = await pg.locator('.ctx').innerText().catch(() => '');
  check('the AI sees it in words', /body: tired \(a bit\), weak \(a lot\), knee pain \(a bit\), cramps \(a bit\)/.test(seen));
  await pg.clock.setSystemTime(NOW + D); await pg.goto(APP); await pg.reload(); await pg.waitForSelector('#feel');
  await pg.getByRole('slider', { name: 'Energy' }).click();
  const tomorrow = (await pg.getByRole('group', { name: "How's your body" }).getByRole('button').allInnerTexts()).map((t) => t.trim());
  check(`tomorrow: knee pain is its own chip, nothing picked (${tomorrow.join(' | ')})`, tomorrow.includes('knee pain') && await pg.locator('.hn-bchips [aria-pressed="true"]').count() === 0);
  await ctx.close();

  ({ ctx, pg } = await open(320));
  await pg.getByRole('slider', { name: 'Energy' }).click();
  await pg.getByRole('group', { name: "How's your body" }).getByRole('button', { name: /^headache/ }).click();
  check(`fits a 320 phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('#feel').screenshot({ path: OUT + 'bodychips-320.png' });
  await ctx.close();

  ({ ctx, pg } = await open(390, 'planted'));
  await pg.goto(APP + '#insights/connections'); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
  const weak = pg.locator('#scout .scard', { hasText: 'you felt weak' }).first();
  const t = (await weak.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`90 days of chips: Leads says it (${t.slice(0, 120)})`, /With more alcohol, you felt weak the next day more often/.test(t));
  const lit = weak.locator('.lc-b .dc-day[data-lit]').last();
  await lit.click().catch(() => {});
  const words = (await weak.locator('.lc .dc-words').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`its chart reads a bit / a lot, not 1 / 2 (${words})`, /feeling weak, the next day (a lot|a bit|no)$/.test(words));
  await ctx.close();

  ({ ctx, pg } = await open(390, 'control'));
  await pg.goto(APP + '#insights/connections'); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
  const c = (await pg.locator('#scout').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`control: chips at random — no lead about feeling weak (${c.slice(0, 100)})`, !/felt weak/.test(c));
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
