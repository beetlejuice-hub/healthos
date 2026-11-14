import { describe, expect, it } from "vitest";
import { widgetLines, widgetScript, widgetView, type WidgetSnap } from "./widget";

// Item 10 (owner, 14 Nov: "Can we do lock screen widget?").
const at = (d: string, hm: string) => new Date(`2026-11-${d}T${hm}:00`).getTime();
const snap: WidgetSnap = { at: at("14", "08:00"), day: "2026-11-14", readiness: { score: 86, word: "ready" }, sleep: 88, stack: { taken: 3, total: 5 },
  doses: [{ at: at("14", "07:40"), mg: 90 }, { at: at("14", "14:30"), mg: 90 }], halfLifeMin: 300, bed: at("14", "23:30"), next: "Push + Quads" };

describe("what the widget shows", () => {
  it("in the morning: readiness, sleep, the stack; the caffeine now and at bed, the next session", () => {
    const v = widgetView(snap, at("14", "09:00"));
    expect(v).toMatchObject({ ageMin: 60, readiness: 86, sleep: 88, stack: "3/5", bedClock: "23:30", next: "Push + Quads" });
    expect(widgetLines(v)[0]).toBe("Ready 86 · Sleep 88 · Stack 3/5");
    expect(widgetLines(v)[1]).toMatch(/^☕ \d+ mg · \d+ at 23:30$/);
    expect(widgetLines(v)[2]).toBe("Next: Push + Quads");
  });
  it("the caffeine keeps falling with the app closed, and a dose logged for later counts only once it's had", () => {
    const morning = widgetView(snap, at("14", "09:00")), afternoon = widgetView(snap, at("14", "13:00"));
    expect(afternoon.cafNow).toBeLessThan(morning.cafNow);
    expect(widgetView(snap, at("14", "16:00")).cafNow).toBeGreaterThan(afternoon.cafNow);
  });
  it("a snapshot from yesterday: only the caffeine, nothing that was yesterday's", () => {
    const v = widgetView(snap, at("15", "07:00"));
    expect(v).toMatchObject({ today: false, readiness: null, sleep: null, stack: null, next: null, cafBed: null });
    expect(widgetLines(v)[0]).toBe("HealthOS");
  });
  it("in the phone's time zone, the server being in UTC: Budapest (−60) at 23:30 UTC is already the next day", () => {
    const utc = (iso: string) => Date.parse(iso);
    const s: WidgetSnap = { ...snap, at: utc("2026-11-14T07:00:00Z"), day: "2026-11-14", tz: -60, bed: utc("2026-11-14T22:30:00Z") };
    expect(widgetView(s, utc("2026-11-14T20:00:00Z"))).toMatchObject({ today: true, bedClock: "23:30" });
    expect(widgetView(s, utc("2026-11-14T23:30:00Z")).today).toBe(false);
  });
  it("the script carries its URL and key and draws the lines", () => {
    const s = widgetScript("https://x/api/widget", "u1.abc");
    expect(s).toContain('const URL_ = "https://x/api/widget";');
    expect(s).toContain('const KEY = "u1.abc";');
    expect(s).toContain("Script.setWidget(w)");
  });
});
