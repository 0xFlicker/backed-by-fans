import { expect, test } from "@playwright/test";

const validTier = "0x2222222222222222222222222222222222222222";

test("validates a direct tier route before reading any contract", async ({
  page,
}) => {
  await page.goto("/tiers/not-an-address");
  await expect(page.getByText("Invalid tier address")).toBeVisible();
  await expect(
    page.getByText(/does not contain a valid EVM address/i),
  ).toBeVisible();
});

test("renders a configured-unavailable state for a valid direct route", async ({
  page,
}) => {
  await page.goto(`/tiers/${validTier}`);
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(
    page.getByText(/no independently checked factory/i),
  ).toBeVisible();
});

test("serves the provisional app icon and favicon routes", async ({
  request,
}) => {
  const icon = await request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await icon.text()).toContain("Backing Stack");

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/x-icon");
  expect((await favicon.body()).byteLength).toBeGreaterThan(1_000);
});

test("keeps creator setup explicitly non-transactional in the foundation", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your work. Your membership. Your people.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/no independently checked factory/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /deploy|create/i }),
  ).toHaveCount(0);
});
