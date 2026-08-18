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

      include: [
        'src/domain/**',
        'src/lib/**',
        'src/content/bootstrap/**',
        'src/content/sources/**',
        'src/content/renderers/**',
      ],

      exclude: [
        // Requires live Vite dev server or built dist/ — covered by E2E instead
        'src/lib/render-context-factory.js',
        'src/lib/render-page.js',
        'src/lib/head-builder.js',
        'src/lib/hydration.js',
        'src/lib/component.js',

        // Interface-only files with no executable logic
        'src/lib/cache/cache-adapter.js',

        // Test helpers
        'src/**/*.test.js',
        'src/testing/**',
      ],

      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },

    reporters: process.env.CI ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
