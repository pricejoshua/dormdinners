import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Mock server-only so it doesn't throw in test environment
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
  },
  resolve: {
    alias: {
      'server-only': new URL('./lib/llm/__mocks__/server-only.ts', import.meta.url)
        .pathname,
    },
  },
});
