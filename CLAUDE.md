# HealthOS — notes for agents

Personal health app for one owner (Arnold). Read `PLAN.md` first: what exists, what's next, the
owner's decisions (new here? `HANDOFF.md` first). Vite + React 19 + TypeScript, Supabase (auth +
sync), Cloudflare Worker (`worker/`: static app, `/api/food`, `/api/ai`). Pushing to `main` deploys.

## How to work here

Work like an owner, not a ticket-taker.

- Finish the loop. "Done" means verified the way the owner will use it: run the app, click through
  it in a real browser, screenshot it and look at the screenshot with a picky eye. Check CI and the
  deploy after pushing (Settings shows the live commit). Say plainly what you could NOT verify.
- If you can't reach something (API, database, network), build a stand-in: a fake backend,
  intercepted requests, fixture data. Never skip testing because "it's external".
- Numbers must be proven. Logic lives in pure functions in `src/lib` with tests against cases with
  known answers. For anything statistical, plant a known effect in fake data (`src/lib/bench.ts`)
  and check you find it — and that you DON'T find effects that aren't there.
- Attack your own work before shipping: re-read the diff as a harsh reviewer, try the edge cases
  (empty account, bad input, typo data, phone and laptop width).
- Think past the literal ask. A bug, a better design, a missing feature you notice: say it in one
  line with your recommendation. When you finish, offer 2–4 concrete next steps and say which
  you'd pick and why.
- Ask only for real decisions (taste, money, accounts, anything irreversible). Otherwise pick a
  sensible default, say which one you picked, keep going.
- Big features: write the plan first (why, what it looks like, how it's built, how it's tested,
  phases, open questions), then start phase 1 right away with the defaults.
- Design work goes on a Design canvas artifact first (owner, 6 Oct: *"i did not know u had that canvas
  thingy, its awesome, u should use that always"*): a few directions side by side at phone size, in
  the app's real colours and fonts, the chosen one clickable — then build what he picks.
- Talk like a colleague: short updates while working, results first, no jargon, no padding. Keep
  `PLAN.md` current, claim work there before building it, commit messages say why.

## Checks (run all before pushing)

```
bun run typecheck && bun run lint && bun run test    # unit tests, incl. the Worker against a fake internet
bun run e2e                                          # builds, serves dist/ on :4321, runs every browser suite
```

`e2e/` suites drive Chromium against a **fake Supabase** (`e2e/harness.cjs`, request interception)
and fake food databases, so they need no network or real accounts. Each prints PASS/FAIL lines and
`errors: [...]` (console errors seen, must be empty); screenshots land in `e2e/out/`. Add a suite
for every user-visible feature.

## Data rules

- **The owner's real account is read-only for agents.** Test on `lukacsarnold9+healthtest@gmail.com`
  (the owner gives the password); `+test` accounts get Dev tools at `#dev`.
- A day with nothing logged is not a 0 kcal day; averages use logged days and say how many.
- No shaming, no streaks, no scary health claims. Findings say "goes with", never "causes", unless
  an experiment showed it. No medical advice.
