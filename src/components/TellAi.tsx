/**
 * "Tell the AI" on a finding, where the finding is (owner, 31 Oct: "If there's an insight, finding like alcohol and
 * training day correlation i should be able to just say my opinion to ai like it makes no sense to me. It's fun to see it
 * though"). A small button opens the talk-back line (AskAbout) with the finding, and two one-tap answers that the chat
 * knows what to do with (tasks: OPINIONS): "Makes no sense to me" → how the app found it, what else could explain it,
 * what he thinks is going on; "I knew that" → remembered, so the reads stop telling him.
 */

import { useState } from "react";
import { AskAbout } from "./AskAbout";
import { useAiStatus } from "../lib/ai/client";

export const OPINION_STARTERS = ["Makes no sense to me", "I knew that", "Why might this be?"];

/** What the chat gets with the message (not shown in the thread): the finding, as the page shows it. */
export const aboutFinding = (where: string, finding: string) => `## The app's finding this message is about (${where})\n${finding}`;

export function TellAi({ where, finding, label }: { /** "Insights → Noticed" */ where: string; finding: string; /** the finding in a few words — "Re “…”" in the chat */ label: string }) {
  const { on } = useAiStatus(), [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <div className="tell-ai">
      <button type="button" className="ibtn" aria-expanded={open} onClick={() => setOpen(!open)}>Tell the AI</button>
      {open && <AskAbout about={aboutFinding(where, finding)} label={`Re “${label}”`} placeholder="Your take on this…" starters={OPINION_STARTERS} />}
    </div>
  );
}
