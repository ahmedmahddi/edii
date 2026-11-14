import { expect, test } from "@playwright/test";
import { fitsTheScreen, watchErrors } from "./helpers";

test("an activity found, added, and counted in the establishment", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/classement");
  await page.getByRole("searchbox").first().fill("lait");
  await expect(page.getByRole("button", { name: /^1214/ })).toBeVisible();
  await page.getByRole("button", { name: /^1214/ }).click();
  await expect(page.getByText("Ajouter à l'établissement")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter à l'établissement" }).click();
  await page.getByRole("tab", { name: /tablissement/ }).click();
  // The dossier lists the activity (the search panel, hidden on this screen, names it too).
  await expect(page.getByText("1214").filter({ visible: true }).first()).toBeVisible();
  await fitsTheScreen(page);
  expect(errors).toEqual([]);
});

test("a classification validated starts the establishment's register", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/classement");
  await page.getByRole("searchbox").first().fill("lait");
  await page.getByRole("button", { name: /^Ajouter 1214/ }).click();
  await page.getByRole("tab", { name: /tablissement/ }).click();
  await page.getByRole("textbox", { name: /Quantité pour 1214/ }).fill("50000");
  await page.getByRole("combobox", { name: /Entrée du décret pour 1214/ }).selectOption("none");
  await page.getByRole("textbox", { name: /Nom de l’établissement/ }).fill("Laiterie du Cap Bon");
  await page.getByRole("button", { name: "Valider et générer la synthèse" }).click();
  await expect(page.getByRole("heading", { name: "Synthèse détaillée de classement" })).toBeVisible();
  await fitsTheScreen(page);
  await page.getByRole("button", { name: /Créer le registre/ }).first().click();
  await expect(page).toHaveURL(/\/registres\/nouveau/);
  await expect(page.getByRole("textbox", { name: "Nom de l’établissement" })).toHaveValue("Laiterie du Cap Bon");
  await page.getByRole("button", { name: /Créer le registre \(\d+ textes proposés\)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Laiterie du Cap Bon" })).toBeVisible();
  await expect(page.getByText(/catégorie/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
