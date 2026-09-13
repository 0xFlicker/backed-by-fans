import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createPublicClient, http, erc20Abi } from "viem";
import {
  protocolBuybackVaultAbi,
  iSafeAbi,
  membershipFactoryAbi,
} from "../../src/contracts";
import { requiredAnvilRpc } from "./helpers/anvil";

test.use({ serviceWorkers: "block" });
test("@buyback-settings rehearses repeatedly without changing memberships, vault or Safe", async ({
  page,
}, info) => {
  test.skip(
    !process.env.BBF_POLICY_TEST_BOOTSTRAP || info.project.name !== "desktop",
    "Explicit local demo configuration required",
  );
  test.setTimeout(240000);
  const boot = JSON.parse(
    await readFile(process.env.BBF_POLICY_TEST_BOOTSTRAP!, "utf8"),
  );
  const source = createPublicClient({
    transport: http(requiredAnvilRpc(), { retryCount: 0, timeout: 15000 }),
    cacheTime: 0,
  });
  const state = async () => ({
    supply: await source.readContract({
      address: boot.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    }),
    nonce: await source.readContract({
      address: boot.safe,
      abi: iSafeAbi,
      functionName: "nonce",
    }),
    count: await source.readContract({
      address: boot.factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
    }),
    sequence: await source.readContract({
      address: boot.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "settlementSequence",
    }),
  });
  const before = await state();
  await page.goto("/chains/31337/tools/buybacks");
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }).first(),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Membership network" })
    .first()
    .selectOption("31337");
  await expect(
    page.getByRole("heading", { name: "ETH · ETH + WETH", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Over hours", { exact: true }).fill("1");
  await page
    .getByLabel("Maximum gas % of purchase value", { exact: true })
    .fill("100");
  await page
    .getByRole("button", { name: "Apply calculated sizes across currencies" })
    .click();
  await expect(
    page.getByRole("button", { name: "Review 3 currencies", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/local/buybacks/rehearse"),
    );
    await page
      .getByRole("button", { name: "Rehearse selected settings", exact: true })
      .click();
    const result = await response;
    expect(result.status()).toBe(200);
    const report = await result.json();
    expect(report.totals.batches).toBeGreaterThan(0);
    expect(BigInt(report.totals.burnedRaw)).toBeGreaterThan(0n);
    await expect(page.getByText(/Previewed .* gwei\./)).toBeVisible();
    expect(await state()).toEqual(before);
  }
  await page
    .getByRole("region", { name: "Review settings" })
    .screenshot({ path: info.outputPath("stateless-preview.png") });
});
