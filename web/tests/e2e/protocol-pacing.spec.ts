import { expect, test } from "@playwright/test";
import { createWalletClient, erc20Abi, http, zeroAddress } from "viem";
import { anvil } from "viem/chains";
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

test("@protocol-fork ETH and WETH share standing limits and cooldown across fee buckets", async ({}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "Authentic fork required",
  );
  test.setTimeout(180000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap;
    const member = requiredAnvilAddress("member");
    const weth = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
    const batch = 1_000_000_000_000_000n,
      minimum = batch / 10n;
    const tier = await f.tier("Standing ETH pacing", weth, 10000, batch);
    await f.write(
      member,
      weth,
      await compiledAbi("AuthenticAssetFixture.sol/IAuthenticWETH.json"),
      "deposit",
      [],
      batch * 12n,
    );
    await f.write(member, weth, erc20Abi, "approve", [tier, batch * 12n]);
    await f.write(member, tier, membershipTierAbi, "createMembership", [
      12n,
      zeroAddress,
      256n,
    ]);
    await f.testClient.increaseTime({ seconds: 300 });
    await f.testClient.mine({ blocks: 1 });
    await f.write(member, tier, membershipTierAbi, "processAccounting", [25n]);
    await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
    const wallet = createWalletClient({
      chain: anvil,
      account: member,
      transport: http(f.rpc),
    });
    const receipt = await f.client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        to: b.buybackVault,
        value: batch * 2n,
        gasPrice: 2_000_000_000n,
      }),
    });
    expect(receipt.status).toBe("success");
    f.receipts.push({ kind: "native-donation", receipt });
    await f.write(
      member,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [zeroAddress],
    );
    const usdg = requiredAnvilAddress("paymentToken");
    await f.write(member, usdg, erc20Abi, "transfer", [
      b.buybackVault,
      1_000_000n,
    ]);
    await f.write(
      member,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [usdg],
    );
    await f.configurePublicBuybacks(usdg, 1_000_000n);
    await f.configurePublicBuybacks(weth, batch, minimum, 600n);
    await f.safe("interval", { minInterval: "300" });
    const state = (asset: `0x${string}`, bucket: 0 | 1) =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "processingStatus",
        args: [asset, bucket],
      });
    const inventory = (asset: `0x${string}`, bucket: 0 | 1) =>
      f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, bucket],
      });
    expect(await inventory(weth, 0)).toEqual(await inventory(zeroAddress, 0));
    const ready = await state(zeroAddress, 1);
    expect(ready.status).toBe(0);
    expect(ready.maxInput).toBe(batch);
    const deadline = (await f.client.getBlock()).timestamp + 2000n;
    await expect(
      f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
        zeroAddress,
        1,
        minimum - 1n,
        ready.revision,
        deadline,
      ]),
    ).rejects.toThrow();
    await f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
      zeroAddress,
      1,
      batch,
      ready.revision,
      deadline,
    ]);
    const boughtAt = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "lastBuyAt",
    });
    const cooling = await state(weth, 0);
    expect(cooling.status).toBe(6);
    expect(cooling.nextEligibleAt).toBe(boughtAt + 600n);
    const otherCurrency = await state(usdg, 1);
    expect(otherCurrency.status).toBe(6);
    expect(otherCurrency.nextEligibleAt).toBe(boughtAt + 300n);
    await expect(
      f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
        weth,
        0,
        batch,
        cooling.revision,
        deadline,
      ]),
    ).rejects.toThrow();
    // Changing settings cannot clear the last-purchase clock.
    await f.configurePublicBuybacks(zeroAddress, batch, minimum, 900n);
    const updated = await state(weth, 0);
    expect(updated.status).toBe(6);
    expect(updated.nextEligibleAt).toBe(boughtAt + 900n);
    expect(
      await f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "lastBuyAt",
      }),
    ).toBe(boughtAt);
    await f.testClient.setNextBlockTimestamp({
      timestamp: updated.nextEligibleAt,
    });
    await f.testClient.mine({ blocks: 1 });
    const eligible = await state(weth, 0);
    expect(eligible.status).toBe(0);
    await f.write(member, b.buybackVault, protocolBuybackVaultAbi, "process", [
      weth,
      0,
      batch,
      eligible.revision,
      deadline,
    ]);
    expect((await inventory(weth, 0)).totalSpent).toBe(batch);
    expect((await inventory(zeroAddress, 1)).totalSpent).toBe(batch);
    expect((await state(zeroAddress, 1)).status).toBe(6);
    await f.retain("standing-eth-pacing", {
      tier,
      ready,
      boughtAt,
      cooling,
      updated,
      eligible,
      membership: await inventory(weth, 0),
      donation: await inventory(zeroAddress, 1),
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
