/**
 * Which camera reads barcodes (PLAN 72; owner, 13 Oct: "it asks me if i give permission every single time, and it opens idk
 * the wrong camera, its always a bit blurry, like its using the macro camera automatically"). On an iPhone Pro the default
 * back camera is the multi-lens one ("Back Triple Camera", "Back Dual Wide Camera"), which jumps to the ultra-wide (macro)
 * lens up close — the blur. The plain main lens holds focus: "Back Camera" on iPhone, and on Android the first
 * "camera2 N, facing back". Labels only exist once the camera is allowed. Pure.
 */

export type Cam = { deviceId: string; label: string; kind: string };
const NOT_MAIN = /ultra|wide|tele|triple|dual|macro|depth|tof|infrared|front|user|selfie/i;

export function pickCamera(devs: Cam[]): string | null {
  const vids = devs.filter((d) => d.kind === "videoinput" && d.label.trim());
  const iphone = vids.find((d) => /^back camera$/i.test(d.label.trim()));
  if (iphone) return iphone.deviceId;
  const android = vids.map((d) => ({ d, m: /camera2? (\d+), facing back/i.exec(d.label) })).filter((x) => x.m).sort((a, b) => +a.m![1] - +b.m![1])[0];
  if (android) return android.d.deviceId;
  return vids.find((d) => /back|rear|environment/i.test(d.label) && !NOT_MAIN.test(d.label))?.deviceId ?? null;
}
