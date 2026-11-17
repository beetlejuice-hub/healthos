/**
 * Pin the AI's numbers (PLAN 225; owner, 17 Nov: "4"). Every number in a read or a chat reply is looked for among the
 * numbers the AI was given — the context, the app's answers to its look-ups, your own messages — allowing for rounding
 * ("7.2" for 7.24, "2,400" for 2,447) and for a difference of two numbers on the same line ("8 above your usual" from 52
 * and 44). A number it wasn't given is "unpinned": the app marks it, dotted, so a misremembered one can't pass as yours.
 * Times, dates, years, small counts (0–10) and anything in a link are left alone — they aren't measurements. Pure.
 */

export const PIN = { smallInt: 10, perLine: 40 } as const;

type Num = { raw: string; v: number; tol: number };

// a number, its thousands commas and decimals; not part of a time (07:30), a date (2026-11-17) or a word (HRV2)
const NUM = /(?<![\w.:/-])[−-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\w:]|\.\d)|(?<![\w.:/-])[−-]?\d+(?:\.\d+)?(?![\w:]|\.\d)/g;
const MONTH = /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/** The numbers in a text that are measurements (see above). */
export function numbersOf(text: string, all = false): Num[] {
  const t = text.replace(/https?:\/\/\S+/g, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ");
  const out: Num[] = [];
  for (const m of t.matchAll(NUM)) {
    const raw = m[0], clean = raw.replace(/,/g, "").replace("−", "-"), v = Number(clean);
    if (!Number.isFinite(v)) continue;
    if (!all) {
      const after = t.slice((m.index ?? 0) + raw.length, (m.index ?? 0) + raw.length + 5);
      if (MONTH.test(after)) continue; // "14 Nov"
      if (!clean.includes(".") && Math.abs(v) <= PIN.smallInt) continue; // counts: "3 nights", "2 drinks"
      if (!clean.includes(".") && v >= 1900 && v <= 2100) continue; // a year
    }
    const dec = clean.includes(".") ? clean.split(".")[1].length : 0;
    // "2,400": rounded to the hundred — its trailing zeros say how far
    const zeros = dec ? 0 : (clean.replace("-", "").match(/0+$/)?.[0].length ?? 0);
    out.push({ raw, v: Math.abs(v), tol: 0.5 * 10 ** (dec ? -dec : Math.min(zeros, Math.max(0, String(Math.abs(Math.trunc(v))).length - 2))) + 1e-9 });
  }
  return out;
}

/** Every number the AI was given, and the differences of two on the same line, sorted for lookup. */
export function poolOf(sources: string[]): Float64Array {
  const vs: number[] = [];
  for (const s of sources) for (const line of s.split("\n")) {
    const ns = numbersOf(line, true).slice(0, PIN.perLine).map((n) => n.v);
    vs.push(...ns);
    // a value and its usual, this week and last: two of the same size (within 2×), not any two (52 − 4 isn't a thing)
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j];
      if (a > PIN.smallInt && b > PIN.smallInt && Math.max(a, b) <= 2 * Math.min(a, b)) vs.push(Math.abs(a - b));
    }
  }
  return Float64Array.from(vs).sort();
}

const near = (pool: Float64Array, v: number, tol: number) => {
  let lo = 0, hi = pool.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pool[m] < v - tol) lo = m + 1; else hi = m; }
  return lo < pool.length && pool[lo] <= v + tol;
};

/** The numbers in `texts` the AI wasn't given (each once, as written). */
export function unpinned(texts: string[], sources: string[]): string[] {
  const pool = poolOf(sources), out = new Set<string>();
  for (const t of texts) for (const n of numbersOf(t)) if (!near(pool, n.v, n.tol)) out.add(n.raw);
  return [...out];
}

/** A text split at its unpinned numbers, for drawing them marked. */
export function splitPinned(text: string, marks: string[] | undefined): { text: string; unpinned: boolean }[] {
  if (!marks?.length) return [{ text, unpinned: false }];
  const esc = marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\w.:/,-])(${esc.join("|")})(?![\\w:]|[.,]\\d)`, "g");
  const out: { text: string; unpinned: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if ((m.index ?? 0) > at) out.push({ text: text.slice(at, m.index), unpinned: false });
    out.push({ text: m[0], unpinned: true });
    at = (m.index ?? 0) + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), unpinned: false });
  return out;
}
