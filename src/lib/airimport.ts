/**
 * Bedroom air in (PLAN 210; owner, 11 Nov: "1 love (all) - i have ios" — the CO₂ sensor, board R). An iPhone can't talk to
 * an Aranet4 from a web page, but Aranet Home exports its history as a CSV (the graph → export): picked here, read on the
 * phone, and each night (22:00–07:00) kept as a few numbers — the raw file isn't kept. Why: the evidence on CO₂ and sleep
 * or thinking conflicts (Harvard 2025: lower CO₂, better test scores; UCL 2025: pure CO₂ under 2,100 ppm, none), which makes
 * it a thing to settle on yourself. Keyed by the morning the night ended, like the band's nights. Pure.
 *
 * The CSV: a header naming the columns ("Time(dd/mm/yyyy)", "Carbon dioxide(ppm)", "Temperature(°C)", "Relative
 * humidity(%)", …), comma or semicolon separated; the date order read from the header, else from the dates themselves.
 */

import { addDays, localDay } from "./time";

export type AirRow = { t: number; co2: number; temp: number | null; rh: number | null };
export type AirNight = { co2: number; co2Max: number; temp: number | null; rh: number | null; n: number };
export const AIR = { from: 22, to: 7, minReadings: 6 } as const;

const num = (s: string | undefined) => { if (s == null) return null; const v = Number(s.replace(",", ".").replace(/[^\d.-]/g, "")); return s.trim() && Number.isFinite(v) ? v : null; };

/** The rows of an Aranet CSV, or why it couldn't be read. */
export function parseAranet(csv: string): { rows: AirRow[]; error?: string } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "The file is empty." };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cells = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = cells(lines[0]);
  const iT = head.findIndex((h) => /time|date/i.test(h)), iC = head.findIndex((h) => /carbon|co2|co₂/i.test(h));
  const iTemp = head.findIndex((h) => /temp/i.test(h)), iRh = head.findIndex((h) => /humid/i.test(h));
  if (iT < 0 || iC < 0) return { rows: [], error: "No time or CO₂ column — is this an Aranet export?" };
  const body = lines.slice(1).map(cells);
  // day/month order: the header says ("dd/mm/yyyy"), else a first number over 12 means day first
  const h = head[iT].toLowerCase(), dmyHead = /dd[./-]mm/.test(h), mdyHead = /mm[./-]dd/.test(h);
  const firsts = body.map((r) => Number((r[iT] ?? "").match(/^(\d{1,2})[./-]/)?.[1])).filter((v) => v > 0);
  const dayFirst = dmyHead || (!mdyHead && (firsts.some((v) => v > 12) || !body.some((r) => Number((r[iT] ?? "").match(/^\d{1,2}[./-](\d{1,2})/)?.[1]) > 12)));
  const when = (s: string): number | null => {
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0)).getTime();
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
    if (!m) return null;
    let H = +m[4]; const pm = m[7]?.toLowerCase().startsWith("p"), am = m[7]?.toLowerCase().startsWith("a");
    if (pm && H < 12) H += 12; if (am && H === 12) H = 0;
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], [d, mo] = dayFirst ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? new Date(y, mo - 1, d, H, +m[5], +(m[6] ?? 0)).getTime() : null;
  };
  const rows: AirRow[] = [];
  for (const r of body) {
    const t = when(r[iT] ?? ""), co2 = num(r[iC]);
    if (t == null || co2 == null || co2 < 250 || co2 > 10000) continue;
    rows.push({ t, co2, temp: iTemp >= 0 ? num(r[iTemp]) : null, rh: iRh >= 0 ? num(r[iRh]) : null });
  }
  if (!rows.length) return { rows, error: "No readings could be read from it." };
  return { rows: rows.sort((a, b) => a.t - b.t) };
}

/** Each night 22:00–07:00: the average and peak CO₂, average temperature and humidity, by the morning it ended. */
export function airNights(rows: AirRow[]): Record<string, AirNight> {
  const by = new Map<string, AirRow[]>();
  for (const r of rows) {
    const h = new Date(r.t).getHours();
    if (h >= AIR.to && h < AIR.from) continue;
    const morning = h >= AIR.from ? addDays(localDay(r.t), 1) : localDay(r.t);
    (by.get(morning) ?? by.set(morning, []).get(morning)!).push(r);
  }
  const out: Record<string, AirNight> = {}, avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
  for (const [d, rs] of by) {
    if (rs.length < AIR.minReadings) continue;
    const co2 = rs.map((r) => r.co2);
    out[d] = { co2: Math.round(avg(co2)!), co2Max: Math.max(...co2), temp: avg(rs.flatMap((r) => (r.temp == null ? [] : [r.temp]))), rh: avg(rs.flatMap((r) => (r.rh == null ? [] : [r.rh]))), n: rs.length };
  }
  return out;
}
