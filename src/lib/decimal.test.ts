import { describe, expect, it } from "vitest";
import { parseDecimal } from "./decimal";

// Owner, 20 Oct: "Cant put things like 40,5 kg duh…pls fix"
describe("a typed weight", () => {
  it("a comma or a dot, as typed on the way there", () => {
    expect(["40,5", "40.5", "40,", "40.", ",5", "0", "102,5", " 32,5 "].map(parseDecimal)).toEqual([40.5, 40.5, 40, 40, 0.5, 0, 102.5, 32.5]);
  });
  it("empty is 0; not a number is refused", () => {
    expect(parseDecimal("")).toBe(0);
    expect(parseDecimal(",")).toBe(0); // on the way to ",5"
    expect(["4o", "40,5,5", "-3", "1e3"].map(parseDecimal)).toEqual([null, null, null, null]);
  });
});
