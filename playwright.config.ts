import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*smoke\.spec\.ts/,
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx tsx server.ts',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      DISABLE_HMR: 'true',
    },
  },
  projects: [
    {
      name: 'Mobile 390px',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
    {
      name: 'Desktop Chrome',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});

