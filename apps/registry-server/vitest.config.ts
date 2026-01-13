import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'tests/',
        '**/*.test.ts',
        '**/*.d.ts',
        'create-admin.js'
      ],
      reporter: ['text', 'lcov', 'html'],
      all: true,
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90
    }
  }
})