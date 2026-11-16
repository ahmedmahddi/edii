import { expect, test } from "@playwright/test";
import { fitsTheScreen, watchErrors } from "./helpers";

test("an activity found, added, and counted in the establishment", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/classement/nouveau");
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
  await page.goto("/classement/nouveau");
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

test("classifications are kept: listed, opened again, changed, linked to their register, copied, deleted", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/classement/nouveau");
  await page.getByRole("searchbox").first().fill("lait");
  await page.getByRole("button", { name: /^Ajouter 1214/ }).click();
  await page.getByRole("tab", { name: /tablissement/ }).click();
  await page.getByRole("textbox", { name: "Nom de l’établissement" }).fill("Fromagerie de Béja");
  await page.getByRole("textbox", { name: /Quantité pour 1214/ }).fill("50000");
  await page.getByRole("combobox", { name: /Entrée du décret pour 1214/ }).selectOption("none");
  const url = page.url();

  // Listed, a draft.
  await page.getByRole("link", { name: "Classements" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Classements" })).toBeVisible();
  const row = page.getByRole("row", { name: /Fromagerie de Béja/ });
  await expect(row).toContainText("Brouillon");
  await expect(row).toContainText("2ème catégorie");

  // Opened again: as it was left; validated, then its register created from it.
  await row.getByRole("link", { name: "Fromagerie de Béja" }).click();
  await expect(page).toHaveURL(new RegExp(url.split("/classement/")[1]!.split("?")[0]!));
  await expect(page.getByRole("textbox", { name: /Quantité pour 1214/ })).toHaveValue("50000");
  await page.getByRole("button", { name: "Valider et générer la synthèse" }).click();
  await page.getByRole("button", { name: "Créer le registre" }).first().click();
  await page.getByRole("button", { name: /Créer le registre \(\d+ textes proposés\)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fromagerie de Béja" })).toBeVisible();
  await page.getByRole("button", { name: "Plus d’actions" }).click();
  await page.getByRole("menuitem", { name: "Revoir le classement" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fromagerie de Béja" })).toBeVisible();

  // Changed: the synthesis is to validate again; the list says so, and names the register.
  await page.getByRole("tab", { name: /tablissement/ }).click();
  await page.getByRole("textbox", { name: /Quantité pour 1214/ }).fill("100");
  await expect(page.getByText(/Le dossier a changé depuis/)).toBeVisible();
  await page.goto("/classement");
  const after = page.getByRole("row", { name: /Fromagerie de Béja/ });
  await expect(after).toContainText("À revalider");
  await expect(after.getByRole("link", { name: "Fromagerie de Béja" }).last()).toHaveAttribute("href", /\/registres\//);

  // Copied, then deleted.
  await after.getByRole("button", { name: /Actions sur/ }).click();
  await page.getByRole("menuitem", { name: "Dupliquer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fromagerie de Béja (copie)" })).toBeVisible();
  await page.goto("/classement");
  const copy = page.getByRole("row", { name: /Fromagerie de Béja \(copie\)/ });
  await copy.getByRole("button", { name: /Actions sur/ }).click();
  await page.getByRole("menuitem", { name: "Supprimer" }).click();
  await expect(page.getByRole("row", { name: /\(copie\)/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Fromagerie de Béja/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a new classification left empty is not kept", async ({ page }) => {
  await page.goto("/classement/nouveau");
  await expect(page).toHaveURL(/\/classement\/cl-/);
  await page.getByRole("link", { name: "Classements" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Classements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucun classement pour l’instant" })).toBeVisible();
});
