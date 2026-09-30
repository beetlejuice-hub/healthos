# HealthOS

**Your body's data in one place: what you eat, take and train, what your wearable measures, and
what it all does to you.**

Started 29 Sept 2026. Owner: Arnold. Answers behind this: the "HealthOS — Discovery Questions" doc.

---

## 1. Why

Understand your own body, see a lot of data about it, push limits, and find out what AI can do
with it. Goals right now: good sleep, good mental health, muscle. Long-term trends matter more
than today. For you only; not a product.

**What kills it:** engines and equations that don't work. It should be feature-rich but not buggy,
and not look "AI-made".

## 2. Soft rules (carried over from Tempo — any can be broken, ask first)

1. **Usable at every step.** Never leave it broken between sessions.
2. **One phase at a time**, used for real before the next. Owner approves each phase.
3. **The engine is pure and tested.** Every calculation (caffeine curve, averages, progression,
   correlations) lives in `/lib` as pure functions with real tests. None inside components.
4. **Verify through the call site, not just the pure function.**
5. **Claim before you build** — mark an item claimed in this doc and push that first.
6. **No shaming, no scaring, no streaks.** Health numbers are facts, shown plainly.
7. **This doc stays dense.** Delete finished items; not a changelog.
8. **Mock whole screens before writing design rules.** Prototypes in `prototypes/`.

## 3. v1 — what ships first

Food, supplements and intake, gym workouts. A place for the wearable, not connected yet (no
device yet — plan is a Fitbit-type band). Tempo link and AI come later. Starting fresh, no import.

### Food
- Calories mainly; protein/carbs/fat shown but not the focus. No targets yet.
- Log from a big food database (Open Food Facts first) + everything you add once is saved and
  offered again. Saved meals. Recipes maybe later. AI "2 eggs, toast" parsing later.
- Log at the time or catch up later. Meal times matter.
- Eating out: log kcal or an estimate.
- **A day clearly not logged is excluded from averages** — a 0 kcal day must not skew anything.
- Not repetitive eater, so search speed matters more than "repeat yesterday".

### Intake (the heart of the app)
- Current stack: creatine, magnesium 400 mg (night), vitamin D, coffee ×2, saffron 30 mg, black
  cumin seed oil.
- **Caffeine-in-body curve** (half-life ~5h), drawn on the same chart as wearable data later
  (e.g. heart rate vs coffee). Same for alcohol and other supplements where the stats exist.
- Drinks come from a database (one Red Bull, one espresso); own values allowed. A few mg off is fine.
- Daily stack: set once (e.g. 400 mg magnesium at night); at end of day tick ✓ or ✗. Tap to log,
  or custom amount.
- Cycling / on-off experiments: yes. Rate the effect afterwards: yes.
- Alcohol and nicotine: yes. Interaction/timing warnings: YES.
- AI later researches side effects and watches for them.
- No stock tracking. No blood tests for now.

### Workouts and body
- Gym 3×/week, own split. Log every set (weight × reps) during the workout.
- Suggest next weight/reps. Cardio imported from the wearable later.
- "Improving" = all of it: 1RM estimates, volume, and more — see data plus insights.
- Weight daily. Personal records: noted, not celebrated.

### Feelings
- Energy, mood, focus, anxiety, stress. Slider plus a word. Symptoms: yes. Notes: **yes** (how I
  felt at the gym, after a supplement, after a task). How often: not decided.

## 4. Later

- **Wearable:** iPhone + a Fitbit-type band. All metrics. Automatic, as live as possible. Raw
  data vs summaries decided when we see what the API gives. Smart scale later. Nights without
  data are skipped.
- **Tempo link:** decide later. Separate Supabase project, same account.
- **Insights:** preset views only at first; show values against targets; a report screen; mark
  events on graphs (started creatine, sick…); export: yes. Needs: a day view graph, readiness,
  sleep. The "5 questions the graphs answer" are still open — propose them in prototypes.
