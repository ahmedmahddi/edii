/**
 * The interface with accounts (npm run test:e2e:comptes): the app connected to a Supabase project
 * given by E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY (a test project, never the clients'). The
 * tests create their own accounts: the project must not ask to confirm e-mail addresses
 * (Authentication → Sign In / Providers → Email → Confirm email: off).
 */
import { defineConfig } from "@playwright/test";

const PORT = 3220;
const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("E2E_SUPABASE_URL et E2E_SUPABASE_ANON_KEY : le projet Supabase de test.");

export default defineConfig({
  testDir: "tests/e2e-comptes",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key },
  },
});
