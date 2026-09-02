import { expect, test } from "@playwright/test";
import { erc20Abi } from "viem";

import { membershipTierAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  rpcRequest,
  sendContract,
  snapshotAnvil,
} from "./helpers/anvil";

test("@anvil recognizes a newly funded wallet and completes its first purchase", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One fresh-wallet mutation is sufficient.",
  );
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const freshWallet = requiredAnvilAddress("freshWallet");
  const paymentToken = requiredAnvilAddress("paymentToken");
  const tier = requiredAnvilAddress("tier");
  const client = anvilPublicClient();

  try {
    await rpcRequest("anvil_setBalance", [freshWallet, "0x0"]);
    await installAnvilWallet(page, freshWallet);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, freshWallet);

    await expect(
      page.getByText(/add 10 USDG to this wallet to continue/i),
    ).toBeVisible();
    await expect(
      page.getByText(/add a small amount of ETH .* for gas/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join this membership" }),
    ).toBeDisabled();

    // Local Anvil models returning from Robinhood's external faucet. The
    // component suite separately pins the public official-faucet URL on 46630.
    await rpcRequest("anvil_setBalance", [freshWallet, "0xde0b6b3a7640000"]);
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: paymentToken,
        abi: [
          {
            type: "function",
            name: "mint",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
          },
        ],
        functionName: "mint",
        args: [freshWallet, 20_000_000n],
      }),
    );
    await page.reload();
    await connectAnvilWallet(page, freshWallet);
    await expect(page.getByText(/add 10 USDG to this wallet/i)).toHaveCount(0);
    await expect(page.getByText(/add a small amount of ETH/i)).toHaveCount(0);

    const join = page.getByRole("button", { name: "Join this membership" });
    await expect(join).toBeEnabled();
    await join.click();
    await expectReconciled(page, "Join this membership");
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "isActive",
        args: [freshWallet],
      }),
    ).resolves.toBe(true);
    await expect(
      client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [freshWallet, tier],
      }),
    ).resolves.toBe(0n);
  } finally {
    await revertAnvil(snapshot);
  }
});
