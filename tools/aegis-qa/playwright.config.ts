import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { headless: false },
  reporter: [['list'], ['json', { outputFile: 'artifacts/healing-report.json' }]],
});