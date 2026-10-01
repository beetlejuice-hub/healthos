/**
 * The barcode scanner: the back camera, a frame to aim at, and a read every ~150 ms until a valid
 * EAN/UPC is seen. The decoder (zbar, WebAssembly, ~300 KB) loads the first time you scan, so
 * opening the app stays fast. If the camera isn't allowed or there is none, a photo of the barcode
 * works the same way, and the digits under the bars can be typed.
 */

import { useEffect, useRef, useState } from "react";
import { normalizeGtin } from "../lib/barcode";

type ZBar = typeof import("@undecaf/zbar-wasm");
let zbarP: Promise<ZBar> | null = null;
/** Loaded once per session; the .wasm is served from our own origin, not a CDN. */
function zbar(): Promise<ZBar> {
  zbarP ??= (async () => {
    const [m, wasm] = await Promise.all([import("@undecaf/zbar-wasm"), import("@undecaf/zbar-wasm/dist/zbar.wasm?url")]);
    m.setModuleArgs({ locateFile: () => wasm.default });
    return m;
  })();
  return zbarP;
}

const KINDS = new Set(["ZBAR_EAN13", "ZBAR_EAN8", "ZBAR_UPCA", "ZBAR_UPCE"]);

/** The first valid product code in an image, or null. */
export async function readBarcode(img: ImageData): Promise<string | null> {
  const z = await zbar();
  const found = await z.scanImageData(img);
  for (const s of found) {
    if (!KINDS.has(s.typeName)) continue;
    const code = normalizeGtin(s.decode());
    if (code) return code;
  }
  return null;
}

/** A photo (any size) → ImageData small enough to scan quickly. */
async function imageOf(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}

type CamState = "starting" | "live" | "none";

export function Scanner({ onCode, onClose, busy, message }: { onCode: (code: string) => void; onClose: () => void; busy?: boolean; message?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState<CamState>("starting");
  const [note, setNote] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [digits, setDigits] = useState("");
  const done = useRef(false);
  const found = (code: string) => {
    if (done.current) return;
    done.current = true;
    try { navigator.vibrate?.(40); } catch { /* not on iPhone */ }
    onCode(code);
  };

  // Camera: start, read frames, stop everything on close.
  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, alive = true;
    void zbar(); // start loading the decoder while the camera warms up
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCam("none"); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch { if (alive) setCam("none"); return; }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setCam("live");
      const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true })!;
      const tick = async () => {
        if (!alive || done.current) return;
        if (v.videoWidth) {
          // Read the middle band, where the aiming frame is: fewer pixels, faster, fewer false reads.
          const w = v.videoWidth, h = Math.round(v.videoHeight * 0.5), y = Math.round(v.videoHeight * 0.25);
          c.width = w; c.height = h;
          g.drawImage(v, 0, y, w, h, 0, 0, w, h);
          const code = await readBarcode(g.getImageData(0, 0, w, h)).catch(() => null);
          if (code) { found(code); return; }
        }
        timer = window.setTimeout(tick, 150);
      };
      void tick();
    })();
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
    // found/onCode are stable for the life of the scanner
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromPhoto = async (file: File) => {
    setNote("Reading the photo…");
    try {
      const code = await readBarcode(await imageOf(file));
      if (code) { setNote(null); found(code); } else setNote("No barcode in that photo. Get closer so the bars fill the middle, and keep it sharp.");
    } catch { setNote("Couldn't open that photo. Try another one."); }
  };
  const typed = normalizeGtin(digits);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <video ref={video} playsInline muted aria-hidden="true" className={cam === "live" ? "on" : ""} />
      <div className="aim" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="scan-top">
        <button type="button" className="pill-btn" onClick={onClose}>Cancel</button>
      </div>
      <div className="scan-bottom">
        <p className="scan-msg" role="status">
          {busy ? "Looking it up…"
            : message ?? note ?? (cam === "starting" ? "Starting the camera…" : cam === "live" ? "Point at the barcode" : "No camera here. Take a photo of the barcode, or type its number.")}
        </p>
        {typing ? (
          <form className="scan-type" onSubmit={(e) => { e.preventDefault(); if (typed) found(typed); }}>
            <input inputMode="numeric" autoFocus placeholder="5449000014535" value={digits} onChange={(e) => setDigits(e.target.value)} aria-label="Barcode number" />
            <button type="submit" className="pill-btn pri" disabled={!typed}>Find</button>
          </form>
        ) : (
          <div className="row2">
            <button type="button" className="pill-btn" onClick={() => photo.current?.click()}>Take a photo</button>
            <button type="button" className="pill-btn" onClick={() => setTyping(true)}>Type the number</button>
          </div>
        )}
        {typing && digits.replace(/\D/g, "").length >= 8 && !typed && <p className="scan-msg err">That number doesn't check out. One digit is probably off.</p>}
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Photo of a barcode" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

/** The small button that opens it, sized to sit at the end of a search box. */
export function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="scan-btn" onClick={onClick} aria-label="Scan a barcode">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    </button>
  );
}
