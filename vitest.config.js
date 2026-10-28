// Projets de tests : unitaires et API.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/shared/test/**/*.test.js', 'tests/unit/**/*.test.js'], environment: 'node' } },
      {
        test: {
          name: 'api',
          include: ['apps/api/test/**/*.test.js'],
          setupFiles: ['apps/api/test/setup.js'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
