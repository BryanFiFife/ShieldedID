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
      'create-admin.js',
      'coverage/**',
      'tests/**',
      '**/*.d.ts'
    ],
    reporter: ['text', 'lcov', 'html']
  }
})