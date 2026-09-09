import { expect, test } from "@playwright/test";
import {
  erc20Abi,
  zeroAddress,
  keccak256,
  toBytes,
  parseEventLogs,
} from "viem";
import {
  iPonsLaunchFactoryAbi,
  iPonsBondingCurveAbi,
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
} from "./helpers/anvil";

test("@protocol-fork a compatible authentic token without an approved route remains pending independently", async ({
  page,
}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "One unrouted authentic asset scenario",
  );
  test.setTimeout(120000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap,
      creator = requiredAnvilAddress("creator"),
      member = requiredAnvilAddress("member");
    const fee = await f.client.readContract({
      address: b.ponsFactory,
      abi: iPonsLaunchFactoryAbi,
      functionName: "launchFee",
    });
    const economics = await f.client.readContract({
      address: b.ponsFactory,
      abi: iPonsLaunchFactoryAbi,
      functionName: "previewLaunchEconomics",
      args: [0n, zeroAddress],
    });
    const launch = await f.write(
      creator,
      b.ponsFactory,
      iPonsLaunchFactoryAbi,
      "launchToken",
      [
        {
          name: "Unrouted fork asset",
          symbol: "UNROUTED",
          logo: "",
          description:
            "Separate authentic test asset; no approved BBF conversion route",
          socials: {
            twitter: "",
            telegram: "",
            discord: "",
            website: "",
            farcaster: "",
          },
          creatorFeeRecipient: creator,
          creatorTaxBps: 0,
          buybackEnabled: true,
          expectedEconomics: economics,
          salt: keccak256(toBytes(`${b.runId}:unrouted-asset`)),
        },
        0n,
        zeroAddress,
      ],
      fee,
    );
    const event = parseEventLogs({
      abi: iPonsLaunchFactoryAbi,
      eventName: "TokenLaunched",
      logs: launch.logs,
    })[0];
    expect(event).toBeDefined();
    const asset = event.args.token,
      curve = event.args.curve;
    // The launch deployer is exempt from its own initial anti-snipe window.
    const purchase = await f.write(
      creator,
      curve,
      iPonsBondingCurveAbi,
      "buy",
      [1000000000000000n, 1n, creator],
      1000000000000000n,
    );
    const [symbol, decimals, acquiredAmount] = await Promise.all([
      f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [creator],
      }),
    ]);
    const context = await readAdminContext(f.client, 31337, b.factory),
      payload = await preparePaymentTokenPayload(
        f.client,
        context,
        asset,
        true,
      );
    const safe = await executeForkSafePayload({
      rpcUrl: f.rpc,
      factory: b.factory,
      payload,
      signerKeys: f.signerKeys,
      relayerKey: testKey(49153),
    });
    f.receipts.push({ payload, ...safe });
    const price = 1000000000000000000n,
      gross = price * 12n,
      tier = await f.tier("Unrouted membership", asset, 10000, price);
    await f.write(creator, asset, erc20Abi, "transfer", [member, gross]);
    await f.write(member, asset, erc20Abi, "approve", [tier, gross]);
    await f.write(member, tier, membershipTierAbi, "purchase", [
      12n,
      zeroAddress,
    ]);
    await f.testClient.increaseTime({ seconds: 300 });
    await f.testClient.mine({ blocks: 1 });
    await f.write(member, tier, membershipTierAbi, "accrueProtocolFees", [
      [1n],
    ]);
    await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
    const pending = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "processingStatus",
      args: [asset, 0],
    });
    expect(pending.status).toBe(3);
    expect(pending.available).toBeGreaterThan(0n);
    await expect(
      f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
        asset,
        0,
        pending.available,
        0n,
        (await f.client.getBlock()).timestamp + 300n,
      ]),
    ).rejects.toThrow();
    await f.giveProtocolTokens(b.buybackVault, 123n);
    await f.write(
      member,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [b.protocolToken],
    );
    const supplyBefore = await f.client.readContract({
      address: b.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    await f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
      b.protocolToken,
      1,
      123n,
      0n,
      (await f.client.getBlock()).timestamp + 300n,
    ]);
    const supplyAfter = await f.client.readContract({
      address: b.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    expect(supplyBefore - supplyAfter).toBe(123n);
    const final = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [asset, 0],
    });
    expect(final.available).toBe(pending.available);
    expect(final.totalSpent).toBe(0n);
    await page.goto("/chains/31337/protocol");
    await expect(page.getByRole("heading", { name: "UNROUTED" })).toBeVisible();
    await f.retain("unrouted-authentic-asset", {
      asset,
      curve,
      tier,
      gross,
      symbol,
      decimals,
      acquiredAmount,
      launchReceipt: launch.transactionHash,
      purchaseReceipt: purchase.transactionHash,
      pending,
      final,
      supplyBefore,
      supplyAfter,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
