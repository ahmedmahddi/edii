import { expect, test } from "@playwright/test";
import { fitsTheScreen, go, watchErrors } from "./helpers";

test("the home shows the way in, and every screen fits the screen", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Commencez par un établissement" })).toBeVisible();
  await fitsTheScreen(page);
  for (const [tab, heading] of [
    [/^Nomenclature/, "Nomenclature"],
    [/tablissement/, "Mon établissement"],
    [/^Registres/, "Registres"],
    [/^Veille/, "Veille réglementaire"],
  ] as const) {
    await go(page, tab);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await fitsTheScreen(page);
  }
  expect(errors).toEqual([]);
});

test("the legal pages are reachable", async ({ page }) => {
  await page.goto("/cgu");
  await expect(page.getByRole("heading", { level: 1, name: "Conditions générales d’utilisation" })).toBeVisible();
  await page.getByRole("link", { name: "Politique de confidentialité" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Politique de confidentialité" })).toBeVisible();
  await fitsTheScreen(page);
});

test("the security headers are sent", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("dark mode follows the choice made", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("abclassement-theme", "dark"));
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(11, 18, 32)");
});
