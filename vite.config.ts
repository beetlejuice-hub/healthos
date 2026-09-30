import { execSync } from "node:child_process";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Which build is live, shown in Settings. Cloudflare's builder gives the commit; locally, git does.
const commit = (process.env.WORKERS_CI_COMMIT_SHA || (() => { try { return execSync("git rev-parse HEAD").toString(); } catch { return "dev"; } })()).trim().slice(0, 7);

export default defineConfig({
  define: { __BUILD__: JSON.stringify({ commit, at: new Date().toISOString() }) },
  plugins: [react()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
});
