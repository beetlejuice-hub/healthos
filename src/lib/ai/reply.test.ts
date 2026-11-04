// A chat reply, whole (PLAN 196; owner, 4 Nov: "I asked about hrv, it just spit a chart on me"). Planted: the answer
// written before a chart was drawn, and "The chart is attached under this message…" after it — the answer stays.
import { describe, expect, it } from "vitest";
import { turnText, wholeReply } from "./reply";

const ANSWER = "Not low for you: 55 ms is about average for a man in his late 20s on a wrist band. What drags yours down are the drinking nights (−14 ms the morning after) and short sleep; zone 2 cardio and a steady bedtime lift it over a few weeks.";

describe("a chat reply, whole", () => {
  it("the answer written before the chart is kept; the line after it follows", () => {
    const turn = [{ role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: ANSWER }, { type: "tool_use", id: "t1", name: "show_chart", input: {} }] }];
    const r = wholeReply(turnText(turn), "The chart is attached under this message. You can see the baseline sitting high with a few sharp drops.");
    expect(r.startsWith(ANSWER)).toBe(true);
    expect(r).toMatch(/\n\nThe chart is attached under this message/);
  });
  it("a note on the way (\"Let me look.\") isn't part of the answer; control: no rounds, the last words as they were", () => {
    const turn = [{ role: "assistant", content: [{ type: "text", text: "Let me look." }, { type: "tool_use", id: "t1", name: "day", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }] }];
    expect(turnText(turn)).toEqual(["Let me look."]);
    expect(wholeReply(turnText(turn), "You slept **7 h** that night.")).toBe("You slept **7 h** that night.");
    expect(wholeReply([], "Got it.")).toBe("Got it.");
  });
  it("nothing said twice: the same words again, or the last one holding the earlier", () => {
    expect(wholeReply([ANSWER], ANSWER)).toBe(ANSWER);
    expect(wholeReply(["Your HRV is fine."], "Your HRV is fine. Here's why: …")).toBe("Your HRV is fine. Here's why: …");
  });
});

import { SYSTEM } from "./tasks";
describe("the chat is told", () => {
  it("a chart goes with an answer, never instead; a question about one of their numbers gets a real answer", () => {
    expect(SYSTEM.chat).toMatch(/goes WITH an answer in words, never instead of one/);
    expect(SYSTEM.chat).toMatch(/Write the whole answer in your last message, after your last tool call/);
    expect(SYSTEM.chat).toMatch(/A question about one of their numbers — is it low or high, why, how to improve it .* where it sits against people like them/s);
    expect(SYSTEM.chat).not.toMatch(/it's drawn under your reply — mention it/);
  });
});
