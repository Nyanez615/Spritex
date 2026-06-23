import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: true,
    // Scoped to src/ only — tools/seed-gen/test/*.test.ts is a separate
    // suite run via Node's native test runner (npm run seed-gen:test),
    // not Vitest; without this, Vitest's default include pattern picks it
    // up too and silently no-ops it.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
