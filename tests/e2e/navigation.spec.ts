import { expect, test } from "@playwright/test";
import { fitsTheScreen, go, watchErrors } from "./helpers";

test("the home shows the way in, and every screen fits the screen", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Commencez par un établissement" })).toBeVisible();
  await fitsTheScreen(page);
  for (const [link, url, heading] of [
    [/^Registres/, "/registres", "Registres"],
    [/^Veille/, "/veille", "Veille réglementaire"],
    [/^Classement/, "/classement", "Classement"],
    [/^Accueil/, "/", "Accueil"],
  ] as const) {
    await go(page, link);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await fitsTheScreen(page);
  }
  expect(errors).toEqual([]);
});

test("the command palette opens a screen from the keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Accueil" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Rechercher" })).toBeVisible();
  await page.keyboard.type("veille");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/veille");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("each screen has its address, and links of before still lead to it", async ({ page }) => {
  await page.goto("/registres");
  await expect(page.getByRole("heading", { level: 1, name: "Registres" })).toBeVisible();
  await page.goto("/registres/inconnu");
  await expect(page.getByRole("heading", { name: "Registre introuvable" })).toBeVisible();
  await page.goto("/?vue=veille");
  await expect(page).toHaveURL("/veille");
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
  expect(bg).toBe("rgb(13, 15, 18)");
});

test("the veille is read a page at a time, filtered by the server", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/veille");
  await expect(page.getByText(/^\d+ textes$/)).toBeVisible();
  const all = Number((await page.getByText(/^\d+ textes$/).textContent())!.replace(/\D/g, ""));
  expect(await page.locator("ol li").count()).toBeLessThan(all);
  await page.getByRole("searchbox", { name: "Rechercher dans la veille" }).fill("eau");
  await expect(page.getByText(/^\d+ textes?$/)).not.toHaveText(`${all} textes`);
  await page.locator("ol li button").first().click();
  await page.getByRole("radio", { name: "Pertinent" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Statut" }).selectOption("pertinent");
  await expect(page.getByText(/^1 texte$/)).toBeVisible();
  await fitsTheScreen(page);
  expect(errors).toEqual([]);
});
