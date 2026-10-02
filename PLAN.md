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
- **Barcode scanner** — built 1 Oct (see item 17).
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
   The in-app AI (later) owns keeping this knowledge current: verifying, web search, new items.
7. [x] **Simple logging** (plan: https://claude.ai/code/artifact/e89e63f5-473f-48c3-ac7f-88310365d99e), built
   30 Sept. Food is counted, not weighed: every everyday food has units (egg, slice, apple, bowl…),
   `lib/units.ts`; a meal basket with − / +, ≈ totals rounded to 10, one log + one undo; "type what
   you ate" (`lib/quickadd.ts`, EN + HU, asks "did you mean" only when calories would differ >25%);
   "Save as a meal" → counted in pieces ("3 Arnold's special"). Feelings log only the sliders you
   touch (`lib/feel.ts`). Workouts end 60 min after the last set, dated to it; empty ones drop after
   30 min; Today shows a running workout (`tidyWorkouts` in lib/training.ts).
8. [x] **Noticed phase 2** (plan: https://claude.ai/code/artifact/0ecb4b53-51c6-44dd-86cb-24db258920f0), built
   30 Sept. `lib/detectors/effects.ts`: ~60 questions (late caffeine, caffeine at bedtime, alcohol,
   each supplement, gym, volume, late eating, protein, calories vs usual × energy/mood/focus/stress;
   gym/weekend × calories), each an OLS with weekend + yesterday + drift (`lib/regress.ts`), BH 10%
   across all, split-half replication, min effect 0.5 pt / 150 kcal; answers found / no effect /
   still checking (supplements taken daily → "N days without it"). One card per cause. Also
   baseline, strength trend per lift, protein g/kg vs 1.6 (Morton 2018). Bench (`feelWorld`): a
   1-point effect found in 83% of fake people by 90 days (62% by 60), false alarms ≤10%, not fooled
   by weekends or drift. Reaction test: owner said no.
   AI food (later): unreadable text → ask AI once → saved as your food → free next time.
9. [x] **Workouts: your own split**, built 30 Sept. Edit/add/delete split days (name, exercises with
   suggestions, sets × reps, rest, reorder; renaming carries history along). The day due in your
   rotation shows first ("Up next"). Quick workout with no plan. In a session: add an exercise, swap
   one (before its first set), History (last 5 sessions + est. 1RM), a note ("How did it feel?").
   Each session keeps its own copy of the plan, so today's changes never edit the split.
10. [x] **Walk-through fixes** (30 Sept): drinks in the food sentence ("2 eggs, toast, coffee" → coffee
   logged as a drink with its caffeine; EN + HU names, your own drinks); morning weigh-in on Today
   (5:00–11:00, yesterday's weight pre-filled); Stack tab is a compact list with Edit per row, and
   "no known link" badges only once About me has something to check against.
11. [x] **Scout — "worth a look"** (1 Oct), `lib/scout.ts`. Every cross-family pair of daily signals
   (food, biggest meal, protein, late eating, caffeine, late caffeine, alcohol, gym, volume, each
   supplement, energy/mood/focus/stress; wearable signals plug in the same way), same day and next
   day: ranks with weekends/weekdays centred separately, |r| ≥ 0.35, p < 0.005, 14+ days, one per
   family pair, top 5. Each says how often it held ("13 of 14"), is labelled "could be chance", and
   is re-checked on days after it was flagged (memo synced per account): ≥75% of 5+ new days →
   "holding up", <50% → fades. Measured: ~0.9 chance flags per made-up person at 30–60 days, 0.3
   at 90. Today line + Insights tab dot for unseen patterns; "Show on graph" sets the master graph
   to the two lanes (overlaid where possible) and shades the days; "Not interesting" dismisses.
   Master graph gained Focus, Stress and Calories-per-day lanes. Push notifications: later.
   Owner's answers (30 Sept): evening feel card on Today ✓ (+ a reminder notification — needs web
   push, not built); real burn only *suggests* goal changes; not tracking closely yet, so 1–2 bad
   days must not corrupt anything (typo weigh-ins and partial days are dropped ✓); 75% / one line /
   words-first defaults stand; AI key and first experiment: later. Has psoriasis — wants an
   "about me" fact list and AI memory (to discuss); flare tracking is an obvious detector.
12. [x] **Owner's 1 Oct list** (no-AI half). Log for earlier: "coffee at 11" / "8:30" / "9pm" /
   "11kor" sets the time, plus Now · 30 min · 1–3 h ago chips on the basket and Drink tab. Drinks are
   searchable (Drink tab and inside food search). "+ Make your own food": list roughly what's in it,
   saved as your food in portions. Supplements: Taking / Running low / Ran out / Stopped (+ Delete);
   Today asks to restock; engines keep stopped ones for history. Master graph: weight on, supps off
   (no separate supplement-effect graph — owner's call). Body tab weight chart with trend. Caffeine
   under 10 mg counts as none (1 Oct, owner: it should become zero), so the curve ends.
   ADHD-friendly nudges: Today's five chips (Food, Drinks, Stack, Weight, Rating — "N taps to
   complete today") and the next answer the engine is closest to, with a progress bar.
   AI half (chat that can write first, photo → saved food/drink, supplement research on add,
   recommendations): proposal + questions in Docs, to discuss.
13. [x] **The in-app AI** (1 Oct; owner's answers in the AI doc). Worker `POST /api/ai` (worker/ai.ts):
   signed-in session checked with Supabase, hard cap 50 calls/day, cost per call at list price
   written to the account's `ai_usage` doc, server-side fallbacks, answers checked before use
   (labels must add up, caffeine ≤ 600 mg, facts/studies need a real link). Contract:
   `lib/ai/tasks.ts`. Model per tier in Settings (everyday / research), default Opus 5.5, with a
   monthly estimate per choice; usage today/month shown. Food: sentence → built-in (now reads
   "small", "normal", "w butter", "200g" after the name, splits "bolognese spaghetti") → food
   database **median** of matching products + rough unit weight → AI, saved as your food with what
   you typed (free next time); 📷 photo. Drinks: Hell, long coffee, 3in1, fröccs… + "describe it /
   snap it" → saved, "Make it my usual". Stack: a new supplement is researched (web search; dose,
   timing, evidence, clashes with About me, sources). Morning read (written after 20:00 for the next
   day, or on first open): pattern + study/fact with source + a protocol → "Try it" starts an
   experiment judged before vs during (weekends accounted, 95% interval). Quick questions from
   10:00, daily ones repeat free. Chat tab that writes first (dot), friend tone, remembers lines
   (Settings → delete; "What the AI sees" shows the exact context). Push notifications to the
   iPhone: next (needs web push + a server-side schedule).
16. [x] **Drinks from the online database** (1 Oct). Owner: *"I NEED THE ONLINE SEARCHABLE DATABASE LIKE
   FOR FOODS… DO NOT FILL THE SCREEN W THE OPTIONS"*. Drink tab is search-first: empty shows only your
   last 4 drinks; typing shows a few matching built-ins, then Open Food Facts/USDA products
   (`lib/drinkdb.ts`): pick a size (label size first), logged with label kcal + macros, caffeine from
   the label or typical for its kind (marked), alcohol from % vol; saved to your drinks. Don't grow the
   built-in list for this.
17. [x] **Barcode scanner** (1 Oct). 📷 button at the end of the Food and Drink search boxes: back camera
   with an aiming frame (decoder: zbar WebAssembly, loaded on first scan from our own site, ~250 KB),
   or a photo of the barcode, or type the digits (check digit catches misreads). Looked up by code in
   Open Food Facts via `/api/food?barcode=` (cached; `lib/barcode.ts`). Food tab: a can lands in the
   meal as a drink at its label size (caffeine counts), anything else as a food; Drink tab: opens with
   its sizes. Unknown codes say so. **Owner to check on the iPhone:** camera permission from the
   Home Screen app, and how fast it reads a real can in normal light.
18. [x] **Reset all data** (1 Oct). Settings → Start over: Export first, then type RESET. Deletes every
   entry and doc on the server (keeps sign-in and the `ai_usage` cost record), writes a `reset` doc, and
   wipes this device (state, unsent queue, basket, dismissed card, Undo) — saved at once. Every other
   device checks the `reset` doc before it sends anything, so an offline phone's stale data and unsent
   edits can't come back (`Syncer.resetAll` / `checkReset`). Dev tools' wipe uses the same path.
19. [x] **Between check-ins** (2 Oct; `lib/detectors/between.ts`). Owner: *"look at what i was doing
   before that log… bad mood, then gym, and after that its high mood, 3x this week… make this smart"*.
   Each pair of check-ins on the same day (20 min–10 h): change = rebound (how far from your usual you
   started) + gap length + one term per activity in between (gym, 300+ kcal meal, 40+ mg caffeine,
   alcohol, each supplement); BH 10% across all activity × feeling; ≥ 1 point and 4+ gaps with it.
   Bench (`betweenWorld`): a +2 gym lift found 85% of fake months; "gym only after a low lunch, no
   real effect" — the owner's own example, which a plain average credits with ~+0.9 — flagged ≤ 10%;
   any false finding ~8–10% of months. Noticed cards (area "feel") + "still checking". Tried and
   dropped: carry-over and time-of-day terms (no measurable gain on the bench).
20. [x] **Body fat from the smart scale** (2 Oct; owner: "yes add that box"). Optional "Body fat %" next to
   both weigh-ins (`fatPct` on the weight entry). Shown only as a 2-week average (3+ readings, a 5-point
   one-off left out), with the change vs the 2 weeks before as fat kg / lean kg when it's bigger than
   the scale's own swing (`lib/bodyfat.ts`). The scale's other numbers: not tracked (mostly formulas).
21. [x] **How now? — the check-in** (2 Oct). Replaces the slider card, at the top of Today: one tap per
   feeling on a 1–10 row (slider detail, no dragging; owner kept 1–10), all optional, joins within 10 min.
   "What were you up to?" — ~5 tags in your most-used order + "more" + one word of your own; gym and a
   real meal pre-ticked from logs. Small reward ("Since 13:00: mood +4 · the gym in between") and
   progress to 8 check-in pairs. One calm line after Done; asks again after 2 h. Tags (`doing` on the
   feel entry) feed `detectors/between.ts` as activities; bench: a walk effect found, random ticks not.
   Next phase (with push): a nudge around 13:00 / 17:00 if not rated recently.
22. [x] **Push notifications** (2 Oct). One Durable Object per account (`worker/push.ts`; SQLite, alarms;
   makes its own VAPID keys — no secret) keeps devices + the next 48 h of reminders and fires each at
   its minute (checked in the real runtime: fired 92 ms after due); stale (20+ min late) dropped,
   several due merged, 404/410 devices forgotten. Encryption RFC 8291 (`worker/webpush.ts`, matches the
   RFC's example byte for byte). App plans (`lib/push/plan.ts`): How now? 13:00 / 17:30, "How was
   today?" 21:00 — each skipped if rated in the 2 h before; each supplement slot +30 min if unticked;
   weigh-in 09:30; quiet before 08:00 and from bedtime − 15; within 30 min merged; ≤ 6 a day; re-sent
   3 s after any change, on return to the app, and every 30 min. Settings → Notifications: turn on,
   kinds, send a test, each device's last delivery. `public/sw.js` shows it, tap opens Today.
   **Owner to check on the iPhone** (can't be automated): from the Home Screen app, Turn on → Send a
   test → arrives; tap opens Today.
23. [x] **Search pass** (2 Oct). Hungarian → English before USDA (`lib/hu.ts`, ~150 food words, whole
   words, longest first; OFF keeps your words) — server cache bumped to v3. Your taste (`lib/rank.ts`):
   products you logged (+6) and brands you buy rise in database results; yours first inside a group.
   Dry or cooked (`lib/cooked.ts`): pasta / rice / meat lines get "Weighed: dry · cooked" (raw for meat),
   converting by cooking factor (pasta ×2.25, rice ×2.7, meat ×0.75); sauces, soups, snacks excluded.
24. [x] **Your week** on Insights (2 Oct; `lib/weekly.ts`, `components/Weekly.tsx`). After 14 days of
   check-ins (before: "starts <day>"): last 7 days vs the 7 before per feeling (up/down only when Welch
   95% says so, else "about the same"; stress up = worse), best/worst time of day, best and lowest day
   with what happened (gym, alcohol, late caffeine, your tags), and the top connection from
   between.ts — a finding, or an early sign marked "could still be chance".
25. [x] **"How now?" on the Home Screen** (2 Oct). `/now` = just the check-in (`components/NowScreen.tsx`),
   served by the Worker with its own title/manifest/icon (`nowPage`, `public/now.webmanifest`), so Safari →
   Share → Add to Home Screen at /now makes a separate "How now?" icon; Android/Chrome: long-press
   shortcut in the main manifest. How now? notifications open /now. Also fixed: iPhone ignores SVG
   Home Screen icons — PNG icons (`icon-180/512.png`, `now-180/512.png`) added. iPhone may keep a
   Home Screen app's sign-in separate: sign in once in the new icon.
26. [x] **"1 cooked salmon" = cooked salmon** (2 Oct; owner: *"not 420 kcal full"*). Two bugs: the parser
   needed every word in a food's name, so "cooked salmon" split into "1 cooked" → Cod, cooked + raw
   salmon; and raw → cooked used the lean-meat factor (×1/0.75), making salmon 277 kcal/100 g. Now prep
   words (cooked, grilled, főtt, sült…) are how it was made, not part of the name (`quickadd.ts` PREP),
   and converting prefers the built-in list's measured twin (`cooked.ts`): "Salmon, cooked" = USDA
   206 kcal/100 g, fillet 105 g / large 170 g.
27. [x] **Log on an earlier day** (2 Oct; `Log.tsx` `useWhen`/`WhenChips`). Today stays the default; an
   "Earlier day…" link after the time chips opens Yesterday + a date (max yesterday) and meal-time chips;
   the Log button says "for yesterday" / "on Tue 29 Sep" and so does the toast; "Back to today" undoes it.
   Food and drinks (the stack is answered on Today). e2e `earlier.cjs`, run at 00:20 for the midnight edge.
28. [x] **A note on a check-in + your day, read back** (2 Oct; `HowNow.tsx` NoteField, `ai/context.ts`
   `dayTimeline`/`feelNotes`, `ai/tasks.ts` task `night`, `worker/ai.ts`, `Ai.tsx` NightRead). After rating,
   an optional "Why?" (saved on the check-in, shown in the log). Every AI call now sees notes under
   "Why I felt that way (… take these seriously)". From 21:00 (or next morning if the app wasn't opened)
   the AI reads the day back: summary, what happened, how your notes read, 1–2 small things for
   tomorrow — card on Today until noon + a 🌙 message in chat; "read it again" if you log more after.
   No web search; the research-tier model. Needs ANTHROPIC_API_KEY (not set yet): tested against a fake
   AI (unit + `e2e/night.cjs`), the real model's wording is unverified.
29. [x] **Caffeine & sleep, three separate questions** (2 Oct; `lib/caffeine-sleep.ts`, `today.ts`, Today's
   Caffeine card, Insights caffeine panel, How now?). Was: one hidden 50 mg "target" and a "!" card
   ("Coffee cut-off was 14:58") even on a normal two-coffee day. Now: (1) mg likely left at bed, with a
   range from the 3–7 h half-life spread; (2) general tier — under 30 low (Gardiner 2023 anchor), 30–100
   possible (heuristic), 100+ higher (Drake 2013 anchor), all in `CAF_SLEEP`; (3) your own nights — a
   morning "Last night's sleep" 1–10 + "took long to fall asleep" (own entry kind `sleep`, one per
   night), compared 30+ mg nights vs under (Welch t 95%, ≥6 nights each; "no real difference" needs
   10+ each and rules out a 1-point drop). Now shows an item only at 100+ (calm ☾) or when your nights
   agree ("!"); otherwise it's a line under the curve. `caffeineTargetMg` removed. Also fixed: a bedtime
   after midnight (00:30) was read as this morning's 00:30. Tests: planted effect found in ≥85% of fake
   people, no-effect people flagged ≤6%; e2e `cafsleep.cjs`.
30. [x] **Graph + feelings visual prototypes** (2 Oct): https://claude.ai/artifact/EAqvs4f5jYBZzxZp8JPTqq —
   A readings · B mind strips · C days by hour · D instrument panel · E day stack · F one feeling. My pick:
   D (with B as its feelings lanes) + C on Insights. Waiting for the owner's pick; nothing built yet.
31. [x] **Mobile pass 1** (2 Oct; owner's screenshot: text ghosting under the tab bar). Tab bar solid, per-screen
   colour (Workout/Insights), short fade above it; card headers wrap their hint under the title instead
   of squeezing it; a check-in's log line names what you were up to, your own word included.
32. [x] **Feelings slider** (2 Oct; `components/FeelSlider.tsx`). Owner: the 1–10 grid "looks pretty big and bad
   on phone… replace w a slider, make it nice and creative". One line per feeling (and last night's
   sleep): tap or drag, thumb carries the number, a bubble shows the word while dragging, one save per
   drag, a vertical swipe scrolls instead of rating, arrow keys work (ARIA slider), last value as a
   faint ring. Card 430 → 313 px on a phone. Found while testing: a desktop drag could be cancelled by
   the browser dragging selected text — the slider is unselectable now. e2e `slider.cjs` (+ `rate()`).
33. [x] **Workout, taken seriously — part 1** (2 Oct; `screens/Workout.tsx`, `lib/programs.ts`, `lib/training.ts`).
   Owner hit "workout done" meaning "set done": after the last set the big "Log set" spot turned into
   "Finish workout". Now that spot says "✓ All planned sets done"; finishing is "Finish workout…" at the
   bottom → a summary (minutes, sets, kg, % of last time, new bests, note) → Finish / Keep going. The
   big button also ignores a second tap within 0.9 s after a set. Rest ends at a saved time
   (`restUntil`), so it keeps counting with the app closed (it froze before); buzz at 0 on Android.
   Premade workouts: Full body A/B, 5×5, PPL, Upper/Lower, Dumbbells, Bodyweight, Glutes — start a day
   once or make a program your split (asks first). "New best" when a set beats every earlier e1RM.
   Next for the workout: rest-over notification with the app closed (push), plate maths, warm-up sets.
34. [x] **Supplement dose** (2 Oct; `lib/dose.ts`, Log → Stack `DoseField`, Insights "Higher vs lower dose").
   Changing a dose (Edit → Dose, saved when you leave the field or close the editor) keeps history
   (`doseLog`), so past days keep the dose they were on. Insights compares days at the two most-used
   doses (same unit): next day's energy/mood/focus/stress and that night's sleep rating, Welch 95%,
   5+ days each. Tests: a planted +1.5 sleep effect found in ≥27/30 fake people, no-effect mood
   flagged ≤10/100. Found while testing: a note appearing on blur moved "Done" under the finger.
35. [x] **Muscle map** (2 Oct; `components/MuscleMap.tsx`, `training.ts` muscleWeek/WEEKLY_SETS). On Workout, below
   your days: front + back figure, each muscle filled by hard sets in the last 7 days (or a 4-week weekly
   average), full colour at 12 sets/week (Schoenfeld 2017 dose–response: 10+ sets/week clearly better than
   <5). Tap a muscle: "Chest · 12 hard sets in the last 7 days · in the growth range". e2e `muscles.cjs`.
36. [x] **Romanian supermarket scans** (2 Oct; `barcode.ts` mineByBarcode, Log `CustomFood` + `useScan`). Research:
   Open Food Facts has only ~32k products tagged Romania; Lidl/Kaufland own brands are patchy (the app
   already asks OFF's whole world DB, so a Lidl code sold in DE/HU still matches). FatSecret covers
   Romania only on its paid Premier tier (barcode + localization); EU retail APIs are paid. So: "scan
   once, known forever" — a missed scan offers "Add it once from the label" (form with the barcode; or
   📷 Photo the label → the AI fills per-100 g values to check, once ANTHROPIC_API_KEY is set). Saved to
   your foods (synced), checked before any database on the next scan; barcode foods are kept past the
   500-food cap. Tests: unit + `scan.cjs` + `labelphoto.cjs` (fake AI). Owner's call later: also
   contribute added products back to Open Food Facts (needs an OFF account).
37. [x] **AI knows everything about mood** (2 Oct; `ai/context.ts` moodJournal/moodEngines/CONTEXT_MAX, `worker/ai.ts`,
   night `remember`). Every AI call now sees a mood journal — every check-in of the last 60 days, one line
   a day (sleep that morning, E/M/F/S, what you were up to, your notes) — plus the engines' numbers:
   this week vs last + top between-check-ins connection, caffeine-at-bed vs your sleep, dose
   comparisons. Budget 44k chars, oldest days trimmed first (a year of check-ins fits as the newest
   ~2 months); the Worker accepts 48k; chat caches the data block. The nightly read-back adds 0–2
   lasting patterns to the AI's memory (Settings → AI, deletable) when the journal shows them on
   several days. Cost estimate updated (≈4k tokens per everyday call). Real-model wording unverified
   until ANTHROPIC_API_KEY is set.
