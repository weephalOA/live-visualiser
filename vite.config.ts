import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site from /<repo-name>/, so built assets need that base (B8.8).
// Rename this if the repository is renamed, or set it to '/' for a custom domain.
const PAGES_BASE = '/live-visualiser/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
