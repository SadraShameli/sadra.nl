import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
    forbidOnly: !!process.env.CI,
    fullyParallel: true,
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    reporter: process.env.CI ? 'github' : 'list',
    retries: process.env.CI ? 2 : 0,
    testDir: './tests/e2e',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    webServer: process.env.PLAYWRIGHT_NO_SERVER
        ? undefined
        : {
              command: 'bun run dev',
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
              url: baseURL,
          },
    workers: process.env.CI ? 1 : undefined,
});
