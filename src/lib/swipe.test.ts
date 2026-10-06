import { describe, expect, it } from "vitest";
import { swipeTo } from "./swipe";

const T = ["week", "timeline", "mind", "data"];

describe("swipeTo", () => {
  it("left opens the next tab, right the one before", () => {
    expect(swipeTo(T, "timeline", -120, 10, 250)).toBe("mind");
    expect(swipeTo(T, "timeline", 120, -10, 250)).toBe("week");
  });
  it("stops at the ends instead of wrapping", () => {
    expect(swipeTo(T, "week", 120, 0, 200)).toBeNull();
    expect(swipeTo(T, "data", -120, 0, 200)).toBeNull();
  });
  it("a short drag, a mostly-vertical scroll or a slow drag is not a swipe", () => {
    expect(swipeTo(T, "mind", -40, 0, 200)).toBeNull();
    expect(swipeTo(T, "mind", -100, 80, 200)).toBeNull(); // scrolling down at an angle
    expect(swipeTo(T, "mind", -150, 10, 1500)).toBeNull(); // reading while dragging
  });
  it("a tab that isn't in the list goes nowhere", () => {
    expect(swipeTo(T, "sleep", -120, 0, 200)).toBeNull();
  });
});
