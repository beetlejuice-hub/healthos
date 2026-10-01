const { chromium, APP, OUT, handle } = require('./harness.cjs');
// The in-app AI against a fake /api/ai (no credits spent) and a fake food database:
// sentence → built-in, database median, then AI (saved, free next time); drink by description →
// "my usual"; supplement look-up; morning read → experiment; quick question; chat that writes first,
// memory; the AI-off state.
const calls = [];
const ANSWERS = {
  describe: (b) => /mystery/i.test(b.text || '') ? { items: [{ kind: 'food', name: 'Mystery stew', amount: '1 bowl', per100: { kcal: 120, p: 8, c: 10, f: 5 }, unit: { name: 'bowl', g: 350 }, count: 1, confidence: 'medium', note: 'assumed a beef and potato stew' }], dropped: [] }
    : { items: [{ kind: 'drink', name: 'Long coffee, large', amount: '1 big cup', drink: { ml: 300, caffeineMg: 150, alcoholG: 0, kcal: 3 }, confidence: 'medium', note: 'assumed a double shot' }], dropped: [] },
  supplement: () => ({ name: 'Ashwagandha', what: 'an adaptogen herb', usualDose: '300–600 mg extract', timing: 'any regular time', evidence: 'moderate', uses: ['stress', 'sleep'], cautions: ['may raise thyroid hormone'], interactions: [{ with: 'psoriasis', verdict: 'caution', say: 'immune-stimulating; may worsen autoimmune conditions' }], sources: [{ title: 'NIH ODS', url: 'https://ods.od.nih.gov/factsheets/Ashwagandha-HealthProfessional/' }] }),
  digest: () => ({ greeting: 'Morning! Quiet night, two things worth a look.', items: [
    { type: 'study', title: 'Saffron and mood: new meta-analysis', text: 'Pooled trials found a small lift in mood at 30 mg.', source: { title: 'J Affect Disord 2026', url: 'https://example.org/saffron' } },
    { type: 'pattern', title: 'Afternoon dips', text: 'Your 4pm energy is lower on days with a big lunch.' },
    { type: 'protocol', title: 'Try a 14:00 caffeine cut-off', text: 'Two weeks, then we compare.', protocol: { name: 'Caffeine cut-off 14:00', how: 'No caffeine after 14:00', days: 14, measure: 'energy' } },
  ] }),
  questions: () => ({ questions: [{ id: 'q', text: 'Your energy dips around 4pm — big lunch today?', why: 'to see if lunch size explains the dip', options: ['Big', 'Normal', 'Skipped'], key: 'lunch_size', repeat: 'daily' }] }),
  chat: () => ({ reply: 'Hey! Your afternoon energy is the thing to watch — the cut-off experiment will tell us.', remember: ['Usual coffee is a long coffee, big cup'] }),
};
const usage = (n) => ({ day: '2026-10-01', calls: n, dayUsd: n * 0.02, month: '2026-10', monthUsd: n * 0.02, byModel: { opus: n * 0.02 } });
const SALAMI = [['Salami', 380, 22, 1, 32], ['Salami', 400, 24, 1, 33], ['salami', 420, 25, 2, 35], ['Salami', 3900, 22, 1, 32]]
  .map(([name, kcal, p, c, f], i) => ({ id: `off:s${i}`, name, brand: `Brand ${i}`, per100: { kcal, p, c, f }, source: 'off' }));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(aiOn) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [] }) }));
    await ctx.route('**/api/food?**', (r) => { const q = new URL(r.request().url()).searchParams.get('q'); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ foods: /salami/i.test(q) ? SALAMI : [], sources: { off: 'ok', usda: 'ok' } }) }); });
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: usage(calls.length), cap: 50, on: aiOn }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON();
      if (!aiOn) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no-key', message: 'The AI is off.' }) });
      calls.push(body);
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWERS[body.task](body), usage: usage(calls.length), costUsd: 0.02, model: 'opus' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date(2026, 9, 1, 15, 0) });
    pg.on('dialog', (d) => d.accept());
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    return { ctx, pg };
  }

  try {
    const { ctx, pg } = await open(true);
    await pg.waitForTimeout(600);

    // Background: the morning read and today's questions are written on open (it's 15:00).
    check('morning read and questions were asked for', calls.some((c) => c.task === 'digest') && calls.some((c) => c.task === 'questions'));
    check('the context is a summary, not the raw log', /## About me[\s\S]*## Last 14 days/.test(calls.find((c) => c.task === 'digest').context) && !/"kind"/.test(calls.find((c) => c.task === 'digest').context));
    await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
    check('Today shows the morning read', /Quiet night, two things worth a look[\s\S]*Saffron and mood/.test(await pg.locator('.morning').innerText()));
    await pg.locator('.morning').getByRole('button', { name: '1 more' }).click();
    await pg.locator('.morning').getByRole('button', { name: 'Try it for 14 days' }).click();
    check('a protocol becomes a running experiment', /Running — see Insights/.test(await pg.locator('.morning').innerText()));
    check('a quick question with tappable answers', /big lunch today\?[\s\S]*Why: to see if lunch size explains the dip · asked daily/.test(await pg.locator('.question').innerText()));
    await pg.locator('.question').getByRole('button', { name: 'Big' }).click(); await pg.waitForTimeout(100);
    check('answered → gone for today', await pg.locator('.question').count() === 0);
    check('the AI tab has a dot: it wrote first', await pg.locator('nav.tabs a[href="#ai"] .tabdot').count() === 1);
    await pg.screenshot({ path: OUT + 'ai-today.png', fullPage: true });

    // Food: built-in, database median, then the AI for the rest.
    await pg.goto(APP + '#log/food');
    await pg.getByLabel('Type what you ate').fill('one small apple, 2 normal toast w butter, 2 slices of salami, zzz mystery stew');
    await pg.getByRole('button', { name: 'Add', exact: true }).click();
    await pg.waitForSelector('.bline:has-text("Mystery stew")', { timeout: 4000 });
    const lines = await pg.locator('.basket .bline .bname').allTextContents();
    check('apple, toast, butter from the built-in foods', /Apple/.test(lines[0]) && /Toast/.test(lines[1]) && /Butter/.test(lines[2]));
    check('salami: median of 3 products (the 3900 kcal label left out), 2 slices ≈ 25 g', lines.some((l) => /Salami.*median of 3 products · a slice ≈ 25 g/.test(l)));
    check('the rest asked the AI once, saved as an estimate', calls.filter((c) => c.task === 'describe').length === 1 && lines.some((l) => /Mystery stew.*AI estimate · assumed a beef and potato stew/.test(l)));
    await pg.screenshot({ path: OUT + 'ai-basket.png', fullPage: true });
    await pg.locator('.basket').getByRole('button', { name: /^Log / }).click(); await pg.waitForTimeout(150);
    await pg.getByLabel('Type what you ate').fill('zzz mystery stew'); await pg.getByRole('button', { name: 'Add', exact: true }).click(); await pg.waitForTimeout(300);
    check('typed again → found as your food, no second AI call', calls.filter((c) => c.task === 'describe').length === 1 && /Mystery stew/.test(await pg.locator('.basket').innerText()));
    await pg.locator('.basket .x').first().click();

    // Drink by description → saved → my usual.
    await pg.goto(APP + '#log/drink');
    await pg.getByLabel('Describe a drink to the AI').fill('my usual: a long coffee, big cup');
    await pg.getByRole('button', { name: 'Ask AI' }).click();
    await pg.waitForSelector('.made');
    check('the AI made a drink: 150 mg, says what it assumed', /Long coffee, large[\s\S]*150 mg caffeine · AI estimate — assumed a double shot/.test(await pg.locator('.made').innerText()));
    await pg.getByRole('button', { name: 'Make it my usual' }).click();
    await pg.goto(APP + '#today'); await pg.waitForTimeout(150);
    check('Today\'s one-tap button is now that coffee', await pg.getByRole('button', { name: '+ Long coffee, large' }).count() === 1);

    // A new supplement is looked up.
    await pg.goto(APP + '#settings');
    await pg.getByLabel('Conditions').fill('psoriasis'); await pg.getByLabel('Conditions').press('Enter');
    await pg.goto(APP + '#log/stack');
    await pg.getByRole('button', { name: '+ Add supplement' }).click();
    await pg.getByLabel('Name').fill('Ashwagandha'); await pg.getByRole('button', { name: 'Done' }).click();
    await pg.waitForSelector('text=AI: an adaptogen herb');
    const sup = calls.find((c) => c.task === 'supplement');
    check('looked up with About me in the context', sup && sup.name === 'Ashwagandha' && /psoriasis/.test(sup.context));
    await pg.getByRole('button', { name: /AI: an adaptogen herb/ }).click();
    check('shows dose, the psoriasis caution and its source', /300–600 mg[\s\S]*caution with psoriasis[\s\S]*NIH ODS/i.test(await pg.locator('.research').innerText()));
    await pg.screenshot({ path: OUT + 'ai-stack.png', fullPage: true });

    // Chat: the unprompted morning message is there; ask; it remembers.
    await pg.goto(APP + '#ai'); await pg.waitForTimeout(150);
    check('the AI\'s first message is in the chat', /☀️ Morning! Quiet night/.test(await pg.locator('.chat').innerText()));
    check('opening the chat clears the dot', await pg.locator('nav.tabs a[href="#ai"] .tabdot').count() === 0);
    await pg.getByLabel('Message the AI').fill('what should I try?'); await pg.getByRole('button', { name: 'Send' }).click();
    await pg.waitForSelector('text=cut-off experiment will tell us');
    const chat = calls.find((c) => c.task === 'chat');
    check('chat starts with your message, with the context', chat.messages[0].role === 'user' && chat.messages[0].text === 'what should I try?' && /## My stack/.test(chat.context));
    await pg.screenshot({ path: OUT + 'ai-chat.png', fullPage: true });
    await pg.goto(APP + '#settings'); await pg.waitForTimeout(200);
    const card = await pg.locator('#ai').innerText();
    check('Settings: on, calls today, model choice with a monthly estimate', /AI\s*on/.test(card) && /Today \d+ of 50 calls/.test(card) && /Claude Opus 5\.5 · ≈ \$/.test(card));
    check('memory shows what it learned', /Usual coffee is a long coffee, big cup/.test(card));
    await pg.getByRole('button', { name: 'Forget Usual coffee is a long coffee, big cup' }).click();
    check('…and you can delete it', !/Usual coffee is a long coffee/.test(await pg.locator('#ai').innerText()));
    await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
    check('"What the AI sees" shows the exact context', /## About me[\s\S]*psoriasis/.test(await pg.locator('.ctx').innerText()));
    await pg.screenshot({ path: OUT + 'ai-settings.png', fullPage: true });

    await pg.goto(APP + '#insights'); await pg.waitForTimeout(300);
    check('Insights lists the experiment', /Caffeine cut-off 14:00[\s\S]*Day 0 of 14/.test(await pg.locator('#experiments').innerText()));
    await ctx.close();

    // No key: the app says how to turn it on, and nothing breaks.
    const off = await open(false);
    await off.pg.goto(APP + '#ai'); await off.pg.waitForTimeout(200);
    check('AI off: the steps to add the key', /The AI is off[\s\S]*ANTHROPIC_API_KEY/.test(await off.pg.locator('.ai-screen').innerText()));
    await off.pg.goto(APP + '#log/food'); await off.pg.waitForTimeout(100);
    check('AI off: no photo button', await off.pg.getByRole('button', { name: '📷 Photo' }).count() === 0);
    await off.ctx.close();
  } catch (e) { console.log('CRASH ' + e.message); process.exitCode = 1; }
  console.log('errors: ' + JSON.stringify(errs));
  await b.close();
})();
