// Apple Health in (PLAN 184; owner, 29 Oct: "i use MovingLife", then "pls select all that are interesting or important").
// The Worker faked: it holds three scale mornings (27, 28, 29 Oct, 07:30, each with body fat a minute later) and a walking
// speed. Thu 29 Oct 10:30, a weigh-in typed on the 28th at 07:45. Opening the app brings the 27th and 29th in as
// weigh-ins with their body fat (Log → Body), not the 28th (typed within 30 min: not doubled). Delete the 29th, reload:
// it stays deleted. Settings → Apple Health says what last came; "New key" (after a confirm) shows the key, the copy
// buttons and the 7 steps; 320 px fits. Control: no key on the server → "Set up", nothing brought in.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (iso) => new Date(iso).getTime();
const SAMPLES = ['2026-10-27', '2026-10-28', '2026-10-29'].flatMap((d, i) => [
  { type: 'weight', at: T(`${d}T07:30:00`), value: 82.8 - i * 0.2 }, { type: 'fat', at: T(`${d}T07:31:00`), value: 19.2 - i * 0.2 },
]).concat([{ type: 'walk', at: T('2026-10-28T20:00:00'), value: 4.9 }]);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, server) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    // the Worker answers only once this account's own data is set up (before, a fresh account would take them all)
    let ready = false;
    await ctx.route('**/api/health/data', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ready ? server : { samples: [], last: null, key: false }) }));
    await ctx.route('**/api/health/key', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ key: `u-test.${'a1'.repeat(24)}`, url: 'https://healthos.example/api/health/in' }) }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: T('2026-10-29T10:30:00') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('dialog', (d) => d.accept());
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, t]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'typed28', kind: 'weight', at: t, kg: 82.5 }]; s.settings = { ...(s.settings || {}), healthUntil: undefined }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T('2026-10-28T07:45:00')]);
    ready = true;
    await pg.goto(APP + '#log/body'); await pg.reload(); await pg.waitForTimeout(1200);
    return { ctx, pg, st: () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY) };
  }
  const rows = (pg) => pg.locator('.list .li span').allInnerTexts().then((xs) => xs.map((x) => x.replace(/\s+/g, ' ')));

  let { ctx, pg, st } = await open(390, { samples: SAMPLES, last: { at: T('2026-10-29T10:00:00'), types: ['weight', 'fat', 'walk'] }, key: true });
  let s = await st();
  const came = s.entries.filter((e) => e.id.startsWith('health-weight-'));
  check(`the 27th and 29th came in with their body fat; the 28th you typed isn't doubled (${came.map((e) => `${e.kg}/${e.fatPct}`).join(', ')})`, came.length === 2 && came.map((e) => `${e.kg}/${e.fatPct}`).join() === '82.8/19.2,82.4/18.8' && s.entries.filter((e) => e.kind === 'weight').length === 3);
  const r = await rows(pg);
  check(`Log → Body lists them with fat % (${r.join(' | ')})`, r.some((x) => /^82\.4 kg · 18\.8% fat Thu 29 Oct · 07:30$/.test(x)) && r.some((x) => /^82\.5 kg Wed 28 Oct · 07:45$/.test(x)));
  check(`until moves on to the newest (${s.settings.healthUntil})`, s.settings.healthUntil === T('2026-10-29T07:30:00'));
  await pg.locator('.list .li', { hasText: 'Thu 29 Oct · 07:30' }).filter({ hasText: '82.4 kg' }).first().getByRole('button', { name: 'Delete' }).click(); await pg.waitForTimeout(200);
  await pg.reload(); await pg.waitForTimeout(1200);
  s = await st();
  check('deleted, reloaded: it stays deleted', !s.entries.some((e) => e.id === `health-weight-${T('2026-10-29T07:30:00')}`) && s.entries.some((e) => e.id === `health-weight-${T('2026-10-27T07:30:00')}`));
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth');
  const card = pg.locator('#applehealth');
  check(`Settings says what last came (${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 140)})`, /Last in: Thu 29 Oct 10:00 — weight, body fat, walking speed\. 1 weigh-in brought in\./.test((await card.innerText()).replace(/\s+/g, ' ')));
  await ctx.close();

  ({ ctx, pg, st } = await open(320, { samples: SAMPLES, last: null, key: true }));
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth');
  await pg.locator('#applehealth').getByRole('button', { name: 'New key' }).click(); await pg.waitForTimeout(300);
  const setup = pg.locator('#applehealth .ah-setup');
  check(`New key: the key, two copy buttons, 7 steps (${await setup.locator('.ah-key').innerText().catch(() => '')})`, /^u-test\.(a1){24}$/.test(await setup.locator('.ah-key').innerText()) && await setup.locator('.ah-steps li').count() === 7 && await setup.getByRole('button', { name: /Copy/ }).count() === 2);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('#applehealth').screenshot({ path: OUT + 'applehealth-320.png' });
  await ctx.close();

  // a try that didn't work says what came (owner, 29 Oct: "now it says 400 bad request")
  ({ ctx, pg, st } = await open(390, { samples: [], last: { at: T('2026-10-29T10:25:00'), types: ['weight', 'walk'], skipped: { fat: "fatAt “Oct 29, 2026 at 7:31 AM” isn't a date — set its Date Format to ISO 8601 with the time on" } }, key: true, fail: { at: T('2026-10-29T10:20:00'), error: 'nothing readable came (application/json, 0 bytes) — Get Contents of URL → Request Body should be JSON with the 7 fields' } }));
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth');
  // a field that came but was left out says why (owner, 29 Oct: "now it says got weight walk ok true")
  check(`a field left out says why (${await pg.locator('#applehealth .ah-fail').first().innerText().catch(() => '')})`, /^body fat left out: fatAt “Oct 29, 2026 at 7:31 AM” isn't a date — set its Date Format to ISO 8601 with the time on$/.test(await pg.locator('#applehealth .ah-fail').first().innerText().catch(() => '')));
  check(`a failed try is shown with what came (${await pg.locator('#applehealth .ah-fail').last().innerText().catch(() => '')})`, /^Last try didn't work \(Thu 29 Oct 10:20\): nothing readable came \(application\/json, 0 bytes\)/.test(await pg.locator('#applehealth .ah-fail').last().innerText().catch(() => '')));
  await ctx.close();

  ({ ctx, pg, st } = await open(390, { samples: [], last: null, key: false }));
  s = await st();
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#applehealth');
  check('control: nothing on the server → "Set up", nothing brought in', await pg.locator('#applehealth').getByRole('button', { name: 'Set up' }).count() === 1 && !s.entries.some((e) => e.id.startsWith('health-weight-')));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
