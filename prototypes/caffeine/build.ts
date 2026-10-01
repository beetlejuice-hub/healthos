/** Builds prototypes/caffeine.html: bundles main.ts and inlines it into page.html. Run: `bun prototypes/caffeine/build.ts`. */
const out = await Bun.build({ entrypoints: [`${import.meta.dir}/main.ts`], target: "browser", minify: true });
if (!out.success) throw new AggregateError(out.logs, "bundle failed");
const js = await out.outputs[0].text();
const page = await Bun.file(`${import.meta.dir}/page.html`).text();
await Bun.write(`${import.meta.dir}/../caffeine.html`, page.replace("/*BUNDLE*/", () => js));
