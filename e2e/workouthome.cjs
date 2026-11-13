// The Workout home renovated (owner, 13 Nov: "A A A … start building them"; canvas A "just today's session", with B's
// week as a thin row). This week Mon Push + Quads and Tue a stairmaster: the strip says so, today is marked; Pull is up
// next and big, each lift with today's target and what changed (row 100 × 8 all sets → 102.5 × 8, "+2.5 kg"); the
// other days are chips that open their card; the week, strength, muscles and premade programs are folded, and a fold
// left open stays open. Fits the phone.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, D = 864e5, T = new Date('2026-11-13T18:00:00').getTime(); // a Friday
const at = (d, h) => new Date(`2026-11-${d}T${h}:00`).getTime();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const templates = [
    { id: 't1', name: 'Push + Quads', exercises: [{ name: 'Squat', sets: 3, reps: 6, restSec: 150 }, { name: 'Bench press', sets: 3, reps: 6, restSec: 150 }] },
    { id: 't2', name: 'Pull', exercises: [{ name: 'Barbell row', sets: 3, reps: 8, restSec: 120 }, { name: 'Lat pulldown', sets: 3, reps: 10, repsMax: 12, restSec: 90 }, { name: 'Face pull', sets: 3, reps: 15, restSec: 60 }] },
    { id: 't3', name: 'Mixed', exercises: [{ name: 'Deadlift', sets: 3, reps: 5, restSec: 180 }] },
  ];
  const workouts = [
    { id: 'p0', template: 'Pull', startedAt: at('06', '17:00'), endedAt: at('06', '18:00'), plan: [] },
    { id: 'w1', template: 'Push + Quads', startedAt: at('09', '17:00'), endedAt: at('09', '18:00'), plan: [] },
    { id: 'c1', template: 'Cardio', kind: 'cardio', startedAt: at('10', '07:00'), endedAt: at('10', '07:25'), cardio: { what: 'Stairmaster', startedAt: at('10', '07:00') } },
  ];
  const sets = [
    ...[8, 8, 8].map((r, k) => ({ id: `r${k}`, kind: 'set', at: at('06', '17:10') + k * MIN, workoutId: 'p0', exercise: 'Barbell row', kg: 100, reps: r })),
    ...[11, 10, 10].map((r, k) => ({ id: `l${k}`, kind: 'set', at: at('06', '17:30') + k * MIN, workoutId: 'p0', exercise: 'Lat pulldown', kg: 60, reps: r })),
    ...[6, 6, 5].map((r, k) => ({ id: `s${k}`, kind: 'set', at: at('09', '17:10') + k * MIN, workoutId: 'w1', exercise: 'Squat', kg: 105, reps: r })),
  ];
  await pg.evaluate(([ts, ws, es]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.templates = ts; s.workouts = ws; s.entries = es; localStorage.setItem(k, JSON.stringify(s)); localStorage.removeItem('healthos.ui.wmore'); }, [templates, workouts, sets]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.wstrip', { timeout: 15000 });

  const strip = await pg.locator('.wstrip > div').evaluateAll((els) => els.map((e) => `${e.dataset.dow}:${e.querySelector('b').textContent}${e.classList.contains('done') ? '✓' : ''}${e.classList.contains('today') ? '*' : ''}`));
  check(`the week: Mon Push, Tue Stair, today Friday (${strip.join(' ')})`, strip.join(' ') === 'Mon:Push✓ Tue:Stair✓ Wed:– Thu:– Fri:* Sat: Sun:');
  const hero = pg.locator('.dcard.next');
  check(`Pull is up next, big (${await hero.locator('h2').innerText()})`, (await hero.locator('h2').innerText()).toLowerCase() === 'pull');
  const rows = (await hero.locator('.dlist li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(`every lift's target and what changed (${rows.join(' | ')})`, /^Barbell row ?3 × 8 102\.5 × 8 ?\+2\.5 kg$/i.test(rows[0]) && /^Lat pulldown ?3 × 10–12 60 × 11/i.test(rows[1]) && /^Face pull 3 × 15$/i.test(rows[2]));
  const chips = await pg.locator('.dchips button').allInnerTexts();
  check(`the other days as chips (${chips.join(' | ')})`, chips.join('|') === 'Day 1 · Push + Quads|Day 3 · Mixed|Quick workout|+ New day');
  await pg.locator('.dchips button', { hasText: 'Mixed' }).click();
  check('a chip opens its card, with Start', await pg.locator('.dcard', { hasText: 'Mixed' }).getByRole('button', { name: 'Start' }).count() === 1);
  await pg.locator('.dchips button', { hasText: 'Mixed' }).click();
  check('…and closes it', await pg.locator('.dcard', { hasText: 'Mixed' }).count() === 0);
  check('the rest is folded', await pg.locator('details.wmore').getAttribute('open') === null && !(await pg.locator('.tile.strength').isVisible()));
  await pg.screenshot({ path: OUT + 'workouthome.png' });
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);
  await pg.locator('details.wmore > summary').click(); await pg.waitForTimeout(200);
  check('opened: strength and the premade programs are there', await pg.locator('.tile.strength').isVisible() && await pg.getByText('Premade workouts').isVisible());
  await pg.reload(); await pg.waitForSelector('.wstrip');
  check('left open, it opens open after a reload', await pg.locator('details.wmore').getAttribute('open') !== null);
  await pg.locator('.dcard.next').getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(300);
  check('Start starts Pull', await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')).workouts.some((w) => w.template === 'Pull' && w.endedAt == null)));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
