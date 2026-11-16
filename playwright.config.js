// Tests de bout en bout (E2E_BASE_URL : site en ligne, lecture seule).
import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT ?? '3100';
const external = process.env.E2E_BASE_URL;
const runAll = process.env.E2E_ALL === '1';
const forwardedProto = process.env.E2E_FORWARDED_PROTO;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  grep: external && !runAll ? /@lecture-seule/ : undefined,
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    extraHTTPHeaders: forwardedProto ? { 'X-Forwarded-Proto': forwardedProto } : undefined,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: external
    ? undefined
    : {
        command: 'node scripts/e2e-server.mjs',
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
