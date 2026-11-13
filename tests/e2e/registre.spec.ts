import { expect, test } from "@playwright/test";
import { fitsTheScreen, newRegister, watchErrors } from "./helpers";

test("a register: evaluate, follow a non-conformity, print the report", async ({ page }) => {
  const errors = watchErrors(page);
  await newRegister(page);
  await page.getByRole("tab", { name: /^Essentiels/ }).click();

  // Conforme: a comment and a written note as evidence; no risk nor action plan asked.
  await page.locator("tr[data-ligne]").nth(0).click();
  await page.getByRole("radio", { name: "Conforme", exact: true }).click();
  await expect(page.getByTestId("plan-nc")).toHaveCount(0);
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await page.getByLabel("Intitulé (facultatif)").fill("Contrat de maintenance");
  await page.getByLabel("Preuve", { exact: true }).fill("Contrat n° 2026-14 avec Société X");
  await page.getByRole("button", { name: "Ajouter le texte" }).click();
  await page.getByRole("button", { name: "Enregistrer l’évaluation" }).click();
  await expect(page.getByRole("list", { name: "Évaluations" }).getByRole("listitem").first()).toContainText("Contrat n° 2026-14");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();

  // Non conforme: risk and action plan in the same form.
  await page.locator("tr[data-ligne]").nth(1).click();
  await page.getByRole("radio", { name: "Non conforme" }).click();
  await expect(page.getByTestId("plan-nc")).toBeVisible();
  await page.getByLabel("Constat").fill("Registre de sécurité absent");
  await page.getByLabel("Responsable").first().fill("M. Rebaii");
  await page.getByRole("button", { name: "Enregistrer l’évaluation" }).click();
  await expect(page.getByRole("heading", { name: "Plan d’action" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();

  await page.getByRole("tab", { name: /^Non conformes/ }).click();
  await expect(page.locator("tr[data-ligne]")).toHaveCount(1);
  await fitsTheScreen(page);

  // The compliance report, ready to print.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Rapport PDF" }).click();
  const rapport = page.getByRole("dialog", { name: "Rapport de conformité" });
  await expect(rapport).toContainText("Non-conformités et plan d’actions");
  await expect(rapport).toContainText("Registre de sécurité absent");
  await expect(page.getByRole("button", { name: "Imprimer / PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).first().click();
  await expect(rapport).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a register from the keyboard, and a text open from its address", async ({ page }) => {
  const errors = watchErrors(page);
  await newRegister(page, "Atelier de Sousse");
  await page.getByRole("tab", { name: /^Essentiels/ }).click();
  await page.locator("body").press("j");
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Nouvelle évaluation" })).toBeVisible();
  await expect(page).toHaveURL(/\?texte=/);
  const title = await sheet.getByRole("heading").first().textContent();
  await page.reload();
  await expect(page.getByRole("dialog").getByRole("heading").first()).toHaveText(title!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\?texte=/);
  await page.locator("body").press("/");
  await expect(page.getByRole("searchbox", { name: "Rechercher dans le registre" })).toBeFocused();
  await fitsTheScreen(page);
  expect(errors).toEqual([]);
});
