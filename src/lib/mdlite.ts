/**
 * The little Markdown the AI writes in chat, read into pieces the chat draws itself (owner, 15 Oct: "pls make sure it can
 * make text bold, etc if it wants to" — the reply showed its **stars**). Paragraphs, bullet and numbered lists, **bold**,
 * *italic*; a "#" heading is drawn as a bold line. Pure, and never HTML: the text is only ever text, so nothing in a reply
 * can run or style the page.
 */

export type Span = { text: string; b?: boolean; i?: boolean };
export type Block = { kind: "p"; lines: Span[][] } | { kind: "ul" | "ol"; items: Span[][] };

/** **bold** and *italic* (or _italic_ standing alone — not the underscore inside snake_case) in one line. */
export function spans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    if (m[1] != null) out.push(...spans(m[1]).map((s) => ({ ...s, b: true })));
    else out.push({ text: m[2] ?? m[3], i: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out.filter((s) => s.text !== "");
}

const BULLET = /^\s*[-*•]\s+(.*)$/, NUMBER = /^\s*\d+[.)]\s+(.*)$/, HEAD = /^\s*#{1,6}\s+(.*)$/;

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: Span[][] = [];
  const flush = () => { if (para.length) out.push({ kind: "p", lines: para }); para = []; };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const b = BULLET.exec(raw), n = b ? null : NUMBER.exec(raw), h = HEAD.exec(raw);
    if (b || n) {
      flush();
      const kind = b ? "ul" : "ol", last = out[out.length - 1];
      const item = spans((b ?? n)![1]);
      if (last && last.kind === kind) last.items.push(item); else out.push({ kind, items: [item] });
    } else if (!raw.trim()) flush();
    else para.push(h ? [{ text: h[1].replace(/\*\*/g, ""), b: true }] : spans(raw));
  }
  flush();
  return out;
}
