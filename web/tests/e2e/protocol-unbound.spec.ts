import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPublicClient,
  createTestClient,
  http,
  zeroAddress,
  type Address,
} from "viem";
import { anvil } from "viem/chains";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "../../src/contracts";
import {
  installAnvilWallet,
  connectAnvilWallet,
  requiredAnvilRpc,
} from "./helpers/anvil";

test("@protocol-unbound memberships and fee collection work before token launch", async ({
  page,
}, info) => {
  test.skip(
    !process.env.BBF_UNBOUND_TEST_EVIDENCE || info.project.name !== "desktop",
    "Explicit no-token seeded deployment required",
  );
  test.setTimeout(180000);
  const directory = process.env.BBF_UNBOUND_TEST_EVIDENCE!;
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
  const snapshot = await local.snapshot();
  try {
    expect(
      await client.readContract({
        address: boot.factory,
        abi: membershipFactoryAbi,
        functionName: "protocolToken",
      }),
    ).toBe(zeroAddress);
    expect(
      await client.readContract({
        address: boot.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "executor",
      }),
    ).toBe(zeroAddress);
    for (const tier of demo.tiers) {
      expect(
        await client.readContract({
          address: tier.address,
          abi: membershipTierAbi,
          functionName: "ownerOf",
          args: [BigInt(tier.tokenId)],
        }),
      ).toBe(demo.owner);
      const fees = await client.readContract({
        address: tier.address,
        abi: membershipTierAbi,
        functionName: "allocationState",
        args: [BigInt(tier.tokenId)],
      });
      expect(fees.status.complete).toBe(false);
      expect(fees.unearnedScaled[3] / (1n << 128n)).toBeGreaterThan(0n);
    }
    await installAnvilWallet(page, caller);
    await page.goto("/chains/31337/protocol");
    await connectAnvilWallet(page, caller);
    await expect(
      page
        .getByText("Protocol token has not been deployed", { exact: false })
        .first(),
    ).toBeVisible();
    const collect = page.getByRole("button", {
      name: "Advance and burn",
      exact: true,
    });
    await expect(collect).toBeEnabled();
    await collect.click();
    await expect(page.locator(".protocol-burn [role=status]")).toContainText(
      "Earned fees released",
      { timeout: 60000 },
    );
    expect(
      await client.readContract({
        address: boot.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "settlementSequence",
      }),
    ).toBe(0n);
    for (const tier of demo.tiers) {
      expect(
        await client
          .readContract({
            address: boot.buybackVault,
            abi: protocolBuybackVaultAbi,
            functionName: "inventory",
            args: [tier.paymentToken, 0],
          })
          .then((inventory) => inventory.totalReceived),
      ).toBeGreaterThan(0n);
      const fees = await client.readContract({
        address: tier.address,
        abi: membershipTierAbi,
        functionName: "allocationState",
        args: [BigInt(tier.tokenId)],
      });
      expect(fees.unearnedScaled[3] / (1n << 128n)).toBeGreaterThan(0n);
    }
    await page.screenshot({
      path: resolve(directory, "unbound-collected.png"),
      fullPage: true,
    });
    const hash = await page.locator(".protocol-burn code").textContent();
    await writeFile(
      resolve(directory, "unbound-browser.json"),
      JSON.stringify(
        {
          status: "passed",
          factory: boot.factory,
          token: zeroAddress,
          executor: zeroAddress,
          collectionTransaction: hash,
          purchases: 0,
          tiers: demo.tiers.map((x: { address: string }) => x.address),
        },
        null,
        2,
      ),
    );
    const membershipPage = await page.context().newPage();
    await membershipPage.goto(`/chains/31337/tiers/${demo.tiers[0].address}`);
    await expect(
      membershipPage.getByText("Unverified contract", { exact: false }),
    ).toHaveCount(0);
    await expect(
      membershipPage.getByRole("heading", { name: /WETH Fans/ }).first(),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await local.revert({ id: snapshot });
  }
});
