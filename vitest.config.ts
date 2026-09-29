import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Tests run on the pure /lib code only, so they skip the Cloudflare and Tailwind plugins.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
