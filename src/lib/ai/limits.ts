/**
 * How long a context may be (characters), shared by the app (lib/ai/context fitContext) and the Worker (worker/ai.ts
 * validate) so they can't drift apart (owner, 17 Nov: every morning read and question failing "context too long" — the
 * app's budget only trimmed the journal, the Worker refused at 48,000). The app makes contexts within CONTEXT_MAX; the
 * Worker takes up to CONTEXT_LIMIT, the headroom for what a task adds around it. No imports: the Worker reads this too.
 */
export const CONTEXT_MAX = 44_000;
export const CONTEXT_LIMIT = CONTEXT_MAX + 16_000;
/** The deep dive and the night read add a day or a topic on top of the overview. */
export const CONTEXT_LIMIT_LONG = CONTEXT_LIMIT + 12_000;
