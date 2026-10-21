// Review shots (PLAN 151): a screen as he sees it — 60 days of the sample, a band that fits it, the AI off — at the times
// of day and widths given, cut into screen-sized pictures plus the screen's text. Not a test: nothing passes or fails.
//   E2E_DIST=dist node e2e/tools/shots.cjs today,insights/sleep 07:30,22:30 390,1280
// Serves E2E_DIST (default dist/) on E2E_PORT (default 4329) itself; pictures go to E2E_OUT (default e2e/out/review/).
const path = require('node:path'), fs = require('node:fs'), http = require('node:http');
const { chromium, handle } = require('../harness.cjs');
const { sampleBand, routeBand } = require('./sampleband.cjs');

const [routes = 'today', times = '07:30,15:00,22:30', widths = '390'] = process.argv.slice(2);
const DIST = path.resolve(process.env.E2E_DIST || 'dist'), PORT = +(process.env.E2E_PORT || 4329);
const OUT = process.env.E2E_OUT || path.join(__dirname, '..', 'out', 'review') + path.sep, DAYISO = process.env.DAY || '2026-10-21';
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((ok) => server.listen(PORT, ok));
  const APP = `http://localhost:${PORT}/`, b = await chromium.launch();
  for (const t of times.split(',')) for (const w of widths.split(',').map(Number)) {
    // past midnight is still the evening before
    const now = new Date(`${DAYISO}T${t}:00`).getTime() + (t < '04:00' ? 86_400_000 : 0);
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"the AI is off in review shots"}' }));
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.clock.install({ time: now });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
    const s = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
    await routeBand(ctx, sampleBand(s.entries || [], s.workouts || [], now), now);
    for (const route of routes.split(',')) {
      // the tab bar is on every screen (not every screen has a Settings link — Log hasn't)
      await pg.goto(APP + '#' + route); await pg.reload(); await pg.waitForSelector('nav.tabs'); await pg.waitForTimeout(1500);
      const tag = `${route.replace(/\//g, '-')}-${t.replace(':', '')}-${w}`, h = await pg.evaluate(() => document.documentElement.scrollHeight);
      const n = Math.ceil(h / 800);
      for (let k = 0; k < n; k++) { await pg.evaluate((y) => window.scrollTo(0, y), k * 800); await pg.waitForTimeout(120); await pg.screenshot({ path: `${OUT}${tag}-${k}.png` }); }
      fs.writeFileSync(`${OUT}${tag}.txt`, await pg.locator('main').innerText().catch(() => ''));
      console.log(`${tag}: ${h} px, ${n} shots${errs.length ? `, errors: ${JSON.stringify(errs)}` : ''}`);
    }
    await ctx.close();
  }
  await b.close(); server.close();
})().catch((e) => { console.log('CRASH', e.message); server.close(); process.exit(1); });
