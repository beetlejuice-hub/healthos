/**
 * Apple Health in (PLAN 184; owner, 29 Oct: "i use MovingLife", then the list of what his Health app has — "pls select
 * all that are interesting or important and can help the app make predictions"). A web app can't read Apple Health, so
 * a daily Apple Shortcut posts the newest weight, body fat and the day's walking speed to the Worker; the app turns
 * weight + body fat into weigh-ins, which the body-fat summary (lib/bodyfat) already reads as 2-week averages with lean
 * and fat kg. Pure: what a post says → samples (checked, in kg / % / km/h), samples kept → weigh-ins to add.
 *
 * The Shortcut sends what Shortcuts gives: numbers or text ("82,4"), the unit Health uses on that phone (kg or lb;
 * body fat as 18.2 or 0.182; walking speed in km/hr, mph or m/s), dates formatted ISO 8601.
 */

import type { Entry } from "./types";
import { FAT } from "./bodyfat";

export type HealthType = "weight" | "fat" | "walk";
export type HealthSample = { type: HealthType; at: number; value: number };

/** Kept per account; a weigh-in you typed within 30 min of the scale's isn't doubled; fat goes with the weight it was weighed with. */
export const HEALTH = { keepDays: 400, sameWeighInMin: 30, fatWithWeightMin: 10, aheadMin: 60 } as const;
const MIN = 60_000, DAY = 86_400_000;

