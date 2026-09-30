/**
 * The stack check: everything you take (stack, medications, what you drink) against your
 * conditions, your medications and each other, using the curated rules in `kb.ts`.
 */

import { ASK_ABOUT, ITEMS, RULES, type AskAbout, type Grade, type Item, type Rule, type Verdict } from "./kb";

const fold = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const ALIASES = ITEMS.flatMap((it) => it.aka.map((a) => ({ it, a: fold(a) }))).sort((x, y) => y.a.length - x.a.length);

/**
 * What you typed ("Vitamin D3 2000 IU", "Omega-3 + D3", "Daivobet gél") → every catalog item in it.
 * Longest names first, and a matched name is consumed, so "black seed oil" isn't also "oil".
 */
export function resolveAll(typed: string): Item[] {
  let t = fold(typed);
  const out: Item[] = [];
  for (const { it, a } of ALIASES) {
    if (!t.includes(a)) continue;
    t = t.replace(a, " | ");
    if (!out.includes(it)) out.push(it);
  }
  return out;
}
export const resolve = (typed: string): Item | null => resolveAll(typed)[0] ?? null;

export const SEVERITY: Record<Verdict, number> = { avoid: 5, caution: 4, timing: 3, mixed: 2, "may-help": 1, none: 0 };

/** One thing you have, by what you called it and what it is. */
export type Thing = { label: string; items: Item[]; from: "stack" | "medication" | "condition" | "drink" };
export type Flag = { rule: Rule; a: Thing; b: Thing };
export type Report = {
  flags: Flag[];
  /** Things the app couldn't identify: "not checked yet", never a silent pass. */
  unknown: Thing[];
  ask: AskAbout[];
};

export type CheckInput = {
  stack: string[]; meds: string[]; conditions: string[];
  /** Drink kinds you've actually logged lately ("alcohol", "caffeine"). */
  drinks: ("alcohol" | "caffeine")[];
};

export function things(i: CheckInput): Thing[] {
  const byKey = new Map(ITEMS.map((x) => [x.key, x]));
  return [
    ...i.stack.map((label): Thing => ({ label, items: resolveAll(label), from: "stack" })),
    ...i.meds.map((label): Thing => ({ label, items: resolveAll(label), from: "medication" })),
    ...i.conditions.map((label): Thing => ({ label, items: resolveAll(label), from: "condition" })),
    ...i.drinks.map((k): Thing => ({ label: byKey.get(k)!.name, items: [byKey.get(k)!], from: "drink" })),
  ];
}

export function check(i: CheckInput): Report {
  const all = things(i);
  const flags: Flag[] = [];
  for (const rule of RULES) {
    const is = (key: string) => (t: Thing) => t.items.some((x) => x.key === key);
    const as = all.filter(is(rule.a)), bs = all.filter(is(rule.b));
    if (as.length && bs.length) flags.push({ rule, a: as[0], b: bs[0] });
  }
  flags.sort((x, y) => SEVERITY[y.rule.verdict] - SEVERITY[x.rule.verdict]);
  const has = (key: string) => all.some((t) => t.items.some((x) => x.key === key));
  return {
    flags,
    unknown: all.filter((t) => !t.items.length),
    ask: ASK_ABOUT.filter((q) => has(q.condition) && (q.always || !has(q.item))),
  };
}

export type Badge = { verdict: Verdict | "unknown"; grade?: Grade; flags: Flag[] };

/** The worst flag involving one thing you take — the badge next to it in the stack. */
export function badgeFor(label: string, report: Report): Badge {
  const mine = report.flags.filter((f) => f.a.label === label || f.b.label === label);
  if (mine.length) return { verdict: mine[0].rule.verdict, grade: mine[0].rule.grade, flags: mine };
  return { verdict: resolveAll(label).length ? "none" : "unknown", flags: [] };
}
