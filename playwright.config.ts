import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 60000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup: login and save auth state
    {
      name: 'lawyer-setup',
      testMatch: /admin\.setup\.ts/,
    },
    // Auth tests (no login needed)
    {
      name: 'auth-pages',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // All authenticated tests as Lawyer
    {
      name: 'authenticated',
      testMatch: /dashboard|lawyers|appointments|navigation|admin-dashboard/,
      dependencies: ['lawyer-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: './e2e/.auth/admin.json',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.BASE_URL || 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
