import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
  coverage: {
    exclude: [
      'public/**',
      'dist/**',
      'scripts/**',
      'migrations/**',
      'src/admin/**',
      'src/observability/**',
      'src/server.ts',
      'create-admin.js',
      'coverage/**',
      'tests/**',
      '**/*.d.ts'
    ],
    reporter: ['text', 'lcov', 'html'],
    statements: 85,
    branches: 80,
    functions: 85,
    lines: 85
  }
})