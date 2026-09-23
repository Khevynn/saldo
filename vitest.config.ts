import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    testTimeout: 30000,
    unstubGlobals: true,
  },
});
