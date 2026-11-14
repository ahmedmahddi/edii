import { expect, test } from "@playwright/test";
import { createRegister, createWorkspace, email, evaluate, figures, saved, signUp } from "./helpers";

test("an account, a workspace, a register: an evaluation is kept after a reload", async ({ page }) => {
  await signUp(page, email("solo"), "Solo E2E");
  await createWorkspace(page, "E2E Solo SA");
  await createRegister(page, "Usine E2E");
  await evaluate(page, 0, "Non conforme", "Extincteurs non vérifiés");
  await saved(page);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Usine E2E" })).toBeVisible();
  expect(await figures(page)).toEqual({ conformes: 0, nonConformes: 1 });
  await page.getByRole("tab", { name: /^Non conformes/ }).click();
  await expect(page.locator("tr[data-ligne]")).toHaveCount(1);
});

test("two colleagues on one register at the same time: both evaluations are kept", async ({ browser }) => {
  const a = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const bob = email("bob");

  // Alice: her company's workspace, a register, and Bob invited as editor.
  await signUp(a, email("alice"), "Alice E2E");
  await createWorkspace(a, "E2E Duo SA");
  await createRegister(a, "Dépôt E2E");
  const registre = a.url();
  await a.goto("/equipe");
  await a.getByLabel("Adresse e-mail").fill(bob);
  await a.getByRole("button", { name: "Inviter" }).click();
  await expect(a.getByText(`Invitation enregistrée pour ${bob}`)).toBeVisible();

  // Bob: signs up with the invited address and joins.
  await signUp(b, bob, "Bob E2E");
  await b.getByRole("button", { name: "Rejoindre" }).click();
  await expect(b.getByRole("heading", { level: 1, name: "Accueil" })).toBeVisible();

  // Both open the register; each evaluates a different text, without reloading in between.
  await a.goto(registre);
  await b.goto(registre);
  await expect(b.getByRole("heading", { level: 1, name: "Dépôt E2E" })).toBeVisible();
  await evaluate(a, 0, "Non conforme", "Registre de sécurité absent");
  await evaluate(b, 1, "Conforme", "Contrat de maintenance à jour");
  await saved(a);
  await saved(b);

  // Read back: nothing lost on either side.
  for (const p of [a, b]) {
    await p.reload();
    await expect(p.getByRole("heading", { level: 1, name: "Dépôt E2E" })).toBeVisible();
    expect(await figures(p)).toEqual({ conformes: 1, nonConformes: 1 });
  }
});

test("a reader cannot change a register", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();
  const carol = email("carol");
  await signUp(a, email("owner"), "Owner E2E");
  await createWorkspace(a, "E2E Lecture SA");
  await createRegister(a, "Atelier E2E");
  const registre = a.url();
  await a.goto("/equipe");
  await a.getByLabel("Adresse e-mail").fill(carol);
  await a.getByRole("combobox", { name: "Rôle" }).selectOption("viewer");
  await a.getByRole("button", { name: "Inviter" }).click();
  await signUp(c, carol, "Carol E2E");
  await c.getByRole("button", { name: "Rejoindre" }).click();
  await c.goto(registre);
  await expect(c.getByRole("heading", { level: 1, name: "Atelier E2E" })).toBeVisible();
  await c.getByRole("tab", { name: /^Essentiels/ }).click();
  await c.locator("tr[data-ligne]").first().click();
  await expect(c.getByRole("heading", { name: "Nouvelle évaluation" })).toHaveCount(0);
});
