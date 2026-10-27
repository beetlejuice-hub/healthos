#!/usr/bin/env bash
# Build the app, serve dist/, and run the browser suites against a fake Supabase — several at a time.
# Each suite is its own process with its own fake backend, browser and screenshots, so they don't share state.
#   e2e/run.sh                  every suite, E2E_JOBS at a time (default: the CPU count)
#   e2e/run.sh sleep sipped     just these (names as in the list below), for a quick loop while working
# Each suite prints PASS/FAIL lines and "errors: [...]" (console errors seen). Live: one line per suite as it ends.
# Then every suite's output in list order, the slowest five, and exit 1 on any FAIL, CRASH, error or non-zero exit.
set -u
cd "$(dirname "$0")/.."
ALL=(
  features search noticed stackcheck simple workout morning scout round ai sync drinks scan reset fixes between
  bodyfat hownow push searchpass now cafsleep earlier night slider workoutplus muscles dose labelphoto graph glance
  mind connections body stack top phone plan session checkin today2 polish band heart compare sleep heartpage
  mindpage sleeponce suppamount catchup suppafter steps fixes13 editentry bandbehind camhold explain
  workoutsets burned tellmore sipped supplog sleepfood tonight sleepneed training trainingb trainingc workoutpick sleepscore readiness inbox energy review questions propose morningread chatfold notthis suppout foodday foodscore variants nightworkout cardio goals notice workoutfix strength repranges guard cardiotraining nightcheck vo2 workoutzones readband readlooks deepdive verdict xpstrip dayscore readretry leftovers readsure askabout nightlane chatdelete heartask eatgoal foodgap foodtap lead leads smoke recovery bodylab coins wound bodyclock ghost feltweak fitage
)
if [ $# -gt 0 ]; then SUITES=("$@"); else SUITES=("${ALL[@]}"); fi
JOBS=${E2E_JOBS:-$(nproc)}
PORT=${E2E_PORT:-4321}
DIST=${E2E_DIST:-dist}   # another folder (and E2E_PORT) lets a second run go while one is serving dist/
npx vite build --outDir "$DIST" --emptyOutDir >/dev/null || exit 1
python3 -m http.server "$PORT" --directory "$DIST" >/dev/null 2>&1 &
server=$!
tmp=$(mktemp -d)
trap 'kill $server 2>/dev/null; rm -rf "$tmp"' EXIT
sleep 1
export APP_URL="http://localhost:$PORT/" E2E_DIST="$(cd "$DIST" && pwd)" tmp   # suites that read the built page (now.cjs) read this one
t0=$(date +%s)
one() {
  local s=$1 f="$tmp/$1.out" a b
  a=$(date +%s); node "e2e/$s.cjs" >"$f" 2>&1; echo "exit $?" >>"$f"; b=$(date +%s)
  echo "$((b - a)) $s" >"$tmp/$s.time"
  if grep -q "^FAIL\|^CRASH" "$f" || ! grep -q '^errors: \[\]' "$f" || ! grep -q '^exit 0$' "$f"; then echo "FAIL $s ($((b - a))s)"; else echo "ok   $s ($((b - a))s)"; fi
}
export -f one
printf '%s\n' "${SUITES[@]}" | xargs -P "$JOBS" -I{} bash -c 'one "$1"' _ {}
fail=0
for s in "${SUITES[@]}"; do
  f="$tmp/$s.out"
  echo "== e2e/$s.cjs"
  grep -v '^exit [0-9]*$' "$f"
  if grep -q "^FAIL\|^CRASH" "$f" || ! grep -q '^errors: \[\]' "$f" || ! grep -q '^exit 0$' "$f"; then fail=1; fi
done
echo "== $(( $(date +%s) - t0 ))s for ${#SUITES[@]} suites, $JOBS at a time · slowest: $(cat "$tmp"/*.time | sort -rn | head -5 | awk '{printf "%s %ss  ", $2, $1}')"
exit $fail
