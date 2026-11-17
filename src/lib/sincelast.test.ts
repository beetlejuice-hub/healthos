// PLAN 225 — since you last looked. Known answers: the first visit only takes note; a visit 6+ hours later compares
// against the one before, and the same visit keeps that line; a trend that turned, a new link, a finding firmer or
// fainter, and one gone are each said once, the slipping trend first.
import { describe, expect, it } from "vitest";
import { changesSince, rollSeen, SINCE, type Mark } from "./sincelast";

const H = 3_600_000, T0 = Date.UTC(2026, 10, 10, 8);
const trend = (k: string, state: string): Mark => ({ key: `t:${k}`, kind: "trend", name: k, state, href: "#insights" });
const link = (k: string): Mark => ({ key: `l:${k}`, kind: "link", name: `Drinks go with lower ${k}`, state: "−", href: "#insights/connections" });
const finding = (k: string, state: string): Mark => ({ key: `e:${k}`, kind: "finding", name: k, state, href: "#insights/connections" });

describe("since you last looked", () => {
  it("first visit: nothing to compare; 6 hours on, the visit before is the line; the same visit keeps it", () => {
    const a = rollSeen({ base: null, last: null }, [trend("HRV", "steady")], T0);
    expect(a.base).toBeNull();
    const b = rollSeen(a, [trend("HRV", "worse")], T0 + SINCE.visitGapH * H);
    expect(b.base!.at).toBe(T0);
    const c = rollSeen(b, [trend("HRV", "worse")], T0 + SINCE.visitGapH * H + 10 * 60_000);
    expect(c.base!.at).toBe(T0);
    expect(changesSince(c.base, [trend("HRV", "worse")]).map((x) => x.text)).toEqual(["HRV: steady → slipping"]);
  });
  it("each kind of change, the slipping trend first; what didn't move isn't said", () => {
    const base = rollSeen({ base: null, last: null }, [trend("HRV", "steady"), trend("Steps", "steady"), trend("Mood", "better"), link("HRV"), finding("Saffron and mood", "likely"), finding("Gym and energy", "clear"), finding("Late caffeine and sleep", "likely")], T0).last!;
    const now = [trend("HRV", "worse"), trend("Steps", "better"), trend("Mood", "better"), link("sleep"), finding("Saffron and mood", "clear"), finding("Gym and energy", "likely")];
    const cs = changesSince(base, now);
    expect(cs.map((c) => [c.tag, c.text])).toEqual([
      ["turned", "HRV: steady → slipping"],
      ["new", "Drinks go with lower sleep"],
      ["firmer", "Saffron and mood: likely → clear"],
      ["turned", "Steps: steady → getting better"],
      ["fainter", "Gym and energy: clear → likely"],
      ["gone", "No longer holds: drinks go with lower HRV"],
    ]);
    expect(cs[0].tone).toBe("bad"); expect(cs[3].tone).toBe("good");
    // at most six: the late-caffeine finding that went is the seventh
    expect(cs).toHaveLength(SINCE.show);
  });
  it("nothing moved: an empty list (the card says so)", () => {
    const ms = [trend("HRV", "steady"), link("HRV")];
    expect(changesSince(rollSeen({ base: null, last: null }, ms, T0).last, ms)).toEqual([]);
  });
});
