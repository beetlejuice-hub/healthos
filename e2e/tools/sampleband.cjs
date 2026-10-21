// A fake band that fits the sample (lib/sample.ts) — for the review shots (PLAN 151), not a test suite.
// Built from the sample's own entries so the two agree: a coffee lifts heart rate for a few hours, a workout is a
// workout, beers raise the night's heart rate. Planted, like the sample: after a drink evening the night has less
// deep sleep and more awake, resting heart rate +4 and HRV −9 the next morning; with 30+ mg of caffeine at 23:00 it
// takes ~15 min longer to fall asleep; after drinks the night is 0.35 °C warmer, breathing +0.8 a minute, blood oxygen −0.6
// (PLAN 52's night check). Steps: three walks a day. Same seed → same band.
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const cafAt = (doses, t) => doses.reduce((a, d) => a + (d.at <= t ? d.mg * Math.pow(0.5, (t - d.at) / (300 * MIN)) : 0), 0);

/** The band's data for the `days` days up to `now`, from the sample's entries and workouts. */
function sampleBand(entries, workouts, now, days = 30) {
  const { r, g } = rng(4242), ng = rng(52).g, hr = [], sleep = [], steps = [], rhr = {}, hrv = {}, skin = {}, breath = {}, spo2 = {}, vo2 = {};
  const drinks = entries.filter((e) => e.kind === 'drink'), caf = drinks.filter((d) => d.caffeineMg > 0).map((d) => ({ at: d.at, mg: d.caffeineMg }));
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  for (let k = days; k >= 0; k--) {
    const mid = start.getTime() - k * DAY, T = (h) => mid + h * HOUR, date = ymd(mid);
    // the night ending this morning: yesterday's evening drinks and caffeine at 23:00
    const alc = drinks.filter((d) => d.alcoholG > 0 && d.at >= T(-10) && d.at < T(0)).reduce((a, d) => a + d.alcoholG, 0);
    const lateCaf = cafAt(caf, T(-1)) >= 30, drank = alc > 10;
    const bed = T(-0.85 + g() * 0.3 + (drank ? 0.5 : 0)), up = T(7.15 + g() * 0.2), fall = (lateCaf ? 27 : 12) + Math.round(r() * 6), onset = bed + fall * MIN, wake = up - 5 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) {
      const e = Math.min(wake, t + 90 * MIN), L = e - t, deep = c < 2 ? (drank ? 0.12 : 0.25) : 0;
      stages.push({ type: 'light', start: t, end: t + L * (0.7 - deep) }, { type: deep ? 'deep' : 'light', start: t + L * (0.7 - deep), end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e });
      if (drank && c === 2) stages.push({ type: 'awake', start: e, end: e + 12 * MIN });
      t = drank && c === 2 ? e + 12 * MIN : e;
    }
    stages.push({ type: 'awake', start: wake, end: up });
    const mins = (ty) => Math.round(stages.filter((s) => s.type === ty).reduce((m, s) => m + (s.end - s.start) / MIN, 0));
    if (up < now) {
      sleep.push({ id: 'sb' + date, start: bed, end: up, asleepMin: mins('light') + mins('deep') + mins('rem'), awakeMin: mins('awake'), toFallAsleepMin: fall, nap: false, stageMin: { deep: mins('deep'), light: mins('light'), rem: mins('rem'), awake: mins('awake') }, stages });
      rhr[date] = Math.round(53 + g() * 0.8 + (drank ? 4 : 0)); hrv[date] = Math.round(46 + g() * 3 - (drank ? 9 : 0));
      // the night check (PLAN 52), from its own draws so the rest of the band stays as it was: after drinks a warmer night, faster breathing, a little less oxygen
      skin[date] = +(33.7 + ng() * 0.12 + (drank ? 0.35 : 0)).toFixed(2); breath[date] = +(14.2 + ng() * 0.3 + (drank ? 0.8 : 0)).toFixed(1); spo2[date] = +(96 + ng() * 0.4 - (drank ? 0.6 : 0)).toFixed(1);
      vo2[date] = { v: +(43 - k / days + ng() * 0.25).toFixed(1), level: 'GOOD' }; // slowly up a point over the days
    }
    const gym = workouts.filter((w) => w.startedAt >= T(0) && w.startedAt < T(24));
    const coffees = caf.filter((d) => d.at >= T(0) && d.at < T(24)), beers = drinks.filter((d) => d.alcoholG > 0 && d.at >= T(0) && d.at < T(24));
    const walks = [9.1, 12.6, 18.3].map((h) => T(h + g() * 0.2));
    for (let m = bed; m < T(24) && m <= now - 2 * MIN; m += MIN) {
      const h = (m - mid) / HOUR, asleep = m >= onset && m < wake;
      let v;
      if (asleep) v = 52 + (drank ? 4 : 0) + Math.abs(h - 3) * 1.4 + g();
      else if (m < up) v = 60 + g() * 2;
      else {
        v = 63 + 6 * Math.sin(((h - 9) / 14) * Math.PI) + (h - 7.15 < 1 ? -6 * (1 - (h - 7.15)) : 0);
        for (const c of coffees) { const x = (m - c.at) / MIN; if (x > 0 && x < 240) v += 4 * (c.mg / 95) * (x / 45) * Math.exp(1 - x / 45); }
        for (const b of beers) if (m >= b.at) v += 2;
        for (const w of gym) { if (m >= w.startedAt && m < w.endedAt) v = 120 + 12 * Math.sin((m - w.startedAt) / 540_000) + g() * 4; else if (m >= w.endedAt && m < w.endedAt + 2 * HOUR) v += 50 * Math.exp(-((m - w.endedAt) / MIN) / 18); }
        for (const w of walks) if (m >= w && m < w + 20 * MIN) v += 18;
        v += g() * 2;
      }
      if (m >= T(-1.5)) { const a = Math.round(v); hr.push([m, a, a - 2, a + 3]); }
    }
    for (const w of walks) for (let i = 0; i < 4 && w + i * 5 * MIN < now; i++) steps.push([w + i * 5 * MIN, 5, 480 + Math.round(g() * 40)]);
  }
  const uniq = [...new Map(hr.map((m) => [m[0], m])).values()].sort((a, b) => a[0] - b[0]);
  return { hr: uniq, sleep, steps: steps.sort((a, b) => a[0] - b[0]), rhr, hrv, skin, breath, spo2, vo2 };
}

/** Serve it as the Worker would (/api/band/status and /api/band/data?from&to). */
async function routeBand(ctx, band, now) {
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from') || 0, to = +u.searchParams.get('to') || now;
    const st = { connected: true, needsReconnect: false, connectedAt: now - 40 * DAY, lastSync: now - 3 * MIN, latest: band.hr.at(-1)?.[0] ?? null, error: null, gapSec: 60 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: band.hr.filter((m) => inR(m[0])), steps: band.steps.filter((s) => inR(s[0])), sleep: band.sleep.filter((s) => s.end >= from - DAY && s.start <= to), rhr: band.rhr, hrv: band.hrv, skin: band.skin, breath: band.breath, spo2: band.spo2, vo2: band.vo2, ...st } : st) });
  });
}

module.exports = { sampleBand, routeBand };
