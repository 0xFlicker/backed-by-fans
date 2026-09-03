import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const validTier = "0x2222222222222222222222222222222222222222";

test("keeps account recovery focused on retrying discovery", async ({
  page,
}) => {
  await page.goto("/account");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your account.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/manage the ones you create/i)).toBeVisible();
  const discoveryState = page.locator("[data-read-state='unavailable']");
  await expect(discoveryState).toBeVisible();
  await expect(
    discoveryState.getByText(/^(Your memberships|Memberships unavailable)$/),
  ).toBeVisible();
  await expect(page.getByText("List settings")).toHaveCount(0);
  await expect(page.getByText("Already have a membership link?")).toHaveCount(
    0,
  );
});

test("never turns an unavailable supporter read into balances or success", async ({
  page,
}) => {
  await page.goto(`/chains/4663/tiers/${validTier}`);

  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(page.getByText(/not deployed/i)).toBeVisible();
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
