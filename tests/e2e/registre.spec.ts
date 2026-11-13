import { expect, test } from "@playwright/test";
import { fitsTheScreen, newRegister, watchErrors } from "./helpers";

test("a register: evaluate, follow a non-conformity, print the report", async ({ page }) => {
  const errors = watchErrors(page);
  await newRegister(page);
  await page.getByRole("tab", { name: /^Essentiels/ }).click();

  // Conforme: a comment and a written note as evidence; no risk nor action plan asked.
  await page.locator(".ligne-row").nth(0).click();
  await page.getByRole("radio", { name: "Conforme", exact: true }).click();
  await expect(page.locator(".panel-nc")).toHaveCount(0);
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await page.getByLabel("Intitulé (facultatif)").fill("Contrat de maintenance");
  await page.getByLabel("Preuve", { exact: true }).fill("Contrat n° 2026-14 avec Société X");
  await page.getByRole("button", { name: "Ajouter le texte" }).click();
  await page.getByRole("button", { name: "Enregistrer l’évaluation" }).click();
  await expect(page.locator(".history li").first()).toContainText("Contrat n° 2026-14");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();

  // Non conforme: risk and action plan in the same form.
  await page.locator(".ligne-row").nth(1).click();
  await page.getByRole("radio", { name: "Non conforme" }).click();
  await expect(page.locator(".panel-nc")).toBeVisible();
  await page.getByLabel("Constat").fill("Registre de sécurité absent");
  await page.getByLabel("Responsable").first().fill("M. Rebaii");
  await page.getByRole("button", { name: "Enregistrer l’évaluation" }).click();
  await expect(page.getByRole("heading", { name: "Plan d’action" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();

  await page.getByRole("tab", { name: /^Non conformes/ }).click();
  await expect(page.locator(".ligne-row")).toHaveCount(1);
  await fitsTheScreen(page);

  // The compliance report, ready to print.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Rapport de conformité/ }).click();
  await expect(page.locator(".rapport")).toContainText("Non-conformités et plan d’actions");
  await expect(page.locator(".rapport")).toContainText("Registre de sécurité absent");
  await expect(page.getByRole("button", { name: "Imprimer / PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).first().click();
  await expect(page.locator(".rapport-root")).toHaveCount(0);
  expect(errors).toEqual([]);
});
