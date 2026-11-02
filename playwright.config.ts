import { defineConfig, devices } from '@playwright/test';

// E2E-tests kører mod den byggede app med en frisk, midlertidig database.
const PORT = 3210;
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node dist/server/server/index.js`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      ADMIN_PASSWORD: 'e2e-admin-pw',
      VIEWER_PASSWORD: 'e2e-viewer',
      DB_FILE: `test-results/e2e-${Date.now()}.sqlite`,
      COOKIE_SECURE: 'false',
    },
  },
});
