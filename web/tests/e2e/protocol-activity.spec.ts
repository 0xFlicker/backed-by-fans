import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  anvilEnabled,
  requiredAnvilAddress,
  requiredAnvilRpc,
} from "./helpers/anvil";

const authentic = process.env.BBF_PROTOCOL_FORK_AUTHENTIC === "1";
test.describe("@protocol-fork public buyback activity", () => {
  test.skip(
    !authentic || !anvilEnabled,
    "Requires the shared authentic protocol fork bootstrap.",
  );
  test("shows fee inventory, conditional forecasts and separate compensation without a wallet", async ({
    page,
  }, testInfo) => {
    await page.goto("/chains/31337/protocol");
    await expect(
      page.getByRole("heading", { level: 1, name: "Protocol activity" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Released fees & burns" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Protocol configuration" }),
    ).toBeVisible();
    const safeSnapshot = JSON.parse(
      await readFile(process.env.BBF_FORK_BOOTSTRAP!, "utf8"),
    );
    await expect(
      page.getByText(
        `${safeSnapshot.safeThreshold} of ${safeSnapshot.safeOwners.length} owners`,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pons trading compensation" }),
    ).toBeVisible();
    await expect(page.getByText(/Accounting through/).last()).toBeVisible();
    await expect(page.getByText(/Vesting is not a burn/)).toBeVisible();
    await expect(
      page.getByText(
        /Reserved funding earns as paid membership time is consumed/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Reserved protocol funding", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Process membership fees" }).first(),
    ).toBeDisabled();
    await expect(
      page.getByRole("option", { name: /Local Creator Circle/ }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    // Measure the finished presentation, not a transient frame of its entrance fade.
    await page.locator(".protocol-heading").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("protocol-activity.png"),
      fullPage: true,
    });
    await testInfo.attach("protocol-activity", {
      path: testInfo.outputPath("protocol-activity.png"),
      contentType: "image/png",
    });
  });
  test("server-renders the actual Safe and token without browser JavaScript", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "One no-JavaScript pass is sufficient",
    );
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/chains/31337/protocol");
      await expect(
        page.getByRole("heading", { name: "Protocol activity" }),
      ).toBeVisible();
      const safeSnapshot = JSON.parse(
        await readFile(process.env.BBF_FORK_BOOTSTRAP!, "utf8"),
      );
      await expect(
        page.getByText(
          `${safeSnapshot.safeThreshold} of ${safeSnapshot.safeOwners.length} owners`,
        ),
      ).toBeVisible();
      const bootstrap = JSON.parse(
        await readFile(process.env.BBF_FORK_BOOTSTRAP!, "utf8"),
      );
      await expect(
        page.getByText(bootstrap.safe, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(bootstrap.protocolToken, { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
  test("keeps membership balances visible when Pons compensation reads fail", async ({
    page,
  }) => {
    const bootstrap = JSON.parse(
      await readFile(process.env.BBF_FORK_BOOTSTRAP!, "utf8"),
    );
    await page.route(`${requiredAnvilRpc()}/`, async (route) => {
      const payload = route.request().postDataJSON();
      const list = Array.isArray(payload) ? payload : [payload];
      const targeted = (request: {
        method: string;
        params?: { to?: string }[];
      }) =>
        request.method === "eth_call" &&
        request.params?.[0]?.to?.toLowerCase() ===
          bootstrap.ponsFactory.toLowerCase();
      if (!list.some(targeted)) {
        await route.continue();
        return;
      }
      const upstream = await route.fetch();
      const data = await upstream.json();
      const responses = (Array.isArray(data) ? data : [data]).map((item) =>
        list.some((request) => request.id === item.id && targeted(request))
          ? {
              jsonrpc: "2.0",
              id: item.id,
              error: { code: -32000, message: "Labeled Pons data outage" },
            }
          : item,
      );
      await route.fulfill({
        response: upstream,
        json: Array.isArray(data) ? responses : responses[0],
      });
    });
    await page.goto("/chains/31337/protocol");
    await page.getByRole("button", { name: "Refresh activity" }).click();
    await expect(page.getByText(/Pons data is unavailable/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Released fees & burns" }),
    ).toBeVisible();
    await expect(
      page
        .getByText(requiredAnvilAddress("paymentToken"), { exact: true })
        .first(),
    ).toBeVisible();
    const safeSnapshot = JSON.parse(
      await readFile(process.env.BBF_FORK_BOOTSTRAP!, "utf8"),
    );
    await expect(
      page.getByText(
        `${safeSnapshot.safeThreshold} of ${safeSnapshot.safeOwners.length} owners`,
      ),
    ).toBeVisible();
  });
});

test("@protocol-fork a wallet burns earned protocol-token fees and preserves the full unused refund", async ({
  page,
}, testInfo) => {
  test.skip(
    !authentic || !anvilEnabled || testInfo.project.name !== "desktop",
    "One real wallet burn and refund is sufficient",
  );
  test.setTimeout(90000);
  const { forkContext } = await import("./helpers/protocol-fork");
  const { snapshotAnvil, revertAnvil, installAnvilWallet, connectAnvilWallet } =
    await import("./helpers/anvil");
  const { erc20Abi } = await import("viem");
  const { membershipTierAbi, protocolBuybackVaultAbi } =
    await import("../../src/contracts");
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      member = requiredAnvilAddress("member"),
      creator = requiredAnvilAddress("creator");
    const tier = await f.tier(
      "Full protocol allocation",
      f.bootstrap.protocolToken,
      10000,
      100n,
    );
    await f.giveProtocolTokens(member, 1200n);
    await f.write(member, f.bootstrap.protocolToken, erc20Abi, "approve", [
      tier,
      1200n,
    ]);
    const purchase = await f.write(
      member,
      tier,
      membershipTierAbi,
      "purchase",
      [12n, "0x0000000000000000000000000000000000000000"],
    );
    const start = (
      await f.client.getBlock({ blockNumber: purchase.blockNumber })
    ).timestamp;
    await f.testClient.setNextBlockTimestamp({ timestamp: start + 350n });
    await f.testClient.mine({ blocks: 1 });
    await f.write(member, tier, membershipTierAbi, "processAccounting", [25n]);
    const earned = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "protocolFeeEarnedHeld",
    });
    await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
    expect(earned).toBeGreaterThanOrEqual(350n);
    expect(earned).toBeLessThan(400n);
    const supplyBefore = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    await installAnvilWallet(page, member);
    await page.goto("/chains/31337/protocol");
    await connectAnvilWallet(page, member);
    const asset = page.locator(".protocol-asset").filter({
      has: page.getByRole("heading", { name: "BBFFORK", exact: true }),
    });
    const process = asset.getByRole("button", {
      name: "Process membership fees",
    });
    await expect(process).toBeEnabled();
    await process.click();
    await expect(asset.getByText(/Burn complete/)).toBeVisible({
      timeout: 45000,
    });
    const burnHash = (await asset
      .locator(".buyback-action")
      .first()
      .locator("code")
      .textContent()) as `0x${string}`;
    f.receipts.push({
      kind: "browser-burn",
      receipt: await f.client.getTransactionReceipt({ hash: burnHash }),
    });
    const supplyAfter = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    expect(supplyBefore - supplyAfter).toBe(earned);
    const inventory = await f.client.readContract({
      address: f.bootstrap.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [f.bootstrap.protocolToken, 0],
    });
    expect(inventory.available).toBe(0n);
    await f.write(member, tier, membershipTierAbi, "processAccounting", [25n]);
    const preview = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewRefund",
      args: [1n],
    });
    const gross = preview.grossRefund;
    expect(gross).toBeGreaterThan(0n);
    expect(preview.fundingScaled[3]).toBe(gross * (1n << 128n));
    expect(preview.fundingScaled.slice(0, 3)).toEqual([0n, 0n, 0n]);
    const beforeBalance = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member],
    });
    await f.write(creator, tier, membershipTierAbi, "refund", [1n, gross]);
    const afterBalance = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member],
    });
    const refunded = afterBalance - beforeBalance;
    expect(refunded).toBeGreaterThan(0n);
    const allocated = 1200n;
    const held = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [tier],
    });
    const protectedCash = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "totalProtectedLiability",
    });
    const finalState = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "allocationState",
      args: [1n],
    });
    const released = earned;
    expect(allocated).toBe(held + released + refunded);
    await f.retain("wallet-direct-burn-refund", {
      tier,
      start,
      earned,
      supplyBefore,
      supplyAfter,
      inventory,
      gross,
      preview,
      beforeBalance,
      afterBalance,
      refunded,
      allocated,
      held,
      released,
      refundAccounting: {
        allocated,
        held,
        protected: protectedCash,
        before: beforeBalance,
        after: afterBalance,
        generation: finalState.generation,
      },
    });
    await page.screenshot({
      path: testInfo.outputPath("completed-membership-burn.png"),
      fullPage: true,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
