/**
 * Builds prototypes/balance.html: runs the bench race (so the table is never stale), bundles
 * main.ts, inlines both into page.html. Run: `bun prototypes/balance/build.ts`.
 */
import { race } from "../../src/lib/balance/race";
import { SCENARIOS, type ScenarioId } from "../../src/lib/balance/world";

const SEEDS = 60;
const rows = (Object.keys(SCENARIOS) as ScenarioId[]).map((id) => ({ id, label: SCENARIOS[id].label, ...race(id, SEEDS) }));
const shift = SCENARIOS.shift.w;
const ages = [7, 14, 21, 35, 50].map((ago) => {
  (SCENARIOS.shift as { w: typeof shift }).w = { ...shift, burn: (i: number) => (i < shift.days - ago ? 2800 : 2500) };
  return { ago, ...race("shift", SEEDS) };
});
(SCENARIOS.shift as { w: typeof shift }).w = shift;

const out = await Bun.build({ entrypoints: [`${import.meta.dir}/main.ts`], target: "browser", minify: true });
if (!out.success) throw new AggregateError(out.logs, "bundle failed");
const js = await out.outputs[0].text();
const RACE = { rows: rows.filter((r) => r.id !== "shift"), ages, seeds: SEEDS, built: new Date().toISOString().slice(0, 10) };
const page = await Bun.file(`${import.meta.dir}/page.html`).text();
await Bun.write(`${import.meta.dir}/../balance.html`, page.replace("/*BUNDLE*/", () => `const RACE=${JSON.stringify(RACE)};\n${js}`));
console.log(rows.map((r) => `${r.id}: app ${Math.round(r.app.mae)} bal ${Math.round(r.bal.mae)}`).join(" · "));
