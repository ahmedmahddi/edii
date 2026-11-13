import { expect, test } from "@playwright/test";
import { fitsTheScreen, go, watchErrors } from "./helpers";

test("an activity found, added, and counted in the establishment", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await go(page, /^Nomenclature/);
  await page.getByRole("searchbox").first().fill("lait");
  await expect(page.getByRole("button", { name: /^1214/ })).toBeVisible();
  await page.getByRole("button", { name: /^1214/ }).click();
  await expect(page.getByText("Ajouter à l'établissement")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter à l'établissement" }).click();
  await go(page, /tablissement/);
  // The dossier lists the activity (the search panel, hidden on this screen, names it too).
  await expect(page.getByText("1214").filter({ visible: true }).first()).toBeVisible();
  await fitsTheScreen(page);
  expect(errors).toEqual([]);
});
