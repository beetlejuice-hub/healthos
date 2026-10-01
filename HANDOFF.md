# Handoff — start here (new agent)

Read in this order: this file → `CLAUDE.md` (how to work, checks, data rules) → `PLAN.md` (every
feature with the owner's decisions, numbered 1–13) → the code. Everything an agent needs is in the
repo; nothing lives only in a chat.

## State (1 Oct 2026, commit after 0978ab1)

Live at https://healthos.lukacsarnold9.workers.dev (push to `main` = deploy; Settings shows the
live commit). All checks green: 205 unit, 152 browser.

## Map of the code

| Where | What |
|---|---|
| `src/lib/` | All logic, pure and tested: caffeine/alcohol curves, nutrition, weight trend + real burn (`tdee.ts`), effect engine (`detectors/effects.ts`, `regress.ts`), scout (`scout.ts`), Noticed (`findings.ts`), stack check (`stackcheck/`), food parsing (`quickadd.ts`, `units.ts`, `fillin.ts`, `foodgroup.ts`), training (`training.ts`), store + sync (`store.ts`, `sync.ts`) |
| `src/lib/ai/` | The in-app AI: contract + prompts + answer checks (`tasks.ts`), context sent (`context.ts`), saving answers + experiment verdicts (`apply.ts`), app-side calls (`client.ts`) |
| `worker/` | Cloudflare Worker: static app, `/api/food` (Open Food Facts + USDA), `/api/ai` (`ai.ts`) |
| `src/screens/`, `src/components/` | UI. Today, Log, Workout, Insights, AI (chat), Settings |
| `e2e/` | Browser suites against a fake Supabase and fake APIs (`harness.cjs`); `bun run e2e` |
| `src/lib/bench.ts` | Fake people with planted effects — how every statistical engine is tested |

## Secrets (owner sets them in Cloudflare; never ask for them in chat)

`ANTHROPIC_API_KEY` (AI on/off), optional `USDA_KEY`. Supabase URL + publishable key are public in
`src/lib/supabase.ts`.

## Open items, owner's priority order

1. Owner adds `ANTHROPIC_API_KEY`; then check real AI answers (food, photo, morning read) on the
   test account and tune prompts in `src/lib/ai/tasks.ts`.
2. iPhone push notifications (web push + a Cloudflare Cron schedule; app must be on the Home Screen).
3. AI-researched clashes into the stack check table and Today's red alert.
4. Daytime energy check-ins (so "flat at 4pm" can be seen), asked by the AI's questions.
5. Fitbit Charge 6 once the owner buys it (parked). Optional `USDA_KEY`.
6. Maybe: other AI providers behind the same `/api/ai` contract (only `callModel` in `worker/ai.ts`
   is provider-specific).

## The owner, in short

Arnold, Hungarian, iPhone, has psoriasis, may have ADHD: logging must be quick and rewarding,
suggestions over forms. Wants engines and real statistics over AI guesses, medical accuracy,
proactive ideas, plans written up in Docs before big builds, everything tested. Casual tone.

## Planning docs (Claude Docs, owner can share them)

AI proposal + model costs: https://claude.ai/code/artifact/79f0b380-62ce-45ae-bb1f-947d35c933b2 ·
earlier: Noticed plan, Stack check, Simple logging, Noticed phase 2, How the engines think.
