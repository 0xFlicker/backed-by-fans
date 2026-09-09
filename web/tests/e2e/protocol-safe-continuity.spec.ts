import { expect, test } from "@playwright/test";
import { erc20Abi, zeroAddress } from "viem";
import {
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "../../src/contracts";
import {
  readAdminContext,
  preparePaymentTokenPayload,
} from "../../scripts/protocol-admin";
import { executeForkSafePayload } from "../../scripts/protocol-safe-transactions";
import { forkContext, testKey } from "./helpers/protocol-fork";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
  installAnvilWallet,
  connectAnvilWallet,
  expectReconciled,
} from "./helpers/anvil";

test("@protocol-fork Safe changes preserve membership access and ordinary callers process repaired inventory", async ({
  page,
}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "One signed Safe continuity case",
  );
  test.setTimeout(180000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap,
      asset = requiredAnvilAddress("paymentToken"),
      member = requiredAnvilAddress("member");
    const tier = await f.tier("Safe continuity", asset, 10000, 1000000n);
    const enable = async (enabled: boolean) => {
      const context = await readAdminContext(f.client, 31337, b.factory);
      const payload = await preparePaymentTokenPayload(
        f.client,
        context,
        asset,
        enabled,
      );
      const result = await executeForkSafePayload({
        rpcUrl: f.rpc,
        factory: b.factory,
        payload,
        signerKeys: f.signerKeys,
        relayerKey: testKey(49153),
      });
      f.receipts.push({
        action: enabled ? "enable-token" : "disable-token",
        payload,
        ...result,
      });
    };
    await enable(false);
    await expect(f.tier("Disabled token must reject", asset)).rejects.toThrow();
    await f.safe("pause", { paused: true });
    await installAnvilWallet(page, member);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, member);
    await page.getByLabel("Periods", { exact: true }).fill("12");
    await page.getByRole("button", { name: "Join this membership" }).click();
    await expectReconciled(page, "Join this membership");
    expect(
      await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "isActive",
        args: [member],
      }),
    ).toBe(true);
    await f.testClient.increaseTime({ seconds: 300 });
    await f.testClient.mine({ blocks: 1 });
    await f.write(member, tier, membershipTierAbi, "accrueProtocolFees", [
      [1n],
    ]);
    await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
    const inventory = () =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, 0],
      });
    const pending = await inventory();
    expect(pending.available).toBeGreaterThan(0n);
    const status = () =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "processingStatus",
        args: [asset, 0],
      });
    expect((await status()).status).toBe(2);
    await enable(true);
    await f.safe("pause", { paused: false });
    await f.safe("asset-pause", { asset, paused: true });
    expect((await status()).status).toBe(2);
    const oldRevision = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [asset],
    });
    // Replacing an approved route changes its revision but preserves standing limits.
    await f.safe("route", {
      asset,
      expectedRevisionRaw: String(oldRevision),
      pools: [
        {
          currency0: zeroAddress,
          currency1: asset,
          fee: 100,
          tickSpacing: 1,
          hooks: zeroAddress,
        },
      ],
    });
    await f.safe("asset-pause", { asset, paused: false });
    expect((await status()).status).toBe(0);
    const ready = await status();
    expect(ready.status).toBe(0);
    const supplyBefore = await f.client.readContract({
      address: b.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    await expect(
      f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
        asset,
        0,
        1000000n,
        oldRevision,
        (await f.client.getBlock()).timestamp + 300n,
      ]),
    ).rejects.toThrow();
    await f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
      asset,
      0,
      1000000n,
      ready.revision,
      (await f.client.getBlock()).timestamp + 300n,
    ]);
    const closed = await inventory(),
      supplyAfter = await f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    expect(pending.available - closed.available).toBe(1000000n);
    expect(closed.totalSpent).toBe(1000000n);
    expect(supplyAfter).toBeLessThan(supplyBefore);
    await page.goto("/chains/31337/protocol");
    await expect(
      page.getByText(`${b.safeThreshold} of ${b.safeOwners.length} owners`),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Activity & configuration history" }),
    ).toBeVisible();
    await f.retain("safe-configuration-continuity", {
      tier,
      asset,
      pending,
      closed,
      supplyBefore,
      supplyAfter,
      oldRevision,
      ready,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
