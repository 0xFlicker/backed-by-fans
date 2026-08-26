import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const validTier = "0x2222222222222222222222222222222222222222";

test("keeps direct membership access independent of discovery configuration", async ({
  page,
}) => {
  await page.goto("/account");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Memberships that stay yours.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/no indexer or account database/i)).toBeVisible();
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();

  const input = page.getByLabel(/Tier contract/);
  await input.fill("not-an-address");
  await expect(page.getByText(/complete EVM address/i)).toBeVisible();
  await input.fill(validTier);
  await expect(
    page.getByRole("link", { name: "Read this tier" }),
  ).toHaveAttribute("href", `/tiers/${validTier}`);
});

test("never turns an unavailable supporter read into balances or success", async ({
  page,
}) => {
  await page.goto(`/tiers/${validTier}`);

  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(
    page.getByText(/no independently checked factory/i),
  ).toBeVisible();
  await expect(page.getByText(/complete and reconciled onchain/i)).toHaveCount(
    0,
  );
  await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
});

test("keeps the account route keyboard reachable, responsive, and accessible", async ({
  page,
}) => {
  await page.goto("/account");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
