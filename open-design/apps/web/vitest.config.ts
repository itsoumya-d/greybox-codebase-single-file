import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Per-file environment matchers: any test under tests/design or with a
    // .dom.test.* suffix runs against jsdom so React Testing Library works.
    environmentMatchGlobs: [
      ['tests/design/**/*.test.{ts,tsx}', 'jsdom'],
      ['tests/**/*.dom.test.{ts,tsx}', 'jsdom'],
    ],
  },
});
