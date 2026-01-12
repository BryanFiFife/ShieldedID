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
        '**/*.d.ts',
        'tests/**'
      ],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80
      }
    }
  }
});