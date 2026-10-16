// The morning read is written in the morning, after last night (owner, 16 Oct: "looks like app does daily read based on
// yyesterdays data" — it was written from 20:00 the evening before, so it called yesterday "today"). The evening before:
// nothing written. Next morning before last night is in: the read written the evening before isn't shown, nothing is
// written yet. A sleep rating comes in: the read is written, told what today is, with today's entries; it's on Today.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', EVE = new Date('2026-10-15T20:30:00').getTime(), MORNING = new Date('2026-10-16T07:40:00').getTime();
const calls = [];
const READ = { greeting: 'Morning! 7 h last night — a better start.', items: [
  { type: 'pattern', title: 'Yesterday was foggy', text: 'Focus 3 at 11:36 yesterday, after 5 h of sleep.' },
  { type: 'study', title: 'Sleep and focus', text: 'A short night costs focus the next day.', source: { title: 'Sleep 2025', url: 'https://example.org/s' } },
  { type: 'fact', title: 'Caffeine half-life', text: 'About five hours.', source: { title: 'NIH', url: 'https://example.org/c' } },
] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'digest') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: READ, usage: null, costUsd: 0.05, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: EVE });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // the 15th: a foggy check-in at 11:36, the 15th's read written that morning
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [...(s.entries || []), { id: 'fog', kind: 'feel', at, focus: 3, note: 'foggy' }];
    s.ai = { ...(s.ai || {}), digest: { day: '2026-10-15', at: at - 4 * 3600e3, greeting: 'Morning from the 15th', items: [] }, chat: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, new Date('2026-10-15T11:36:00').getTime()]);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1200);
  check('the evening before: no morning read is written for tomorrow', !calls.some((c) => c.task === 'digest'));

  // what the old version left: tomorrow's read, written the evening before
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.digest = { day: '2026-10-16', greeting: 'Morning! Rough night: 5 hours plus drinks.', items: [] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.clock.setSystemTime(MORNING); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1200);
  check('next morning, before last night is in: the read written the evening before isn\'t shown', !/Rough night/.test(await pg.locator('body').innerText()) && await pg.locator('section.morning').count() === 0);
  check('…and nothing is written yet', !calls.some((c) => c.task === 'digest'));

  // the sleep rating comes in (07:35): last night is in
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'sl', kind: 'sleep', at, rating: 7 }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, MORNING - 5 * 60e3]);
  await pg.reload(); await pg.waitForSelector('section.morning', { timeout: 5000 }).catch(() => {});
  const dg = calls.filter((c) => c.task === 'digest');
  check(`last night in → one read written, for today (${dg.length})`, dg.length === 1);
  const c = dg[0]?.context ?? '';
  check(`it's told what today is (${c.split('\n')[0]})`, /^Now: Fri 16 Oct 2026, 07:40 — today is 2026-10-16\. "Last 14 days" ends yesterday \(2026-10-15\)/.test(c));
  const today = c.slice(c.indexOf('## Today so far'), c.indexOf('\n##', c.indexOf('## Today so far') + 3));
  check(`today's entries are today's — yesterday's foggy check-in isn't among them (${today.replace(/\n/g, ' | ')})`, /rated last night's sleep 7\/10/.test(today) && !/foggy|11:36/.test(today));
  const card = await pg.locator('section.morning').innerText().catch(() => '');
  check(`Today shows the new read (${card.split('\n').slice(0, 2).join(' · ')})`, /7 h last night — a better start/.test(card) && !/Rough night/.test(card));
  await pg.locator('section.morning').screenshot({ path: OUT + 'morning-read.png' }).catch(() => {});
  await pg.reload(); await pg.waitForSelector('section.morning'); await pg.waitForTimeout(800);
  check('a reload doesn\'t write it again', calls.filter((x) => x.task === 'digest').length === 1);
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(300);
  const chat = await pg.locator('.chat').innerText();
  check('the chat doesn\'t repeat it — it\'s on Today (owner, 16 Oct)', !/☀️|a better start|Rough night/.test(chat));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
