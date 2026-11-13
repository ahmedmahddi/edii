import { expect, type Page } from "@playwright/test";

/** The page fits the screen: nothing wider than the window. */
export async function fitsTheScreen(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, "horizontal overflow").toBeLessThanOrEqual(0);
}

/** A tab of the bar (phone) or the side menu (desktop). */
export async function go(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).first().click();
}

/** A register without classification, opened. */
export async function newRegister(page: Page, nom = "Usine de Sfax") {
  await page.goto("/");
  await page.getByRole("button", { name: "Nouveau registre" }).first().click();
  await page.getByPlaceholder("Nom de l’établissement").fill(nom);
  await page.getByRole("button", { name: /Créer le registre/ }).click();
  await expect(page.locator(".registre-head")).toBeVisible();
}

/** Errors in the page fail the test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|same key|Hydration failed/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}
