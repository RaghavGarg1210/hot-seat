import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -w @hotseat/server',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: false,
      env: { DATA_DIR: '../../test-results/e2e-data', OPENAI_API_KEY: '', TYPESAFE_API_KEY: '' },
    },
    {
      command: 'npm run dev -w @hotseat/web',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