const num = (v: unknown): number | null => {
  // text without a digit isn't 0 (stripped, "Body Fat Percentage" was "" — and Number("") is 0)
  const n = typeof v === "number" ? v : typeof v === "string" && /\d/.test(v) ? Number(v.replace(",", ".").replace(/[^\d.+-]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const when = (v: unknown): number | null => {
  if (typeof v === "number" && v > 1e11) return v;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) ? t : null;
};

/** One value in the app's unit, or null when it isn't a believable reading. */
export function toUnit(type: HealthType, value: number, unit = ""): number | null {
  const u = unit.toLowerCase().replace(/\s/g, "");
  if (type === "weight") {
    const kg = /lb|pound/.test(u) ? value * 0.45359237 : /^(st|stone)/.test(u) ? value * 6.35029318 : value;
    return kg >= 20 && kg <= 400 ? Math.round(kg * 100) / 100 : null;
  }
  if (type === "fat") {
    const pct = value > 0 && value < 1 ? value * 100 : value;
    return pct >= FAT.lo && pct <= FAT.hi ? Math.round(pct * 10) / 10 : null;
  }
  const kmh = /mph|mi/.test(u) ? value * 1.609344 : /m\/s|ms|meterspersecond/.test(u) ? value * 3.6 : value;
  return kmh >= 0.5 && kmh <= 12 ? Math.round(kmh * 100) / 100 : null;
}

/**
 * What one post says: { weight, weightUnit, weightAt, fat, fatAt, walk, walkUnit, walkAt } (any of them; the Shortcut
 * leaves out what Health hasn't got). A reading from the future (an hour's slack) or older than we keep is dropped.
 */
export const readPost = (body: unknown, now: number): HealthSample[] => readPostWhy(body, now).samples;

const RANGE: Record<HealthType, string> = { weight: "20–400 kg", fat: `${FAT.lo}–${FAT.hi} %`, walk: "0.5–12 km/h" };
const said = (v: unknown) => `“${String(v).slice(0, 40)}”`;

/**
 * …and why a field that came was left out (owner, 29 Oct, the first run: "now it says got weight walk ok true" — body
 * fat missing and nothing to say why): said back to the Shortcut and shown in Settings.
 */
export function readPostWhy(body: unknown, now: number): { samples: HealthSample[]; skipped: Partial<Record<HealthType, string>> } {
  const samples: HealthSample[] = [], skipped: Partial<Record<HealthType, string>> = {};
  if (!body || typeof body !== "object") return { samples, skipped };
  // keys as typed in Shortcuts: "Fat", "fat " and "fatat" are fatAt's and fat's too
  // …and a one-item list (Find Health Samples gives a list even with Limit 1) is its one item
  const b = Object.fromEntries(Object.entries(body as Record<string, unknown>).map(([k, v]) => [k.toLowerCase().replace(/\s/g, ""), Array.isArray(v) && v.length === 1 ? v[0] : v]));
  const came = Object.keys(body as object).join(", ") || "none";
  for (const type of ["weight", "fat", "walk"] as const) {
    const raw = b[type], rawAt = b[`${type}at`];
    const empty = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
    // owner, 29 Oct: "i ran the shortcut again, it doesnt mention fat" — a field that came empty, or not at all, says so too
    if (empty(raw)) {
      skipped[type] = !(type in b) && !(`${type}at` in b) ? `no “${type}” field came (fields: ${came})`
        : !empty(rawAt) ? `${type}At came but ${type} was empty`
          : type === "walk" ? "no walking speed from Health today yet"
            : `${type} came empty — the Shortcut got no ${type === "fat" ? "Body Fat Percentage" : "Weight"} from Health: iPhone Settings → Health → Data Access & Devices → Shortcuts → turn it on, and check Health has ${type === "fat" ? "body fat" : "weight"} readings`;
      continue;
    }
    const v = num(raw), at = when(rawAt);
    if (v == null) { skipped[type] = `${type} ${said(raw)} isn't a number — pick its Value`; continue; }
    if (at == null) { skipped[type] = rawAt == null || rawAt === "" ? `${type}At is missing` : `${type}At ${said(rawAt)} isn't a date — set its Date Format to ISO 8601 with the time on`; continue; }
    if (at > now + HEALTH.aheadMin * MIN || at < now - HEALTH.keepDays * DAY) { skipped[type] = `${type}At ${said(rawAt)} is ${at > now ? "in the future" : "over 400 days ago"}`; continue; }
    const value = toUnit(type, v, typeof b[`${type}unit`] === "string" ? (b[`${type}unit`] as string) : "");
    if (value == null) { skipped[type] = `${type} ${said(raw)} isn't believable (${RANGE[type]})`; continue; }
    samples.push({ type, at, value });
  }
  return { samples, skipped };
}

/** The samples kept: new ones in, one per type and time (the newest post wins), nothing older than we keep, by time. */
export function keepSamples(kept: HealthSample[], add: HealthSample[], now: number): HealthSample[] {
  const by = new Map<string, HealthSample>();
  for (const s of [...kept, ...add]) by.set(`${s.type}:${s.at}`, s);
  return [...by.values()].filter((s) => s.at >= now - HEALTH.keepDays * DAY).sort((a, b) => a.at - b.at);
}

/** The id a weigh-in from Health gets: the same on every phone, so two devices pulling it make one. */
export const healthId = (at: number) => `health-weight-${at}`;

/**
 * The weigh-ins to add: each weight newer than `until` (what was brought in before — so one you deleted doesn't come
 * back), with the body fat measured within 10 min of it; not when a weigh-in is already there within 30 min (you typed
 * it), or that one already came in.
 */
export function weighInsToAdd(samples: HealthSample[], entries: Entry[], until: number): { add: Extract<Entry, { kind: "weight" }>[]; fat: { id: string; fatPct: number }[]; until: number } {
  const weighed = entries.filter((e): e is Extract<Entry, { kind: "weight" }> => e.kind === "weight");
  const fats = samples.filter((s) => s.type === "fat");
  const fatNear = (at: number) => fats.filter((f) => Math.abs(f.at - at) <= HEALTH.fatWithWeightMin * MIN).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
  const add: Extract<Entry, { kind: "weight" }>[] = [];
  let top = until;
  for (const w of samples.filter((s) => s.type === "weight" && s.at > until)) {
    top = Math.max(top, w.at);
    if (weighed.some((e) => e.id === healthId(w.at) || Math.abs(e.at - w.at) <= HEALTH.sameWeighInMin * MIN)) continue;
    const fat = fatNear(w.at);
    add.push({ id: healthId(w.at), kind: "weight", at: w.at, kg: Math.round(w.value * 100) / 100, ...(fat ? { fatPct: Math.round(fat.value * 10) / 10 } : {}) });
  }
  // a body fat that came in a later post than its weight: onto the weigh-in Health already brought
  const fat = weighed.filter((e) => e.id.startsWith("health-weight-") && e.fatPct == null).flatMap((e) => { const f = fatNear(e.at); return f ? [{ id: e.id, fatPct: f.value }] : []; });
  return { add, fat, until: top };
}
