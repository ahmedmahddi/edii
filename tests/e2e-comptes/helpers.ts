import { expect, type Page } from "@playwright/test";

const stamp = Date.now().toString(36);
/** A new address for this run (E2E_EMAIL_DOMAIN, example.com by default). */
export const email = (who: string) => `e2e-${who}-${stamp}@${process.env.E2E_EMAIL_DOMAIN ?? "example.com"}`;
export const PASSWORD = "e2e-motdepasse-1";

/** A new account, signed in; it lands on the onboarding (no workspace yet). */
export async function signUp(page: Page, address: string, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom et prénom").fill(name);
  await page.getByLabel("Adresse e-mail").fill(address);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByLabel("Nom de l’entreprise").fill(name);
  await page.getByRole("button", { name: "Créer l’espace de travail" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Accueil" })).toBeVisible();
}

export async function createRegister(page: Page, nom: string) {
  await page.goto("/registres/nouveau");
  await page.getByRole("textbox", { name: "Nom de l’établissement" }).fill(nom);
  await page.getByRole("button", { name: /Créer le registre \(\d+ textes proposés\)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: nom })).toBeVisible();
}

/** Evaluate the n-th text of the essentials. */
export async function evaluate(page: Page, n: number, conformite: "Conforme" | "Non conforme", constat: string) {
  await page.getByRole("tab", { name: /^Essentiels/ }).click();
  await page.locator("tr[data-ligne]").nth(n).click();
  await page.getByRole("radio", { name: conformite, exact: true }).click();
  await page.getByLabel(conformite === "Conforme" ? "Commentaire (facultatif)" : "Constat").fill(constat);
  await page.getByRole("button", { name: "Enregistrer l’évaluation" }).click();
  await expect(page.getByRole("list", { name: "Évaluations" })).toContainText(constat);
  await page.keyboard.press("Escape");
}

/** The figures of the register's header: conforming, non conforming. */
export async function figures(page: Page) {
  const value = async (label: string) => Number((await page.getByRole("button", { name: new RegExp(`${label}$`) }).first().textContent())!.replace(/\D/g, ""));
  return { conformes: await value("Conformes"), nonConformes: await value("Non conformes") };
}

/** Wait until the side menu says everything is saved. */
export async function saved(page: Page) {
  await expect(page.getByText(/enregistrement…|non enregistré/)).toHaveCount(0, { timeout: 20_000 });
}
