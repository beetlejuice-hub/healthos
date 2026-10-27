import { describe, expect, it } from "vitest";
import { blocks, spans } from "./mdlite";

describe("the AI's bits of Markdown in chat (owner, 15 Oct: \"make sure it can make text bold\")", () => {
  it("bold and italic, the rest as said", () => {
    expect(spans("Yo! If I had to pick one: **a consistent, earlier bedtime.** Your bedtimes swing")).toEqual([
      { text: "Yo! If I had to pick one: " }, { text: "a consistent, earlier bedtime.", b: true }, { text: " Your bedtimes swing" }]);
    expect(spans("this is *really* it, and _this_ too")).toEqual([{ text: "this is " }, { text: "really", i: true }, { text: " it, and " }, { text: "this", i: true }, { text: " too" }]);
  });
  it("not italics: a lone star, stars with spaces, snake_case, 2 * 3", () => {
    expect(spans("5 * 3 = 15 and 2 * 4")).toEqual([{ text: "5 * 3 = 15 and 2 * 4" }]);
    expect(spans("key sleep_score_mid stays")).toEqual([{ text: "key sleep_score_mid stays" }]);
    expect(spans("an unclosed **bold")).toEqual([{ text: "an unclosed **bold" }]);
  });
  it("paragraphs by blank lines, lines kept, bullets and numbers as lists, a heading as a bold line", () => {
    const b = blocks("Yo!\nSecond line.\n\n## What I'd do\n- **lights out** by midnight\n- no phone in bed\n\n1. tonight\n2. tomorrow\nDone.");
    expect(b.map((x) => x.kind)).toEqual(["p", "p", "ul", "ol", "p"]);
    expect(b[0]).toEqual({ kind: "p", lines: [[{ text: "Yo!" }], [{ text: "Second line." }]] });
    expect(b[1]).toEqual({ kind: "p", lines: [[{ text: "What I'd do", b: true }]] });
    expect(b[2]).toEqual({ kind: "ul", items: [[{ text: "lights out", b: true }, { text: " by midnight" }], [{ text: "no phone in bed" }]] });
    expect(b[3]).toEqual({ kind: "ol", items: [[{ text: "tonight" }], [{ text: "tomorrow" }]] });
  });
  it("the morning read's • bullets are a list too; markup in a reply stays text", () => {
    expect(blocks("☀️ Morning\n• one\n• two")[1]).toEqual({ kind: "ul", items: [[{ text: "one" }], [{ text: "two" }]] });
    expect(blocks("<b>hi</b> <script>x</script>")).toEqual([{ kind: "p", lines: [[{ text: "<b>hi</b> <script>x</script>" }]] }]);
  });
  // 27 Oct: the chat cites studies with their links now — "[Study](https://…)" showed as typed
  it("links: [text](https://…) and bare https://…; http(s) only — a javascript: one stays text", () => {
    expect(spans("See [Alcohol and REM](https://pubmed.ncbi.nlm.nih.gov/123/), strong.")).toEqual([{ text: "See " }, { text: "Alcohol and REM", href: "https://pubmed.ncbi.nlm.nih.gov/123/" }, { text: ", strong." }]);
    expect(spans("Source: https://www.example.org/study.")).toEqual([{ text: "Source: " }, { text: "example.org/study", href: "https://www.example.org/study" }, { text: "." }]);
    expect(spans("[x](javascript:alert(1))").some((s) => s.href)).toBe(false);
    expect(spans("**bold** and [a](http://a.org)")).toEqual([{ text: "bold", b: true }, { text: " and " }, { text: "a", href: "http://a.org" }]);
  });
});
