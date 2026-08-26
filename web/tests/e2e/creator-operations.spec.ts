import { expect, test } from "@playwright/test";

const tier = "0x2222222222222222222222222222222222222222";

test("validates management routes before any direct read", async ({ page }) => {
  await page.goto("/tiers/not-an-address/manage");
  await expect(page.getByText("Invalid tier address")).toBeVisible();
  await expect(page.getByText(/management URL/i)).toBeVisible();
});

test("fails registered-tier management closed without deployment config", async ({
  page,
}) => {
  await page.goto(`/tiers/${tier}/manage`);
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(
    page.getByText(/no independently checked factory/i),
  ).toBeVisible();
});

test("fails protocol administration closed without a verified factory", async ({
  page,
}) => {
  await page.goto("/protocol");
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(
    page.getByText(/no independently checked factory/i),
  ).toBeVisible();
});
