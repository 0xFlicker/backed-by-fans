import { expect, test } from "@playwright/test";
import {
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { protocolBuybackVaultAbi } from "../../src/contracts";
import {
  readMarketState,
  quoteMarket,
} from "../../src/lib/buyback-policy/live";
import { forkContext, testKey } from "./helpers/protocol-fork";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
} from "./helpers/anvil";

test("@protocol-fork trusted operator executes offchain terms then Safe enables indefinite public policy", async ({}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "Authentic initial operator deployment required",
  );
  test.setTimeout(180000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap;
    const member = requiredAnvilAddress("member");
    const operator = privateKeyToAccount(testKey(49153));
    const readPolicy = () =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "permissionlessPolicy",
        args: [zeroAddress],
      });
    expect(
      await f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "executionMode",
      }),
    ).toBe(0);
    const originalPolicy = await readPolicy();
    expect(originalPolicy.rates).toHaveLength(0);
    await f.safe("operator", { operator: operator.address });
    await f.safe("pause", { paused: false });
    const offered = parseEther("0.00001");
    const wallet = createWalletClient({
      chain: anvil,
      account: member,
      transport: http(f.rpc),
    });
    const donation = await f.client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        to: b.buybackVault,
        value: offered * 2n,
        gasPrice: 100_000_000n,
      }),
    });
    expect(donation.status).toBe("success");
    f.receipts.push({ kind: "native-donation", receipt: donation });
    await f.write(
      member,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [zeroAddress],
    );
    const state = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "processingStatus",
      args: [zeroAddress, 1],
    });
    expect(state.status).toBe(10);
    const market = await readMarketState(f.client, {
      vault: b.buybackVault,
      asset: zeroAddress,
      protocolToken: b.protocolToken,
      blockNumber: await f.client.getBlockNumber(),
      route: [],
    });
    const quote = await quoteMarket(f.client, market, offered);
    // Explicit disposable fixture tolerance: only transaction calldata carries operator bounds.
    const minimumOutputs = quote.map((leg) => (leg.outputRaw * 8000n) / 10000n);
    expect(minimumOutputs.every((value) => value > 0n)).toBe(true);
    const terms = [
      zeroAddress,
      1,
      offered,
      { pools: [] },
      minimumOutputs,
      (await f.client.getBlock()).timestamp + 300n,
    ] as const;
    await expect(
      f.write(
        member,
        b.buybackVault,
        protocolBuybackVaultAbi,
        "processOperator",
        terms,
      ),
    ).rejects.toThrow();
    const supply = () =>
      f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    const before = await supply();
    await f.write(
      operator,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "processOperator",
      terms,
    );
    const afterOperator = await supply();
    expect(afterOperator).toBeLessThan(before);
    expect(await readPolicy()).toEqual(originalPolicy);
    await f.configurePublicBuybacks(zeroAddress, offered);
    const publicPolicy = await readPolicy();
    expect(publicPolicy.expiresAt).toBe(0n);
    expect(publicPolicy.budgetLimited).toBe(false);
    const ready = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "processingStatus",
      args: [zeroAddress, 1],
    });
    if (ready.status === 6) {
      await f.testClient.setNextBlockTimestamp({
        timestamp: ready.nextEligibleAt,
      });
      await f.testClient.mine({ blocks: 1 });
    }
    expect(
      (
        await f.client.readContract({
          address: b.buybackVault,
          abi: protocolBuybackVaultAbi,
          functionName: "processingStatus",
          args: [zeroAddress, 1],
        })
      ).status,
    ).toBe(0);
    await f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
      zeroAddress,
      1,
      offered,
      ready.revision,
      (await f.client.getBlock()).timestamp + 300n,
    ]);
    expect(await supply()).toBeLessThan(afterOperator);
    await f.retain("operator-to-permissionless", {
      originalPolicy,
      publicPolicy,
      before,
      afterOperator,
      afterPublic: await supply(),
      quote,
      minimumOutputs,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
