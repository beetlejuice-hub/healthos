// The app writes to you, in the AI tab (PLAN 102; owner, 15 Oct: "send me messages like hey your heart rate was pretty
// elevated in this time range, what were you doing, or new findings that i can comment on, like not x caused y, but i
// was doing z" → "as per your recommendations": one place, a few a day, never repeated, answers saved so they count).
// 32 fake days from the band: days around 66 bpm, nights around 52, HRV ~46, mood checked twice a day around 7. Planted:
// today +18 bpm 14:10–14:50 with nothing logged; on drink evenings (about a third) HRV 9 ms lower and the lowest heart
// rate 5 higher, and the next day's mood 2 lower. Both kinds of message must arrive under the AI tab's red badge with
// their number (owner: "a red circle w a number on it … i can click on it, it brings me to the chat page"); answering
// the stretch saves a check-in in its middle, so the Heart page then explains it; a finding's reply is saved as an
// answer; a reload keeps them and adds nothing; the next day the Mind page's finding comes (the cap held it back).
// Then another month, a wine morning (HRV 33, resting 62) at 09:30: readiness asks what happened, and the answer joins
// that morning's last-night tags, as on Today.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-15T17:00:00').getTime(), MORNING = new Date('2026-10-15T09:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
// wine: the morning version — no drinks planted, this morning's HRV and resting heart rate far off, the band to 09:10,
// and worn only 20 days (less than the month the daily read loads)
function world(wine = false) {
  const { r, g } = rng(21), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [], workouts = [];
  const push = (t, v) => { v = Math.round(v); hr.push([t, v, v - 2, v + 2]); };
  const drunk = Array.from({ length: 33 }, () => !wine && r() < 0.35); // drunk[k]: the evening of day k (k days ago)
  for (let k = wine ? 20 : 32; k >= 0; k--) {
    const day0 = new Date(2026, 9, 15 - k).getTime(), T = (h) => day0 + h * HOUR, today = k === 0;
    // the day, 08:00 to bed (today: to 16:40, the band's last sync — or 09:10 on the wine morning)
    for (let t = T(8); t < (today ? T(wine ? 9 + 10 / 60 : 16 + 40 / 60) : T(23.5)); t += 2 * MIN) {
      const h = (t - day0) / HOUR, plant = today && !wine && h >= 14 + 10 / 60 && h < 14 + 50 / 60 ? 18 : 0;
      push(t, 66 + g() * 2 + plant);
    }
    // mood twice a day, 2 lower the day after a drink evening (finished days only: the Mind grid doesn't read today)
    if (!wine) [13, 19].forEach((h, i) => { if (T(h) < NOW) entries.push({ id: `f${k}${i}`, kind: 'feel', at: T(h), mood: Math.round(7 + g() * 0.6 - (drunk[k + 1] ? 2 : 0)) }); });
    if (today) break;
    // training Mon / Wed / Fri at 18:00 (so the Training page's grids are read too — nothing planted in them)
    const dow = new Date(day0).getDay();
    if (!wine && (dow === 1 || dow === 3 || dow === 5)) {
      workouts.push({ id: 'w' + k, template: 'Full body', startedAt: T(18), endedAt: T(19) });
      for (let i = 0; i < 9; i++) entries.push({ id: `x${k}-${i}`, kind: 'set', at: T(18) + i * 4 * MIN, workoutId: 'w' + k, exercise: ['Squat', 'Bench press', 'Row'][i % 3], kg: 80 + (32 - k) * 0.5 + g(), reps: 5 });
    }
    const drinks = drunk[k], bed = T(23.5), onset = bed + 12 * MIN, asleepMin = 440 + g() * 15, wake = onset + asleepMin * MIN, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(asleepMin), awakeMin: 12, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed; t < up; t += 2 * MIN) push(t, (t > onset && t < wake ? 52 + (drinks ? 5 : 0) : 63) + g());
    const wineMorning = wine && k === 1;
    hrv[ymd(up)] = wineMorning ? 33 : Math.round(46 + g() * 2 - (drinks ? 9 : 0)); rhr[ymd(up)] = wineMorning ? 62 : Math.round(54 + g());
    if (drinks) [20.67, 21.83].forEach((h, i) => entries.push({ id: `b${k}${i}`, kind: 'drink', at: T(h), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }));
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries, hrv, rhr, workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const KEY = 'healthos.v1:u-test';
  const store = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
  async function open(w, now) {
    // a world is its own account: the last one's synced rows (its inbox above all) are cleared from the fake server — kept,
    // they came back or not by which sync landed first, and under load the old inbox won (two full runs, 20 Oct)
    for (const t of [tables.docs, tables.entries]) for (const k of [...t.keys()]) if (String(k).startsWith('u-test')) t.delete(k);
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: now - 60 * D, lastSync: now - 20 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, now - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: now });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, es, ws]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = ws; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w.entries, w.workouts]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    return { ctx, pg };
  }
  const waitInbox = (pg, n) => pg.waitForFunction(([k, n]) => (JSON.parse(localStorage.getItem(k) || '{}').ai?.inbox ?? []).length >= n, [KEY, n], { timeout: 25000 }).catch(() => {});

  // ---- the afternoon: the stretch and two findings
  let { ctx, pg } = await open(world(), NOW);
  // the asks come shortly after the band; the findings once its 90 days are in (the shell loads them, then reads the grids)
  await waitInbox(pg, 3);
  const got = (await store(pg)).ai?.inbox ?? [];
  check(`three messages, the cap: the stretch and two findings (${got.map((n) => n.id).join(', ')})`, got.length === 3 && got.filter((n) => n.kind === 'raised').length === 1 && got.filter((n) => n.kind === 'finding').length === 2);
  check(`the findings are the planted ones, surest first: drinks → HRV, drinks → lowest heart rate (${got.filter((n) => n.kind === 'finding').map((n) => n.id).sort().join(', ')})`,
    got.filter((n) => n.kind === 'finding').map((n) => n.id).sort().join(',') === 'finding:sleep:drinks|hrv|worse,finding:sleep:drinks|low|worse');
  const badge = pg.locator('.tabs a[href="#ai"] .tabbadge');
  const bc = await badge.evaluate((e) => [e.textContent, getComputedStyle(e).backgroundColor, e.getBoundingClientRect().width]).catch(() => null);
  check(`the AI tab: a red circle with the number, 3 (${bc})`, bc && bc[0] === '3' && bc[1] === 'rgb(229, 72, 77)' && bc[2] >= 16 && bc[2] <= 24);
  await pg.locator('.tabs').screenshot({ path: OUT + 'inbox-badge.png' });
  // tapping it brings you to the chat, at the first new message
  await badge.click(); await pg.waitForSelector('.msg.byapp'); await pg.waitForTimeout(300);
  check(`a tap on it opens the chat (${await pg.evaluate(() => location.hash)})`, await pg.evaluate(() => location.hash) === '#ai');
  const firstTop = await pg.locator('.msg.byapp[data-new]').evaluate((e) => Math.round(e.getBoundingClientRect().top)).catch(() => null);
  check(`…at the first new message, in view (top ${firstTop} px)`, firstTop != null && firstTop >= 0 && firstTop < 300);
  check('the badge is gone once you\'re there', await pg.locator('.tabbadge').count() === 0);
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
  // answer the stretch with the first two of your usual doings (owner, 20 Oct: more than one answer)
  const chips = ask.locator('.ib-tags button[aria-pressed]'), label = [(await chips.nth(0).innerText()).trim(), (await chips.nth(1).innerText()).trim()].join(', ');
  await chips.nth(0).click(); await chips.nth(1).click(); await pg.waitForTimeout(100);
  check('two picked, nothing saved before Send', await ask.locator('.ib-tags button[aria-pressed="true"]').count() === 2 && !(await store(pg)).entries.some((e) => e.kind === 'feel' && e.doing && e.at > Date.now() - 864e5 * 40 && (e.doing || []).length === 2));
  await ask.getByRole('button', { name: 'Send 2' }).click(); await pg.waitForTimeout(300);
  let st = await store(pg);
  const nr = st.ai.inbox.find((x) => x.kind === 'raised'), mid = Math.round((nr.span.start + nr.span.end) / 2), feel = st.entries.find((e) => e.kind === 'feel' && e.at === mid);
  check(`answering "${label}" saves both as what you were doing, in the middle of the stretch (${feel && feel.doing})`, !!feel && feel.doing.length === 2);
  check('…and shows as your reply, the question gone', (await pg.locator(`.ib-reply[data-reply-to^="raised:"]`).innerText()).trim() === label && await ask.locator('.ib-tags').count() === 0);
  // the finding: "something else was going on" — in your words
  await fin.getByRole('button', { name: 'Something else was going on' }).click();
  await fin.locator('input').fill('those were nights out with friends'); await fin.getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300);
  st = await store(pg);
  const ans = st.entries.find((e) => e.kind === 'answer' && e.key === 'finding:sleep:drinks|hrv|worse');
  check(`the finding's reply is saved as an answer the AI reads (${ans && ans.answer})`, ans && ans.answer === 'those were nights out with friends' && /^Drinks that evening → HRV/.test(ans.question));
  // the other finding: "Not now"
  await pg.locator('.msg.byapp[data-notice="finding:sleep:drinks|low|worse"] .ib-skip').click(); await pg.waitForTimeout(200);
  await pg.locator('.chat').screenshot({ path: OUT + 'inbox-answered.png' });
  // a reload: the same three, nothing new, no badge
  await pg.reload(); await pg.waitForSelector('.msg.byapp'); await pg.waitForTimeout(6000);
  const after = (await store(pg)).ai.inbox;
  check(`a reload keeps them and adds nothing (${after.length}; ${after.filter((n) => n.reply).length} answered, ${after.filter((n) => n.closed).length} closed)`, after.length === 3 && after.filter((n) => n.reply).length === 2 && after.filter((n) => n.closed).length === 1);
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel');
  check('no badge once read', await pg.locator('.tabbadge').count() === 0);
  // the Heart page now explains the stretch with the answer
  await pg.goto(APP + '#insights/heart'); await pg.waitForSelector('.hp-raised-row', { timeout: 15000 }).catch(() => {});
  const row = pg.locator('.hp-raised-row').filter({ hasText: /14:1\d–14:5\d/ });
  check(`the Heart page: the stretch now says "you said: ${label.toLowerCase()}" (${(await row.innerText().catch(() => '')).replace(/\n/g, ' ')})`, (await row.getAttribute('data-explained').catch(() => null)) === 'true' && new RegExp(`you said: ${label}`, 'i').test(await row.innerText().catch(() => '')));
  // ---- the next morning: the Mind page's finding, held back yesterday by the cap
  await pg.clock.setSystemTime(new Date('2026-10-16T10:00:00')); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
  await waitInbox(pg, 4);
  const day2 = ((await store(pg)).ai.inbox ?? []).slice(3);
  const mind = day2.find((n) => n.id === 'finding:mind:drinks|mood|worse');
  check(`next day: the Mind page's planted finding arrives (${day2.map((n) => n.id).join(', ')})`, !!mind && day2.length <= 3 && day2.every((n) => n.kind === 'finding'));
  check(`…in its words (${mind && mind.title} · ${mind && mind.text.slice(0, 120)})`, mind && mind.title === 'New finding · mind' && /^Drinks the evening before → mood that day −(1|2|3)\.\d points, on \d+ days with it against \d+ without\./.test(mind.text));
  check(`…and the badge counts them (${await badge.textContent().catch(() => null)})`, (await badge.textContent().catch(() => null)) === String(day2.length));
  await ctx.close();

  // ---- another month: a wine morning at 09:30
  ({ ctx, pg } = await open(world(true), MORNING));
  await waitInbox(pg, 1); await pg.waitForTimeout(5000);
  const m = (await store(pg)).ai?.inbox ?? [];
  const low = m.find((n) => n.kind === 'readiness');
  check(`a wine morning: one message, readiness asking what happened (${m.map((n) => n.id).join(', ')})`, m.length === 1 && !!low && low.id === 'readiness:2026-10-15');
  await pg.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '{}').ai?.findingsDay === '2026-10-15', KEY, { timeout: 15000 }).catch(() => {});
  check(`a band worn 20 days: the day's grids are still read (findingsDay ${(await store(pg)).ai?.findingsDay})`, (await store(pg)).ai?.findingsDay === '2026-10-15');
  check(`…in words (${low && low.title} · ${low && low.text})`, low && /^Readiness (1\d|2\d|3\d) this morning$/.test(low.title) && low.text === 'HRV and resting heart rate both well off your usual. What happened yesterday?');
  await pg.locator('.tabs a[href="#ai"] .tabbadge').click(); await pg.waitForSelector('.msg.byapp[data-kind="readiness"]');
  const card = pg.locator('.msg.byapp[data-kind="readiness"]');
  check('…with your last-night tags to tap, and a way to log what wasn\'t', await card.getByRole('button', { name: 'out with friends' }).count() === 1 && await card.getByRole('button', { name: 'with gf' }).count() === 1 && await card.locator('a[href="#log"]').count() === 1);
  await card.screenshot({ path: OUT + 'inbox-readiness.png' });
  await card.getByRole('button', { name: 'out with friends' }).click(); await card.getByRole('button', { name: 'with gf' }).click();
  await card.getByRole('button', { name: 'Send 2' }).click(); await pg.waitForTimeout(300);
  const sl = (await store(pg)).entries.filter((e) => e.kind === 'sleep');
  const h = sl[0] && new Date(sl[0].at).getHours();
  check(`both answers join this morning's last-night tags, in the morning window (${JSON.stringify(sl.map((e) => [e.tags, h]))})`, sl.length === 1 && sl[0].tags.length === 2 && sl[0].tags[0] === 'out' && h >= 4 && h < 14);
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel');
  check('Today\'s check-in shows both ticked', await pg.locator('#feel button[aria-pressed="true"]', { hasText: 'out with friends' }).count() === 1 && await pg.locator('#feel button[aria-pressed="true"]', { hasText: 'with gf' }).count() === 1);
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
