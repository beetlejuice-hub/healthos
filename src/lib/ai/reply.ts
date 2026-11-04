/**
 * A chat reply, whole (PLAN 196; owner, 4 Nov: "I asked about hrv, it just spit a chart on me"). The AI may write part of
 * its answer and then ask the app for data (a look-up, a chart); the app kept only the words after the last look-up, so
 * an answer written before it was lost and "The chart is attached under this message" was all that came. Now the words
 * of every round are kept: what it wrote on the way, then its last words — a "let me check" note on the way left out.
 * Pure.
 */

type Turn = { role: string; content: unknown };

/** The words in the AI's own turns of a tool round (its text blocks, in order). */
export function turnText(turn: Turn[] | undefined): string[] {
  return (turn ?? []).filter((t) => t.role === "assistant" && Array.isArray(t.content))
    .flatMap((t) => (t.content as { type?: string; text?: unknown }[]).filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => (c.text as string).trim()))
    .filter(Boolean);
}

/** A note on the way, not part of the answer: short, and saying it's about to look. */
const onTheWay = (t: string) => t.length < 90 && /^(let me|i'?ll|i will|one sec|checking|looking|pulling|give me|first,? (let me|i'?ll)|ok(ay)?,? (let me|i'?ll))/i.test(t);

/** The reply to show: the words written on the way that are answer, then the last words; nothing said twice. */
export function wholeReply(earlier: string[], last: string): string {
  const keep = earlier.filter((t) => !onTheWay(t)), end = last.trim();
  let out: string[] = [];
  for (const t of [...keep, end]) {
    if (!t || out.some((o) => o.includes(t))) continue;
    // a longer one that holds an earlier one takes its place
    out = [...out.filter((o) => !t.includes(o)), t];
  }
  return out.join("\n\n");
}
