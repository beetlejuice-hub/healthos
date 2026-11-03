// The record's audit (PLAN 188 phase 3; owner, 3 Nov: "see if it was right or no"). Worlds of 120 days from lib/sample:
// the app finds its leads and Noticed findings on the first 60, says them on day 61, then re-checks them on the days after
// — the old way (Leads' "held 5 of 6 days since": confirmed at 4 of 5 new days or more) and the record's (the same adjusted
// test on the new days alone). A real claim is one the sample planted (late caffeine or alcohol → that night's rating or
// next-day energy, protein → next-day energy); with nothing planted every claim is chance. AUDIT=1 prints the table.
import { describe, expect, it } from "vitest";
import { makeSample } from "./sample";
import { dailyFacts } from "./insights";
import { DEFAULT_SETTINGS } from "./store";
import { scout, since, signals, verdict } from "./scout";
import { effectFindings } from "./detectors/effects";
import { leadClaim, noticedClaim, recheck, type Claim, type ClaimState } from "./record";
import { addDays, localDay } from "./time";
import type { Supplement } from "./types";

const NOW = new Date("2026-10-31T21:00:00").getTime();
const SUPPS = [["creatine", "Creatine"], ["vitd", "Vitamin D3"], ["cumin", "Black cumin oil"], ["mag", "Magnesium"], ["saffron", "Saffron"]].map(([id, name]) => ({ id, name, dose: "1", slot: "morning", at: 480, active: true }) as unknown as Supplement);
const CAUSE = new Set(["caffeine", "lateCaf", "alcohol", "protein", "late-caf", "late-caf-mg", "caf-bed", "caf-total", "alc-2", "alc-drink"]);
const planted = (c: Claim) => (CAUSE.has(c.x) && ["sleepRating", "energy"].includes(c.y)) || (CAUSE.has(c.y) && ["sleepRating", "energy"].includes(c.x));

type Row = { real: boolean; from: Claim["from"]; old: string | null; at30: ClaimState | null; at60: ClaimState | null };
function world(seed: number, effects: boolean): Row[] {
  const { entries, workouts } = makeSample(NOW, 120, { effects, seed });
  const to = addDays(localDay(NOW), -1), from = addDays(to, -119), facts = dailyFacts(entries, workouts, DEFAULT_SETTINGS, from, to);
  const first = facts.slice(0, 60), said = facts[60].day, sigs = signals(SUPPS, facts);
  const leads = scout(first, SUPPS), claims = [...leads.map((p) => leadClaim(p, said)), ...effectFindings(first, SUPPS).found.flatMap((f) => noticedClaim(f, said) ?? [])];
  return claims.map((c) => {
    const p = leads.find((x) => `lead:${x.id}` === c.id);
    return {
      real: effects && planted(c), from: c.from,
      old: p ? verdict(since(p, { first: facts[59].day, sign: p.sign }, facts)) : null,
      at30: recheck(c, facts.slice(0, 90), SUPPS, sigs)?.state ?? null, at60: recheck(c, facts, SUPPS, sigs)?.state ?? null,
    };
  }).filter((r) => r.real || !effects); // in planted worlds, only the planted ones (the rest aren't known either way)
}

const N = 16;
const rows = { real: [] as Row[], chance: [] as Row[] };
for (let s = 0; s < N; s++) { rows.real.push(...world(3000 + s, true)); rows.chance.push(...world(3000 + s, false)); }
const share = (rs: Row[], f: (r: Row) => boolean) => (rs.length ? rs.filter(f).length / rs.length : NaN);

describe("the record: right or not, checked on days it never saw (PLAN 188 phase 3)", () => {
  it("there are both kinds to judge", () => {
    expect(rows.real.length).toBeGreaterThanOrEqual(10);
    expect(rows.chance.length).toBeGreaterThanOrEqual(5);
  });
  it("60 days on: a real claim held in most worlds; a chance one almost never", () => {
    expect(share(rows.real, (r) => r.at60 === "held")).toBeGreaterThanOrEqual(0.6);
    expect(share(rows.chance, (r) => r.at60 === "held")).toBeLessThanOrEqual(0.1);
  });
  it("…and a chance one is called 'didn't hold' far more often than a real one", () => {
    expect(share(rows.chance, (r) => r.at60 === "didn't hold")).toBeGreaterThanOrEqual(0.4);
    expect(share(rows.real, (r) => r.at60 === "didn't hold")).toBeLessThanOrEqual(0.1);
  });
});

describe.skipIf(!process.env.AUDIT)("the record audit, printed", () => {
  it("old forward check vs the record", () => {
    const leads = (rs: Row[]) => rs.filter((r) => r.from === "lead");
    const t = (label: string, rs: Row[]) => ({
      claims: `${label} (${rs.length}; ${leads(rs).length} leads)`,
      "old: confirmed": share(leads(rs), (r) => r.old === "confirmed").toFixed(2), "old: faded": share(leads(rs), (r) => r.old === "faded").toFixed(2),
      "30 d: held": share(rs, (r) => r.at30 === "held").toFixed(2), "30 d: didn't": share(rs, (r) => r.at30 === "didn't hold").toFixed(2),
      "60 d: held": share(rs, (r) => r.at60 === "held").toFixed(2), "60 d: didn't": share(rs, (r) => r.at60 === "didn't hold").toFixed(2),
    });
    console.table([t("real", rows.real), t("chance", rows.chance)]);
    expect(true).toBe(true);
  });
});
