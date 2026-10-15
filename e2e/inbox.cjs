// The app writes to you, in the AI tab (PLAN 102; owner, 15 Oct: "send me messages like hey your heart rate was pretty
// elevated in this time range, what were you doing, or new findings that i can comment on, like not x caused y, but i
// was doing z" → "as per your recommendations": one place, a few a day, never repeated, answers saved so they count).
// 32 fake days from the band: days around 66 bpm, nights around 52, HRV ~46. Planted: today +18 bpm 14:10–14:50 with
// nothing logged; on drink evenings (about a third) HRV 9 ms lower and the lowest heart rate 5 higher. Both kinds of
// message must arrive with the tab's dot; answering the stretch saves a check-in in its middle, so the Heart page then
// explains it; a finding's reply is saved as an answer; a reload keeps them and adds nothing.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-15T17:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world() {
  const { r, g } = rng(21), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [];
  const push = (t, v) => { v = Math.round(v); hr.push([t, v, v - 2, v + 2]); };
  for (let k = 32; k >= 0; k--) {
    const day0 = new Date(2026, 9, 15 - k).getTime(), T = (h) => day0 + h * HOUR, today = k === 0;
    // the day, 08:00 to bed (today: to 16:40, the band's last sync)
    for (let t = T(8); t < (today ? T(16 + 40 / 60) : T(23.5)); t += 2 * MIN) {
      const h = (t - day0) / HOUR, plant = today && h >= 14 + 10 / 60 && h < 14 + 50 / 60 ? 18 : 0;
      push(t, 66 + g() * 2 + plant);
    }
    if (today) break;
    const drinks = r() < 0.35, bed = T(23.5), onset = bed + 12 * MIN, asleepMin = 440 + g() * 15, wake = onset + asleepMin * MIN, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(asleepMin), awakeMin: 12, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed; t < up; t += 2 * MIN) push(t, (t > onset && t < wake ? 52 + (drinks ? 5 : 0) : 63) + g());
    hrv[ymd(up)] = Math.round(46 + g() * 2 - (drinks ? 9 : 0)); rhr[ymd(up)] = Math.round(54 + g());
    if (drinks) [20.67, 21.83].forEach((h, i) => entries.push({ id: `b${k}${i}`, kind: 'drink', at: T(h), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }));
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries, hrv, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 20 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, NOW - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  // the asks come shortly after the band; the findings once a month of it is in (the shell loads it, then reads the grids)
  const inbox = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').ai?.inbox ?? []);
  await pg.waitForFunction(() => (JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}').ai?.inbox ?? []).length >= 3, null, { timeout: 25000 }).catch(() => {});
  const got = await inbox();
  check(`three messages, the cap: the stretch and two findings (${got.map((n) => n.id).join(', ')})`, got.length === 3 && got.filter((n) => n.kind === 'raised').length === 1 && got.filter((n) => n.kind === 'finding').length === 2);
  check(`the findings are the planted ones: drinks → HRV, drinks → lowest heart rate (${got.filter((n) => n.kind === 'finding').map((n) => n.id).sort().join(', ')})`,
    got.filter((n) => n.kind === 'finding').map((n) => n.id).sort().join(',') === 'finding:sleep:drinks|hrv|worse,finding:sleep:drinks|low|worse');
  const dot = await pg.locator('.tabdot[aria-label="3 new messages"]').count();
  check('the AI tab shows a dot: 3 new messages', dot === 1);
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.msg.byapp');
  const ask = pg.locator('.msg.byapp[data-kind="raised"]');
  const askText = (await ask.innerText()).replace(/\n/g, ' ');
  check(`the stretch, asked: when, how much, the question (${askText.slice(0, 140)})`, /FROM THE APP · 1\d:\d\d\s*Heart rate up 14:1\d–14:5\d\s*\+1[5-9] bpm over your usual for then, peak \d+, and nothing logged around it\. What were you doing\?/i.test(askText));
  const fin = pg.locator('.msg.byapp[data-notice="finding:sleep:drinks|hrv|worse"]');
  const finText = (await fin.innerText()).replace(/\n/g, ' ');
  check(`a finding, in words, asking what else (${finText.slice(0, 170)})`, /New finding · sleep\s*Drinks that evening → HRV −(7|8|9|10|11)\.\d ms, on \d+ nights with it against \d+ without\. Goes with, not proof of why — anything else going on those nights\?/.test(finText));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  // found by eye: the card's first class name ("app") took the app shell's full-screen height — each card 900 px tall
  const hs = await pg.locator('.msg.byapp').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(`each message is its own size, not a screen tall (${hs.join(', ')} px)`, hs.length === 3 && hs.every((h) => h > 80 && h < 420));
  await pg.locator('.chat').screenshot({ path: OUT + 'inbox-thread.png' });
  // answer the stretch with the first of your usual doings
  const first = ask.locator('.ib-tags button').first(), label = (await first.innerText()).trim();
  await first.click(); await pg.waitForTimeout(300);
  const mid = await pg.evaluate(() => { const n = JSON.parse(localStorage.getItem('healthos.v1:u-test')).ai.inbox.find((x) => x.kind === 'raised'); return Math.round((n.span.start + n.span.end) / 2); });
  const feel = await pg.evaluate((m) => JSON.parse(localStorage.getItem('healthos.v1:u-test')).entries.find((e) => e.kind === 'feel' && e.at === m), mid);
  check(`answering "${label}" saves it as what you were doing, in the middle of the stretch (${feel && feel.doing})`, !!feel && feel.doing.length === 1);
  check('…and shows as your reply, the question gone', (await pg.locator(`.ib-reply[data-reply-to^="raised:"]`).innerText()).trim() === label && await ask.locator('.ib-tags').count() === 0);
  // the finding: "something else was going on" — in your words
  await fin.getByRole('button', { name: 'Something else was going on' }).click();
  await fin.locator('input').fill('those were nights out with friends'); await fin.getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300);
  const ans = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')).entries.find((e) => e.kind === 'answer' && e.key === 'finding:sleep:drinks|hrv|worse'));
  check(`the finding's reply is saved as an answer the AI reads (${ans && ans.answer})`, ans && ans.answer === 'those were nights out with friends' && /^Drinks that evening → HRV/.test(ans.question));
  // the other finding: "Not now"
  await pg.locator('.msg.byapp[data-notice="finding:sleep:drinks|low|worse"] .ib-skip').click(); await pg.waitForTimeout(200);
  await pg.locator('.chat').screenshot({ path: OUT + 'inbox-answered.png' });
  // a reload: the same three, nothing new, no dot
  await pg.reload(); await pg.waitForSelector('.msg.byapp'); await pg.waitForTimeout(6000);
  const after = await inbox();
  check(`a reload keeps them and adds nothing (${after.length}; ${after.filter((n) => n.reply).length} answered, ${after.filter((n) => n.closed).length} closed)`, after.length === 3 && after.filter((n) => n.reply).length === 2 && after.filter((n) => n.closed).length === 1);
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel');
  check('no dot once read', await pg.locator('.tabdot[aria-label$="new messages"], .tabdot[aria-label$="new message"]').count() === 0);
  // the Heart page now explains the stretch with the answer
  await pg.goto(APP + '#insights/heart'); await pg.waitForSelector('.hp-raised-row', { timeout: 15000 }).catch(() => {});
  const row = pg.locator('.hp-raised-row').filter({ hasText: /14:1\d–14:5\d/ });
  check(`the Heart page: the stretch now says "you said: ${label.toLowerCase()}" (${(await row.innerText().catch(() => '')).replace(/\n/g, ' ')})`, (await row.getAttribute('data-explained').catch(() => null)) === 'true' && new RegExp(`you said: ${label}`, 'i').test(await row.innerText().catch(() => '')));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
