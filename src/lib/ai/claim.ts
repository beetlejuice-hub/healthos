/**
 * One read a day, whichever device gets there first (PLAN 215; owner, 12 Nov: "I got like 3 morning reads today its weird
 * idk if it works pls fix"). Each device wrote its own read when it found none for today — and the `ai` doc is synced
 * as one, so a device still holding yesterday's read could put it back over today's and the next device wrote another.
 * Now a device claims the day's read on the server before writing it (lib/ai/claimStore); another device's claim holds
 * for half an hour, enough for its read to sync over. And of two reads for a day, the newer always wins the merge. Pure.
 */

export const CLAIM = { holdMin: 30 } as const;
export type Claim = { device: string; at: number; name?: string };

/** Whether this device may write the read: nobody claimed it, it's ours, or the other's claim is old (its writing failed). */
export const mayWrite = (c: Claim | null | undefined, me: string, now: number): boolean =>
  !c || c.device === me || now - c.at > CLAIM.holdMin * 60_000;

type Read = { day: string; at?: number } | null | undefined;
/** Of two copies of a read, the one for the later day, then the one written later. */
export function newerRead<T extends Read>(a: T, b: T): T {
  if (!a) return b;
  if (!b) return a;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  return (b.at ?? 0) >= (a.at ?? 0) ? b : a;
}

/** "iPhone", "Mac"… — which device wrote a read, for Settings → AI. */
export function deviceName(ua: string): string {
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "a browser";
}
