import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    include: ['src/**/*.test.js', 'scripts/**/*.test.js'],
    exclude: ['node_modules', 'dist', 'e2e'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',

      // Only measure coverage for logic that warrants it.
      // Page authoring files and CSS are excluded.
      include: [
        'src/domain/**',
        'src/lib/**',
        'src/content/bootstrap/**',
        'src/content/sources/**',
        'src/content/renderers/**',
      ],
      exclude: ['src/pages/**', 'src/styles/**', 'src/**/*.test.js'],

      // CI fails below these thresholds.
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },

    reporters: process.env.CI ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
