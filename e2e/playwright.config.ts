import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 1,
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:4921',
    headless: true,
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