- **AI:** does everything eventually — summaries, correlations, experiments ("magnesium 3 weeks
  on/off"), predictions (sleep score, weight, health). Confidence as a %. Speaks up on its own,
  gentle suggestions. Sending data to an AI API is OK. Budget ~€20/month.

## 5. Design

- **Web app** (installable to the home screen), not native — Fitbit's data comes through its own
  web API, so native isn't needed. Revisit only for an Apple Watch or lock-screen widgets.
- Log on the phone, insights on the laptop. Dark for now.
- Lots of data, raw data too, **plus a calm text summary** screen.
- kg, kcal, 24h time, English.
- Look: being chosen — `prototypes/looks.html` (4 directions). Notifications: to talk through.

## 6. Tech

Vite + React + TypeScript · Supabase (own project, same account as Tempo) · Cloudflare. Offline
not required. Cloud storage OK. A test account for agents like Tempo's: maybe. Running cost
~€20/month is fine. Private repo `healthos`.

## 6b. Learned, not configured (owner, 30 Sept)

Numbers that describe *you* are learned from your data (and general knowledge), never typed into
a form. Until there's enough data they use sensible defaults, silently.
- **Caffeine half-life** — default 5 h; later fitted from caffeine vs heart rate / sleep.
- **Caffeine at bedtime** — no user "limit". The app watches caffeine-at-bedtime against sleep
  score, time to fall asleep and night heart rate, and *tells you what it notices*: "on nights with
  100+ mg left your sleep score averaged 12 lower (n=14)" — or "you sleep fine with 150 mg; you may
  clear it fast or be less sensitive". It never quietly raises a threshold; it says what it saw.
- **Usual drink** — picked on Today (☆), not a mg setting.
- **Bedtime** — the planned bedtime is the only input; real bedtime comes from the wearable.
- **Macro goals** — fixed for now (owner likes them); later adjusted from weight trend, goal
  (cut/bulk/maintain), training load and lifestyle.

## 6c. Food search, wearable, backlog (owner, 30 Sept)

- **Food search** runs on our Worker (`/api/food`): Open Food Facts (~3M branded products) +
  USDA FoodData Central (plain foods), merged and cached a day; ~100 built-in everyday foods answer
  instantly offline. Optional: a free USDA key as the `USDA_KEY` Worker secret (else DEMO_KEY).
- **Search results** (lib/foodgroup.ts): the same food from many brands collapses into one
  *typical* row — the median of their labels, with the brand spread shown and the products one tap
  away. Labels that don't add up (kcal vs 4P+4C+9F, >900 kcal) are flagged and left out of the
  median. A brand you type stays its own row, at the top. Small product photos from OFF.
- **Your values win:** any food's numbers can be edited before logging; the corrected version is
  saved and offered first next time.
- **Search ideas not built yet:** rank by what you actually log (your brands float up); dry vs
  cooked hint for pasta/rice/meat; English USDA lookup for Hungarian words (spagetti → spaghetti);
  AI "2 eggs, toast, 300 g pörkölt" parsing.
- **Barcode scanner** — wanted, parked for now.
- **Wearable** — **Fitbit Charge 6** (owner, 30 Sept; not bought yet, so parked). Criterion: an official API the web app can read (heart rate,
  sleep stages, HRV, resting HR). Fitbit has one (OAuth web API, intraday data for your own
  account); Huawei and Zepp/Amazfit are far harder to read from a web app. Check before buying.

## 7. Status and next

**Built (29 Sept):** Today, Log (food via Open Food Facts + saved foods, drinks, stack, weight),
Workout (templates, suggested weights, rest timer), Insights (master graph + panels), Settings
(goals, caffeine/sleep, sample data, export). All logic in `src/lib`, tested. Email/password
login; data saved on the device first and synced per account. Accounts with `+test` in the
email get Dev tools (`#dev`): raw entry editor, generate/remove sample, wipe account.

1. [x] **Supabase sync** — built 29 Sept, tested two-device against a fake Supabase (12/12).
   Owner runs `supabase/migrations/0001_init.sql` once in the SQL editor.
2. [x] **Deploy** — `wrangler deploy` builds first (`wrangler.jsonc`), so Cloudflare's default
   deploy command is enough.
3. [ ] Owner sets real goals (Settings) and uses it for a few days.
4. [ ] Wearable: pick the device, then import heart rate, sleep, HRV into the master graph.
5. [ ] **Noticed** (findings engine; plan: https://claude.ai/code/artifact/f8d98b61-fc4a-421b-b7d7-ddbe1276e725).
   Phase 1 **built 30 Sept**: `lib/findings.ts` (cards + "still checking"), `lib/tdee.ts` (real burn
   from intake − weight trend × 7,700; 95% trend range, 0.15 kg/wk smallest claim), `lib/bench.ts`
   (planted-effect worlds; burn inside its 90% range ~90% of seeds, <10% false weight alarms),
   Noticed section atop Insights, one ✕-able line on Today. Phase 2 started: **caffeine habit**
   (`lib/detectors/caffeine.ts`: mg/day, mg/kg band light/moderate/high = tolerance, usual drink,
   first/last time). Next: late caffeine, supp on/off, alcohol, protein vs strength, load, eating.
6. [x] **Stack check** (plan: https://claude.ai/code/artifact/67da9d55-42a1-4d3b-81cd-342a76bff245), built
   30 Sept. Settings → About me (conditions, medications, allergies, notes; synced `profile` doc).
   `lib/stackcheck/kb.ts`: curated items (EN + HU + brand names) and rules, each with evidence grade,
   sources, reviewed date, `verified: false` (sandbox saw search summaries only — verify against full
   sources). `check.ts`: stack + meds + drinks logged in 30 days × conditions/meds/each other.
   Badges in Log → Stack (live while typing a new one), Insights → Stack check table + "worth asking
   your doctor about", Today alert for "avoid" only. Unknown names say "not checked yet".
   Owner's answers (30 Sept): evening feel card on Today ✓ (+ a reminder notification — needs web
   push, not built); real burn only *suggests* goal changes; not tracking closely yet, so 1–2 bad
   days must not corrupt anything (typo weigh-ins and partial days are dropped ✓); 75% / one line /
   words-first defaults stand; AI key and first experiment: later. Has psoriasis — wants an
   "about me" fact list and AI memory (to discuss); flare tracking is an obvious detector.
