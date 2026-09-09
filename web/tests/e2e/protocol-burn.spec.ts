import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hash,
} from "viem";
import { anvil } from "viem/chains";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBurnRouterAbi,
  protocolBuybackVaultAbi,
} from "../../src/contracts";
import {
  installAnvilWallet,
  connectAnvilWallet,
  requiredAnvilRpc,
} from "./helpers/anvil";

test("@protocol-burn one click collects fees and burns with one ordinary wallet transaction", async ({
  page,
}, info) => {
  test.skip(
    !process.env.BBF_BURN_TEST_EVIDENCE || info.project.name !== "desktop",
    "Explicit local seeded demo required",
  );
  test.setTimeout(180000);
  const directory = process.env.BBF_BURN_TEST_EVIDENCE!;
  const boot = JSON.parse(
    await readFile(resolve(directory, "bootstrap.json"), "utf8"),
  );
  const fixture = JSON.parse(
    await readFile(resolve(directory, "fixture.json"), "utf8"),
  );
  const demo = JSON.parse(
    await readFile(resolve(directory, "buyback-demo.json"), "utf8"),
  );
  const caller = fixture.accounts[0] as Address;
  const transport = http(requiredAnvilRpc(), { retryCount: 0, timeout: 15000 });
  const client = createPublicClient({ chain: anvil, transport, cacheTime: 0 });
  expect(await client.getChainId()).toBe(31337);
  const local = createTestClient({ chain: anvil, transport, mode: "anvil" });
  // Test isolation on the existing local chain, never a nested fork.
  const snapshot = await local.snapshot();
  try {
    const router = await client.readContract({
      address: boot.factory,
      abi: membershipFactoryAbi,
      functionName: "burnRouter",
    });
    const supply = () =>
      client.readContract({
        address: boot.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    const beforeSupply = await supply();
    const beforeNonce = await client.getTransactionCount({ address: caller });
    await installAnvilWallet(page, caller);
    await page.goto("/chains/31337/protocol");
    await connectAnvilWallet(page, caller);
    const burn = page.getByRole("button", { name: "Burn", exact: true });
    await expect(burn).toBeEnabled();
    await burn.click();
    await expect(page.locator(".protocol-burn [role=status]")).toContainText(
      "burned.",
      { timeout: 60000 },
    );
    const hash = (await page
      .locator(".protocol-burn code")
      .textContent()) as Hash;
    const receipt = await client.getTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect(await client.getTransactionCount({ address: caller })).toBe(
      beforeNonce + 1,
    );
    expect((await client.getTransaction({ hash })).to?.toLowerCase()).toBe(
      router.toLowerCase(),
    );
    const completed = parseEventLogs({
      abi: protocolBurnRouterAbi,
      logs: receipt.logs,
    }).find((e) => e.eventName === "BurnCompleted");
    expect(completed?.eventName).toBe("BurnCompleted");
    if (!completed || completed.eventName !== "BurnCompleted")
      throw new Error("Missing batch receipt");
    expect(completed.args.releasedTiers).toBe(3n);
    expect(completed.args.purchases).toBeGreaterThanOrEqual(3n);
    expect(beforeSupply - (await supply())).toBe(completed.args.burned);
    for (const tier of demo.tiers) {
      const state = await client.readContract({
        address: tier.address,
        abi: membershipTierAbi,
        functionName: "protocolFeeState",
        args: [1n],
      });
      expect(state.unearned).toBeGreaterThan(0n);
      expect(
        await client.readContract({
          address: tier.address,
          abi: membershipTierAbi,
          functionName: "totalProtocolFeeReleased",
        }),
      ).toBeGreaterThan(0n);
    }
    await page
      .locator(".protocol-heading")
      .screenshot({ path: info.outputPath("burn-complete.png") });

    // Make the next purchase ineligible; collection may still progress.
    await local.setBalance({ address: boot.safe, value: 10n ** 18n });
    await local.impersonateAccount({ address: boot.safe });
    try {
      const wallet = createWalletClient({
        chain: anvil,
        transport,
        account: boot.safe as Address,
      });
      const request = await client.simulateContract({
        address: boot.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "setGlobalMinInterval",
        args: [86400n],
        account: boot.safe,
      });
      const tx = await wallet.writeContract(request.request);
      expect(
        (await client.waitForTransactionReceipt({ hash: tx })).status,
      ).toBe("success");
    } finally {
      await local.stopImpersonatingAccount({ address: boot.safe });
    }
    const afterBurn = await supply();
    await burn.click();
    await expect(page.locator(".protocol-burn [role=status]")).toContainText(
      "Earned fees collected",
      { timeout: 60000 },
    );
    expect(await supply()).toBe(afterBurn);
    // Once eligible again, donation inventory gets the next shared-cooldown turn.
    const callerWallet = createWalletClient({
      chain: anvil,
      transport,
      account: caller,
    });
    const donation = await callerWallet.sendTransaction({
      to: boot.buybackVault,
      value: 10n ** 15n,
    });
    await client.waitForTransactionReceipt({ hash: donation });
    const sync = await client.simulateContract({
      address: boot.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "syncDonation",
      args: ["0x0000000000000000000000000000000000000000"],
      account: caller,
    });
    await client.waitForTransactionReceipt({
      hash: await callerWallet.writeContract(sync.request),
    });
    await local.setNextBlockTimestamp({
      timestamp: (await client.getBlock()).timestamp + 86400n,
    });
    await local.mine({ blocks: 1 });
    await burn.click();
    await expect(page.locator(".protocol-burn [role=status]")).toContainText(
      "burned.",
      { timeout: 60000 },
    );
    const donationHash = (await page
      .locator(".protocol-burn code")
      .textContent()) as Hash;
    const donationReceipt = await client.getTransactionReceipt({
      hash: donationHash,
    });
    const donationBurns = parseEventLogs({
      abi: protocolBuybackVaultAbi,
      logs: donationReceipt.logs,
    }).filter((e) => e.eventName === "BuybackBurned");
    expect(donationBurns).toHaveLength(1);
    expect(donationBurns[0].args.bucket).toBe(1);
    await writeFile(
      info.outputPath("burn-receipt.json"),
      JSON.stringify(
        {
          hash,
          completed: completed.args,
          gasUsed: receipt.gasUsed,
          cooldownRespected: true,
          donationFairness: true,
          donationHash,
        },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
    );
  } finally {
    await local.revert({ id: snapshot });
  }
});
