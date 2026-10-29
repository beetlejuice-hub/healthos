// Reform T3 (owner, 29 Oct: Yes to "The morning read leaves by itself" — "At 12:00 it moves to “Done today: morning read ›”
// on its own. It's still one tap away."). Thu 29 Oct, a morning read written at 08:00: at 11:50 it's in For you; at 12:05
// it's under "Done today", not in the cycle; a tap brings it back and a reload keeps it back. Control: a read written at
// your first open at 13:00 is still on show at 14:30, and goes at 15:05.
const { chromium, APP, handle, tables, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (hm) => new Date(`2026-10-29T${hm}:00`).getTime();
const READ = (at) => ({ day: '2026-10-29', at, greeting: 'Morning! 7 h last night.', items: [{ type: 'pattern', title: 'Yesterday was foggy', text: 'Focus 3 at 11:36 yesterday, after 5 h of sleep.', tip: 'Take the hard task before 11 today', measure: 'focus' }] });

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(time, written) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: T(time) });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, d]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl', kind: 'sleep', at: d.at - 60_000, rating: 7 }]; s.ai = { ...(s.ai || {}), digest: d, night: null, chat: [] }; localStorage.setItem(k, JSON.stringify(s)); localStorage.removeItem('healthos.foryou'); }, [KEY, READ(T(written))]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status'); await pg.waitForTimeout(300);
    return { ctx, pg };
  }
  const later = async (pg, hm) => { await pg.clock.setSystemTime(T(hm)); await pg.reload(); await pg.waitForSelector('.t2-status'); await pg.waitForTimeout(300); };
  const doneToday = (pg) => pg.locator('.fy-reads').innerText().catch(() => '');

  let { ctx, pg } = await open('11:50', '08:00');
  check('11:50: the morning read is in For you', await forYou(pg, 'morning'));
  await later(pg, '12:05');
  check(`12:05: out of the cycle, under "Done today" (${await doneToday(pg)})`, !(await forYou(pg, 'morning')) && /Done today: morning read ›/.test(await doneToday(pg)));
  await pg.locator('.fy-reads').getByRole('button', { name: 'morning read ›' }).click(); await pg.waitForTimeout(200);
  check('a tap brings it back, on show', await pg.locator('.fy-item[data-current]').getAttribute('data-key') === 'morning');
  await later(pg, '12:20');
  check('…and a reload keeps it back', await forYou(pg, 'morning') && !/morning read/.test(await doneToday(pg)));
  await ctx.close();

  ({ ctx, pg } = await open('14:30', '13:00'));
  check('control: written at 13:00, still on show at 14:30', await forYou(pg, 'morning'));
  await later(pg, '15:05');
  check(`…and gone to "Done today" at 15:05 (${await doneToday(pg)})`, !(await forYou(pg, 'morning')) && /morning read ›/.test(await doneToday(pg)));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
