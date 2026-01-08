import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Only run e2e tests in this directory
    include: ["e2e-tests/**/*.test.ts"]
  }
});