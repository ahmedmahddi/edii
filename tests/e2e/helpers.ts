import { expect, type Page } from "@playwright/test";

/** The page fits the screen: nothing wider than the window. */
export async function fitsTheScreen(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, "horizontal overflow").toBeLessThanOrEqual(0);
}

/** A link of the tab bar (phone) or the side menu (desktop): the one on screen. */
export async function go(page: Page, name: RegExp) {
  await page.getByRole("link", { name }).filter({ visible: true }).first().click();
}

/** A register without classification, opened. */
export async function newRegister(page: Page, nom = "Usine de Sfax") {
  await page.goto("/registres/nouveau");
  await page.getByRole("textbox", { name: "Nom de l’établissement" }).fill(nom);
  await page.getByRole("button", { name: /Créer le registre \(\d+ textes proposés\)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: nom })).toBeVisible();
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
