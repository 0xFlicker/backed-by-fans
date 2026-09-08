import { expect, test } from "@playwright/test";
import {
  createWalletClient,
  http,
  erc20Abi,
  zeroAddress,
  keccak256,
  encodeAbiParameters,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
  iPonsBondingCurveAbi,
  iPonsLaunchFactoryAbi,
  iPonsBuybackVaultAbi,
  iPonsFeeEscrowAbi,
  iPonsMemeHookAbi,
  protocolBuybackVaultAbi,
  membershipTierAbi,
} from "../../src/contracts";
import { readPonsCompensation } from "../../src/features/protocol/pons-read";
import { forkContext, testKey } from "./helpers/protocol-fork";
import { poolTrade, poolParameters, compiledAbi } from "./helpers/pons-pool";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
} from "./helpers/anvil";

test("@protocol-fork crosses graduation, burns through the real pool and reconciles native pool vesting", async ({}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "One authentic transition scenario",
  );
  test.setTimeout(240000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap,
      trader = requiredAnvilAddress("member");
    const developer = privateKeyToAccount(testKey(20817));
    const curve = <
      N extends
        | "graduationThreshold"
        | "realQuoteReserve"
        | "feeBps"
        | "quoteReserve"
        | "tokenReserve"
        | "quoteFeeBalance"
        | "buybackQuoteBalance"
        | "protocolFeeShareBps",
    >(
      functionName: N,
    ) =>
      f.client.readContract({
        address: b.curve,
        abi: iPonsBondingCurveAbi,
        functionName,
      });
    const launch = () =>
      f.client.readContract({
        address: b.ponsFactory,
        abi: iPonsLaunchFactoryAbi,
        functionName: "getLaunchedToken",
        args: [b.protocolToken],
      });
    const inventory = (asset: Address) =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, 1],
      });
    const supply = () =>
      f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    const external = await readPonsCompensation(f.client, {
      chainId: 31337,
      protocolToken: b.protocolToken,
    });
    expect(external.status).toBe("valid");
    if (external.status !== "valid")
      throw new Error("Pons snapshot unavailable");
    const p = external.data;
    const net =
      (await curve("graduationThreshold")) -
      (await curve("realQuoteReserve")) -
      1000000000000n;
    const fee = await curve("feeBps"),
      gross = (net * 10000n) / (10000n - fee);
    await f.write(
      trader,
      b.curve,
      iPonsBondingCurveAbi,
      "buy",
      [gross, 1n, trader],
      gross,
    );
    expect((await launch()).phase).toBe(0);
    const offered = 1000000000000000n,
      state = await launch();
    const hookFee = await f.client.readContract({
      address: p.hook,
      abi: iPonsMemeHookAbi,
      functionName: "hookFeeBps",
    });
    const poolCost = BigInt(state.poolFee) / 100n + hookFee,
      cost = fee > poolCost ? fee : poolCost;
    const afterCost = offered - (offered * cost) / 10000n;
    const expected =
      (afterCost * (await curve("tokenReserve"))) /
      ((await curve("quoteReserve")) + afterCost);
    const revision = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [zeroAddress],
    });
    const now = (await f.client.getBlock()).timestamp;
    await f.safe("policy", {
      asset: zeroAddress,
      expectedRevisionRaw: String(revision),
      policy: {
        validAfterRaw: String(now),
        validUntilRaw: String(now + 900n),
        batchCapRaw: String(offered),
        totalBudgetRaw: String(offered * 10n),
        rates: [
          {
            numeratorRaw: String(expected),
            denominatorRaw: String(offered),
            toleranceBps: 100,
          },
        ],
      },
      evidence: {
        reference: "closing-reference in retained graduation scenario",
        rationale:
          "Test Safe authorizes reserve-derived net output with the larger of curve and pool ordinary costs, one-percent tolerance, finite fifteen-minute budget.",
      },
    });
    f.receipts.push({
      kind: "closing-reference",
      quoteReserve: await curve("quoteReserve"),
      tokenReserve: await curve("tokenReserve"),
      offered,
      expected,
      cost,
    });
    const wallet = createWalletClient({
      chain: anvil,
      account: trader,
      transport: http(f.rpc),
    });
    const donation = await f.client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        to: b.buybackVault,
        value: offered,
      }),
    });
    expect(donation.status).toBe("success");
    f.receipts.push({ kind: "native-donation", receipt: donation });
    await f.write(
      trader,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [zeroAddress],
    );
    const lockedBefore = p.vesting.deposited,
      feesBefore = await curve("quoteFeeBalance"),
      earmarkBefore = await curve("buybackQuoteBalance");
    const escrowBefore = await f.client.readContract({
      address: p.escrow,
      abi: iPonsFeeEscrowAbi,
      functionName: "balanceOf",
      args: [p.creator],
    });
    const openingSupply = await supply();
    await f.write(trader, b.buybackVault, protocolBuybackVaultAbi, "process", [
      zeroAddress,
      1,
      offered,
      revision + 1n,
      now + 900n,
    ]);
    const crossing = await inventory(zeroAddress),
      burnedCross = await inventory(b.protocolToken),
      swept = await launch();
    expect(crossing.totalSpent).toBeGreaterThan(0n);
    expect(crossing.totalSpent).toBeLessThan(offered);
    expect(crossing.available + crossing.totalSpent).toBe(offered);
    expect(openingSupply - (await supply())).toBe(burnedCross.totalBurned);
    expect(swept.phase).toBe(1);
    expect(
      await f.client.readContract({
        address: p.vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "totalLocked",
        args: [b.protocolToken],
      }),
    ).toBe(lockedBefore);
    expect(await curve("quoteFeeBalance")).toBe(0n);
    expect(await curve("buybackQuoteBalance")).toBe(0n);
    const escrowAfter = await f.client.readContract({
      address: p.escrow,
      abi: iPonsFeeEscrowAbi,
      functionName: "balanceOf",
      args: [p.creator],
    });
    expect(escrowAfter - escrowBefore).toBeGreaterThan(earmarkBefore);
    expect(
      (
        await f.client.readContract({
          address: b.buybackVault,
          abi: protocolBuybackVaultAbi,
          functionName: "processingStatus",
          args: [zeroAddress, 1],
        })
      ).status,
    ).toBe(9);
    await f.write(
      trader,
      b.ponsFactory,
      iPonsLaunchFactoryAbi,
      "createGraduatedPool",
      [b.protocolToken],
    );
    const graduated = await launch();
    expect(graduated.phase).toBe(2);
    await f.write(trader, b.buybackVault, protocolBuybackVaultAbi, "process", [
      zeroAddress,
      1,
      1000000000000n,
      revision + 1n,
      now + 900n,
    ]);
    const poolBurnInventory = await inventory(b.protocolToken);
    const afterDonationBurnSupply = await supply();
    expect(poolBurnInventory.totalBurned).toBeGreaterThan(
      burnedCross.totalBurned,
    );
    expect(openingSupply - afterDonationBurnSupply).toBe(
      poolBurnInventory.totalBurned,
    );
    // Complete the pool path with earned membership revenue as well as the
    // closing donation. Actual WETH comes from a native deposit, never a mint.
    const weth = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
    const membershipTier = await f.tier(
      "Graduated WETH membership",
      weth,
      10000,
      1000000000000n,
    );
    await f.write(
      trader,
      weth,
      await compiledAbi("AuthenticAssetFixture.sol/IAuthenticWETH.json"),
      "deposit",
      [],
      12000000000000n,
    );
    await f.write(trader, weth, erc20Abi, "approve", [
      membershipTier,
      12000000000000n,
    ]);
    await f.write(trader, membershipTier, membershipTierAbi, "purchase", [
      12n,
      zeroAddress,
    ]);
    await f.testClient.increaseTime({ seconds: 300 });
    await f.testClient.mine({ blocks: 1 });
    await f.write(
      trader,
      membershipTier,
      membershipTierAbi,
      "accrueProtocolFees",
      [[1n]],
    );
    await f.write(
      trader,
      membershipTier,
      membershipTierAbi,
      "releaseProtocolFees",
    );
    const wethRevision = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [weth],
    });
    const poolNow = (await f.client.getBlock()).timestamp;
    await f.safe("policy", {
      asset: weth,
      expectedRevisionRaw: String(wethRevision),
      policy: {
        validAfterRaw: String(poolNow),
        validUntilRaw: String(poolNow + 900n),
        batchCapRaw: String(offered),
        totalBudgetRaw: String(offered * 10n),
        rates: [
          {
            numeratorRaw: String(expected),
            denominatorRaw: String(offered),
            toleranceBps: 100,
          },
        ],
      },
      evidence: {
        reference: "closing-reference in this scenario",
        rationale:
          "Same conservative reserve reference survives graduation; WETH is unwrapped one-for-one and only earned released membership inventory is authorized.",
      },
    });
    await f.write(trader, b.buybackVault, protocolBuybackVaultAbi, "process", [
      weth,
      0,
      1000000000000n,
      wethRevision + 1n,
      poolNow + 900n,
    ]);
    const poolMembershipInput = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [weth, 0],
    });
    const poolMembershipBurn = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [b.protocolToken, 0],
    });
    expect(poolMembershipInput.totalSpent).toBe(1000000000000n);
    expect(poolMembershipBurn.totalBurned).toBeGreaterThan(0n);
    const afterBurnSupply = await supply();
    expect(afterDonationBurnSupply - afterBurnSupply).toBe(
      poolMembershipBurn.totalBurned,
    );
    const pool = {
      currency0: zeroAddress,
      currency1: b.protocolToken,
      fee: graduated.poolFee,
      tickSpacing: graduated.tickSpacing,
      hooks: p.hook,
    };
    const poolId = keccak256(encodeAbiParameters(poolParameters, [pool]));
    const balanceBefore = await f.client.readContract({
      address: b.protocolToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [trader],
    });
    await poolTrade(f, trader, pool, true, 1000000000000000n);
    const bought =
      (await f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [trader],
      })) - balanceBefore;
    await poolTrade(f, trader, pool, false, bought / 2n);
    const compensation = async () => {
      const result = await readPonsCompensation(f.client, {
        chainId: 31337,
        protocolToken: b.protocolToken,
      });
      if (result.status !== "valid")
        throw new Error("Pons compensation unavailable");
      return result.data;
    };
    const sweep = async () => {
      const before = await compensation();
      await f.testClient.setBalance({
        address: p.sweepOperator,
        value: 10n ** 18n,
      });
      await f.testClient.impersonateAccount({ address: p.sweepOperator });
      try {
        await f.write(
          p.sweepOperator,
          p.hook,
          iPonsMemeHookAbi,
          "sweepPoolFees",
          [poolId, 1n, 1n],
        );
      } finally {
        await f.testClient.stopImpersonatingAccount({
          address: p.sweepOperator,
        });
      }
      const after = await compensation();
      expect(after.vesting.deposited).toBeGreaterThan(before.vesting.deposited);
      for (const currency of after.poolPending) {
        expect(currency.tradingFees).toBe(0n);
        expect(currency.buybackEarmark).toBe(0n);
      }
      f.receipts.push({
        kind: "simulated-external-operator-pool-sweep",
        operator: p.sweepOperator,
        before,
        after,
      });
      return after;
    };
    const firstDeposit = await sweep();
    await f.testClient.increaseTime({
      seconds: Number(p.vesting.duration / 2n),
    });
    await f.testClient.mine({ blocks: 1 });
    await f.write(developer, p.vault, iPonsBuybackVaultAbi, "release", [
      b.protocolToken,
    ]);
    const partial = await compensation();
    expect(partial.vesting.released).toBeGreaterThan(lockedBefore);
    await poolTrade(f, trader, pool, true, 1000000000000000n);
    const secondDeposit = await sweep();
    expect(secondDeposit.vesting.vested).toBeGreaterThanOrEqual(
      partial.vesting.vested,
    );
    await f.testClient.increaseTime({ seconds: Number(p.vesting.duration) });
    await f.testClient.mine({ blocks: 1 });
    const other = p.vesting.protocol;
    await f.testClient.setBalance({ address: other, value: 10n ** 18n });
    await f.testClient.impersonateAccount({ address: other });
    try {
      await f.write(other, p.vault, iPonsBuybackVaultAbi, "release", [
        b.protocolToken,
      ]);
    } finally {
      await f.testClient.stopImpersonatingAccount({ address: other });
    }
    for (const beneficiary of [developer, other]) {
      const address =
        typeof beneficiary === "string" ? beneficiary : beneficiary.address;
      const owed = await f.client.readContract({
        address: p.escrow,
        abi: iPonsFeeEscrowAbi,
        functionName: "balanceOfToken",
        args: [address, b.protocolToken],
      });
      const balance = await f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (typeof beneficiary === "string")
        await f.testClient.impersonateAccount({ address });
      try {
        await f.write(beneficiary, p.escrow, iPonsFeeEscrowAbi, "claimToken", [
          b.protocolToken,
        ]);
      } finally {
        if (typeof beneficiary === "string")
          await f.testClient.stopImpersonatingAccount({ address });
      }
      expect(
        (await f.client.readContract({
          address: b.protocolToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) - balance,
      ).toBe(owed);
    }
    const final = await compensation();
    expect(final.vesting.released).toBe(final.vesting.deposited);
    expect(final.vesting.unvested).toBe(0n);
    expect(await supply()).toBe(afterBurnSupply);
    await f.retain("graduation-pool-compensation", {
      openingSupply,
      afterBurnSupply,
      offered,
      crossing,
      burnedCross,
      poolBurnInventory,
      membershipTier,
      poolMembershipInput,
      poolMembershipBurn,
      swept,
      graduated,
      pool,
      poolId,
      feesBefore,
      earmarkBefore,
      escrowBefore,
      escrowAfter,
      firstDeposit,
      partial,
      secondDeposit,
      final,
      simulatedParticipants: [p.sweepOperator, other],
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
