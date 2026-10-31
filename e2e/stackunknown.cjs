// Stack check, what isn't in the checked list (owner, 29 Oct, a screenshot of "Not checked yet: L-theanine — the AI phase
// will research these": "Feel like this part is not working"). The AI look-up existed (the stack editor's "AI: what is
// it?") but this card never showed it. Now: L-theanine, already looked up, shows what the AI found; Shilajit, not yet,
// has the look-up — tapped (AI faked), its answer shows. No "AI phase" anywhere. Control: a server with no AI key →
// "the AI is off". 320 px fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-10-31T12:00:00').getTime();
const LT = { name: 'L-theanine', what: 'Amino acid from tea leaves', usualDose: '200 mg', timing: 'any regular time', evidence: 'moderate', uses: ['calm focus'], cautions: [], interactions: [{ with: 'caffeine', verdict: 'may-help', say: 'Often paired with caffeine for smoother focus' }], sources: [{ title: 'Examine', url: 'https://example.org/lt' }], at: NOW - 86400000, asked: 'L-theanine' };
const SH = { name: 'Shilajit', what: 'Mineral resin from mountain rock', usualDose: '300 mg', timing: 'any regular time', evidence: 'weak', uses: ['energy'], cautions: ['Buy purified: raw resin can carry heavy metals'], interactions: [], sources: [{ title: 'NIH', url: 'https://example.org/sh' }] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, ai) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', ai);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, lt]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.supplements = [{ id: 'lt', name: 'L-theanine', dose: '200 mg', slot: 'morning', at: 480, active: true }, { id: 'sh', name: 'Shilajit', dose: '300 mg', slot: 'morning', at: 480, active: true }, { id: 'd3', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: true }];
      s.profile = { ...(s.profile || {}), conditions: ['Psoriasis'], meds: [], allergies: [], notes: '' };
      s.ai = { ...(s.ai || {}), research: { lt } }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, LT]);
    await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('#stackcheck', { timeout: 15000 });
    return { ctx, pg };
  }
  const card = (pg) => pg.locator('#stackcheck');
  const text = async (pg) => (await card(pg).innerText()).replace(/\s+/g, ' ');

  let { ctx, pg } = await open(320, (r) => {
    if (r.request().url().includes('/api/ai/usage')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) });
    const body = r.request().postDataJSON();
    if (body && body.task === 'supplement') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: SH }) });
    return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
  });
  let t = await text(pg);
  check(`no "AI phase" promise (${t.slice(-260)})`, !/AI phase/.test(t));
  check('L-theanine, looked up already: what the AI found', /Not in the checked list L-theanine AI: Amino acid from tea leaves · evidence moderate · 1 note/i.test(t));
  const shRow = card(pg).locator('.sc-unk', { hasText: 'Shilajit' });
  check(`Shilajit, not yet: the look-up is there (${(await shRow.innerText()).replace(/\s+/g, ' ')})`, /^Shilajit AI: what is it\?$/.test((await shRow.innerText()).replace(/\s+/g, ' ').trim()));
  await card(pg).locator('.sc-unk', { hasText: 'Shilajit' }).getByRole('button', { name: 'AI: what is it?' }).click(); await pg.waitForTimeout(500);
  t = await text(pg);
  check(`tapped: Shilajit's answer shows (${t.match(/Shilajit[^.]*/)?.[0]})`, /Shilajit AI: Mineral resin from mountain rock · evidence weak/.test(t));
  await card(pg).locator('.sc-unk', { hasText: 'L-theanine' }).getByRole('button', { name: /AI: Amino acid/ }).click(); await pg.waitForTimeout(150);
  check('opened: the note and its source', /may-help with caffeine — Often paired with caffeine for smoother focus/i.test(await text(pg)) && await card(pg).locator('a[href="https://example.org/lt"]').count() === 1);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'stackunknown-320.png' });
  await ctx.close();

  // control: the server says the AI is off → "the AI is off" (nothing that can't work is offered)
  ({ ctx, pg } = await open(390, (r) => (r.request().url().includes('/api/ai/usage') ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: false }) }) : r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"no-key","message":"The AI isn\'t set up"}' }))));
  await pg.waitForTimeout(400);
  t = await text(pg);
  check(`control: no AI on the server → "the AI is off" for Shilajit; L-theanine's look-up stays (${t.match(/Shilajit[^.]*/)?.[0]})`, /Shilajit the AI is off — turn it on in Settings to look it up/.test(t) && /L-theanine AI: Amino acid/.test(t));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
