import { describe, expect, it } from "vitest";
import { pickCamera, type Cam } from "./camera";

const cams = (...labels: string[]): Cam[] => labels.map((label, i) => ({ deviceId: `id${i}`, label, kind: "videoinput" }));

describe("which camera reads barcodes (PLAN 72)", () => {
  it("iPhone Pro: the plain main lens, not the multi-lens one that jumps to macro", () => {
    expect(pickCamera(cams("Front Camera", "Back Triple Camera", "Back Dual Wide Camera", "Back Ultra Wide Camera", "Back Telephoto Camera", "Back Camera"))).toBe("id5");
  });
  it("Android: the first back camera, not the wide one", () => {
    expect(pickCamera(cams("camera2 1, facing front", "camera2 2, facing back", "camera2 0, facing back"))).toBe("id2");
  });
  it("other names: a back camera that isn't wide, tele or macro", () => {
    expect(pickCamera(cams("Ultra wide rear", "Rear camera"))).toBe("id1");
  });
  it("nothing to tell apart (no labels before permission, a laptop, a test camera): no pick — the browser's default stays", () => {
    expect(pickCamera(cams("", ""))).toBeNull();
    expect(pickCamera(cams("FaceTime HD Camera"))).toBeNull();
    expect(pickCamera(cams("fake_device_0"))).toBeNull();
    expect(pickCamera([{ deviceId: "m", label: "Back Camera", kind: "audioinput" }])).toBeNull();
  });
});
