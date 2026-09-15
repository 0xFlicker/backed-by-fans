import { expect, test } from "@playwright/test";
import { erc20Abi, zeroAddress } from "viem";
import {
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "../../src/contracts";
import { forkContext } from "./helpers/protocol-fork";
import { compiledAbi } from "./helpers/pons-pool";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
} from "./helpers/anvil";

for (const kind of ["AMD", "WETH"] as const)
  test(`@protocol-fork earned ${kind} membership burns and unused reserve refunds reconcile`, async ({}, info) => {
    test.skip(
      process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
        info.project.name !== "desktop",
      "One authentic raw-asset burn/refund scenario",
    );
    test.setTimeout(120000);
    const snapshot = await snapshotAnvil();
    try {
      const f = await forkContext(),
        member = requiredAnvilAddress("member"),
        creator = requiredAnvilAddress("creator");
      const asset =
        kind === "AMD"
          ? requiredAnvilAddress("scaledPaymentToken")
          : "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
      const price =
          kind === "AMD" ? 2_000_000_000_000_000n : 410_000_000_000_000n,
        tier = await f.tier(`${kind} earned burn`, asset, 10000, price),
        gross = price * 12n;
      if (kind === "WETH")
        await f.write(
          member,
          asset,
          await compiledAbi("AuthenticAssetFixture.sol/IAuthenticWETH.json"),
          "deposit",
          [],
          gross,
        );
      await f.write(member, asset, erc20Abi, "approve", [tier, gross]);
      await f.write(member, tier, membershipTierAbi, "createMembership", [
        12n,
        zeroAddress,
        256n,
      ]);
      await f.testClient.increaseTime({ seconds: 300 });
      await f.testClient.mine({ blocks: 1 });
      await f.write(member, tier, membershipTierAbi, "processAccounting", [
        25n,
      ]);
      await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
      const inventory = () =>
        f.client.readContract({
          address: f.bootstrap.buybackVault,
          abi: protocolBuybackVaultAbi,
          functionName: "inventory",
          args: [asset, 0],
        });
      const released = await inventory();
      expect(released.available).toBeGreaterThanOrEqual(price * 3n);
      await f.configurePublicBuybacks(asset, released.available);
      const status = await f.client.readContract({
        address: f.bootstrap.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "processingStatus",
        args: [asset, 0],
      });
      const supplyBefore = await f.client.readContract({
        address: f.bootstrap.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
      await f.write(
        member,
        f.bootstrap.buybackVault,
        protocolBuybackVaultAbi,
        "process",
        [
          asset,
          0,
          released.available,
          status.revision,
          (await f.client.getBlock()).timestamp + 300n,
        ],
      );
      const supplyAfter = await f.client.readContract({
        address: f.bootstrap.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
      const burned = await f.client.readContract({
        address: f.bootstrap.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [f.bootstrap.protocolToken, 0],
      });
      expect(supplyBefore - supplyAfter).toBe(burned.totalBurned);
      expect(burned.totalBurned).toBeGreaterThan(0n);
      const spent = await inventory();
      expect(spent.totalSpent).toBe(released.available);
      expect(spent.available).toBe(0n);
      await f.write(creator, tier, membershipTierAbi, "setPaused", [true]);
      const preview = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [1n],
      });
      expect(preview.fundingScaled[3]).toBe(preview.grossRefund * (1n << 128n));
      expect(preview.fundingScaled.slice(0, 3)).toEqual([0n, 0n, 0n]);
      const beforeRefund = await f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      await f.write(creator, tier, membershipTierAbi, "refund", [
        1n,
        member,
        gross,
        256n,
      ]);
      const afterRefund = await f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      const finalState = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "allocationState",
        args: [1n],
      });
      const held = await f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [tier],
      });
      const protectedCash = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "totalProtectedLiability",
      });
      expect(afterRefund).toBeGreaterThan(beforeRefund);
      await f.retain(`asset-burn-refund-${kind}`, {
        asset,
        tier,
        gross,
        released,
        spent,
        supplyBefore,
        supplyAfter,
        burned,
        preview,
        beforeRefund,
        afterRefund,
        finalState,
        refundAccounting: {
          allocated: gross,
          held,
          protected: protectedCash,
          before: beforeRefund,
          after: afterRefund,
          generation: finalState.generation,
        },
      });
    } finally {
      await revertAnvil(snapshot);
    }
  });
