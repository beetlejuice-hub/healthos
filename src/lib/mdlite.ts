/**
 * The little Markdown the AI writes in chat, read into pieces the chat draws itself (owner, 15 Oct: "pls make sure it can
 * make text bold, etc if it wants to" — the reply showed its **stars**). Paragraphs, bullet and numbered lists, **bold**,
 * *italic*; a "#" heading is drawn as a bold line. Pure, and never HTML: the text is only ever text, so nothing in a reply
 * can run or style the page.
 */

export type Span = { text: string; b?: boolean; i?: boolean; /** A link (http/https only): [text](url), or a bare https URL. */ href?: string };
export type Block = { kind: "p"; lines: Span[][] } | { kind: "ul" | "ol"; items: Span[][] };

/**
 * **bold**, *italic* (or _italic_ standing alone — not the underscore inside snake_case) and links in one line. Links (27 Oct:
 * the chat now cites studies with their links, and "[Study](https://…)" showed as typed): [text](https://…) and bare
 * https://… — http(s) only, so a "javascript:" one stays text.
 */
export function spans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https:\/\/[^\s)\]]+[^\s)\].,;:!?])|\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    if (m[2] != null) out.push({ text: m[1], href: m[2] });
    else if (m[3] != null) out.push({ text: m[3].replace(/^https:\/\/(www\.)?/, "").slice(0, 40), href: m[3] });
    else if (m[4] != null) out.push(...spans(m[4]).map((s) => ({ ...s, b: true })));
    else out.push({ text: m[5] ?? m[6], i: true });
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
