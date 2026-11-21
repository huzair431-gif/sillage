import { defineConfig } from '@playwright/test';
const db = process.env.E2E_DATABASE_URL;
if (!db || !new URL(db).pathname.endsWith('_test'))
  throw new Error('E2E_DATABASE_URL doit désigner une base dédiée se terminant par _test.');
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/setup.ts',
  globalTeardown: './tests/e2e/teardown.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    actionTimeout: 15000,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: [
    {
      command: 'npm run start -w @sillage/api',
      url: 'http://127.0.0.1:3003/api/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        DATABASE_URL: db,
        WEB_ORIGIN: 'http://localhost:5174',
        PORT: '3003',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev -w @sillage/web -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 30000,
      env: { API_PROXY_URL: 'http://127.0.0.1:3003' },
    },
  ],
});
