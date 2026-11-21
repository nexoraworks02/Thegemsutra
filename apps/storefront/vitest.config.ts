import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for plain TypeScript modules (no browser, no Next.js server).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
