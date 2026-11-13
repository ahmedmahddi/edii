/**
 * The interface tested in a real browser (npm run test:e2e): the app in local mode (no Supabase),
 * on a phone and on a desktop. Needs the Chromium of Playwright: `npx playwright install chromium`
 * once (or PW_CHROMIUM_PATH pointing to a Chromium already there).
 */
import { defineConfig } from "@playwright/test";

const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "telephone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: "ordinateur", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    // Local mode, whatever .env.local holds: the interface without accounts.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  },
});
