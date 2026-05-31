import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8097',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm.cmd run web:e2e',
    url: 'http://127.0.0.1:8097',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
