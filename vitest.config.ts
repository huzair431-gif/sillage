import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'domain', include: ['tests/domain.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'components',
          include: [
            'tests/components.test.tsx',
            'tests/quiz-timer.test.tsx',
            'tests/auth.test.tsx',
          ],
          environment: 'jsdom',
        },
      },
    ],
  },
});
