#!/usr/bin/env bash
# Build the app, serve dist/ on :4321, run every browser suite against a fake Supabase.
# Each suite prints PASS/FAIL lines and "errors: [...]" (console errors seen); exit 1 on any FAIL.
set -u
cd "$(dirname "$0")/.."
npx vite build >/dev/null || exit 1
python3 -m http.server 4321 --directory dist >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1
fail=0
for suite in e2e/features.cjs e2e/search.cjs e2e/noticed.cjs e2e/stackcheck.cjs e2e/simple.cjs e2e/workout.cjs e2e/morning.cjs e2e/scout.cjs e2e/round.cjs e2e/ai.cjs e2e/sync.cjs e2e/drinks.cjs e2e/scan.cjs e2e/reset.cjs e2e/fixes.cjs e2e/between.cjs e2e/bodyfat.cjs e2e/hownow.cjs e2e/push.cjs e2e/searchpass.cjs e2e/weekly.cjs e2e/now.cjs e2e/cafsleep.cjs e2e/earlier.cjs e2e/night.cjs e2e/slider.cjs e2e/workoutplus.cjs; do
  echo "== $suite"
  out=$(node "$suite") || fail=1
  echo "$out"
  grep -q "^FAIL\|^CRASH" <<<"$out" && fail=1
  grep -q '^errors: \[\]' <<<"$out" || fail=1
done
exit $fail
