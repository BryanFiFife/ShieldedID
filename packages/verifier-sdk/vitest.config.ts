import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  coverage: {
    provider: 'c8',
    reporter: ['text', 'json', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: [
      'node_modules/',
      'dist/',
      'dist-cjs/',
      'coverage/',
      'tests/',
      '**/*.test.ts',
      '**/*.d.ts',
      'examples/',
      'e2e-tests/'
    ],
    all: false,
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
    extension: ['.ts'],
    require: ['ts-node/register'],
    esModules: true,
    useInlineSourceMaps: false
  },
  esbuild: {
    target: 'node18'
  }
});