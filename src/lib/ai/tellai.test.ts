// Talking back to a finding (owner, 31 Oct: "If there's an insight, finding like alcohol and training day correlation i
// should be able to just say my opinion to ai like it makes no sense to me. It's fun to see it though"). The chat gets
// the finding under its own heading and knows what "Makes no sense to me" and "I knew that" ask of it; every read that
// writes advice treats a "Knows:" memory line as old news.
import { describe, expect, it } from "vitest";
import { SYSTEM } from "./tasks";
import { aboutFinding, OPINION_STARTERS } from "../../components/TellAi";

describe("Tell the AI", () => {
  it("the finding goes to the chat under its own heading, where it was", () => {
    expect(aboutFinding("Insights → Noticed", "Drinks go with 0.8 h less sleep — clear.")).toBe("## The app's finding this message is about (Insights → Noticed)\nDrinks go with 0.8 h less sleep — clear.");
  });
  it("the one-tap replies are the owner's words, and the chat knows what each asks", () => {
    expect(OPINION_STARTERS.slice(0, 2)).toEqual(["Makes no sense to me", "I knew that"]);
    expect(SYSTEM.chat).toMatch(/OPINIONS ON A FINDING[^\n]*"Makes no sense to me"[^\n]*how it was found[^\n]*what else could explain it[^\n]*"I knew that": remember it as "Knows: …"/);
  });
  it("what he already knows isn't news in any read that gives advice", () => {
    for (const t of ["digest", "night"] as const) {
      expect(SYSTEM[t], t).toMatch(/memory lines starting "Knows:", or a finding they answered "I knew that"[^\n]*is never news/);
      // an Inbox reply reaches the reads as `— I said: "Makes no sense to me"` beside the finding (sections)
      expect(SYSTEM[t], t).toMatch(/answered "Makes no sense to me" isn't stated again as fact/);
    }
    // control: the chat isn't told to leave his knowledge out — it's where he says it
    expect(SYSTEM.chat).not.toMatch(/is never news/);
  });
});
