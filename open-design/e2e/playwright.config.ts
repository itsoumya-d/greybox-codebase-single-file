import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonPort = Number(process.env.AGDS_PORT ?? process.env.OD_PORT) || 17_456;
const webPort = Number(process.env.AGDS_WEB_PORT ?? process.env.OD_WEB_PORT) || 17_573;
const baseURL = `http://127.0.0.1:${webPort}`;
const namespace = process.env.AGDS_E2E_NAMESPACE ?? process.env.OD_E2E_NAMESPACE ?? `playwright-${process.pid}`;
const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eRoot, '..');
const dataDir = path.resolve(e2eRoot, process.env.AGDS_E2E_DATA_DIR ?? process.env.OD_E2E_DATA_DIR ?? `ui/.agds-data/${namespace}`);
const toolsDevBin = path.join(repoRoot, 'tools/dev/bin/tools-dev.mjs');
const skipWebServer = process.env.PLAYWRIGHT_NO_WEB_SERVER === '1';

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export default defineConfig({
  testDir: './ui',
  outputDir: './ui/reports/test-results',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 10_000,
  },
  // The webServer owns one daemon and one AGDS_DATA_DIR for the entire UI suite.
  // Keep backend-mutating UI tests serialized until the harness can boot an
  // isolated daemon/data directory per worker.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: './ui/reports/playwright-html-report' }],
        ['json', { outputFile: './ui/reports/results.json' }],
        ['junit', { outputFile: './ui/reports/junit.xml' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: './ui/reports/playwright-html-report' }],
        ['json', { outputFile: './ui/reports/results.json' }],
        ['junit', { outputFile: './ui/reports/junit.xml' }],
      ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command:
            `AGDS_DATA_DIR=${shellQuote(dataDir)} ` +
            `node ${shellQuote(toolsDevBin)} run web --namespace ${shellQuote(namespace)} --daemon-port ${daemonPort} --web-port ${webPort}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
