import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import worker, { nowPage } from "./index";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("/now — How now? as its own Home Screen icon", () => {
  it("the page announces itself as How now? with its own manifest and icon", () => {
    const p = nowPage(html);
    expect(p).toContain("<title>How now?</title>");
    expect(p).toContain('href="/now.webmanifest"');
    expect(p).toContain('href="/now-180.png"');
    expect(p).toContain('name="apple-mobile-web-app-title" content="How now?"');
    expect(p).not.toContain('href="/manifest.webmanifest"');
    // Everything else (the app itself) is unchanged.
    expect(p.replace(/How now\?|now\.webmanifest|now-180\.png/g, "")).toBe(html.replace(/HealthOS(?=<\/title>|" \/>\s*<meta name="apple-mobile-web-app-status)|manifest\.webmanifest|icon-180\.png/g, ""));
  });

  it("the Worker serves it at /now from the app's own index.html", async () => {
    const env = { ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === "/" ? new Response(html) : new Response("nope", { status: 404 })) } };
    const r = await worker.fetch(new Request("https://app/now"), env as never, { waitUntil: () => {} });
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toContain("<title>How now?</title>");
  });
});
