# HealthOS

Your body's data in one place. See [PLAN.md](PLAN.md).

```bash
bun install
bun run dev        # local
bun run test       # 68 tests on the logic in src/lib
npx wrangler deploy  # builds, then deploys to Cloudflare
```

**One-time database setup:** paste `supabase/migrations/0001_init.sql` into the Supabase SQL
editor and run it.

**Accounts:** sign up in the app. Any email with `+test` in it (e.g. `you+healthtest@gmail.com`)
is a tester account and gets Dev tools under Settings.
