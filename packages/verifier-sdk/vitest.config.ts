import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      exclude: [
        'dist-cjs/**',
        'dist/**',
        'node_modules/**',
        'examples/**',
        '**/*.d.ts'
      ],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95
      }
    }
  }
});