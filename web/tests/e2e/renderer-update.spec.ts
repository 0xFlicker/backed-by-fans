import { expect, test } from "@playwright/test";
import { erc20Abi, zeroAddress, type Address, type PublicClient } from "viem";

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

async function nonPresentationState(client: PublicClient, tier: Address) {
  return Promise.all(
    [
      "paymentToken",
      "pricePerPeriod",
      "periodDuration",
      "rewardBps",
      "referralBps",
      "supplyCap",
      "maxPrepaidPeriods",
      "occupiedSupply",
      "totalMinted",
      "creatorProceeds",
      "rewardReserve",
      "totalReferralLiability",
      "artConfig",
      "mediaConfig",
    ].map((functionName) =>
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: functionName as never,
      }),
    ),
  );
}

test("@anvil lets the accepted owner preview and replace presentation without changing membership economics", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(testInfo.project.name !== "desktop", "One mutation is sufficient.");
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const expiredMember = requiredAnvilAddress("giftRecipient");
  const newOwner = requiredAnvilAddress("newOwner");
  const tier = requiredAnvilAddress("tier");
  const paymentToken = requiredAnvilAddress("paymentToken");
  const replacementRenderer = requiredAnvilAddress("replacementRenderer");
  const client = anvilPublicClient();

  try {
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [tier, 30_000_000n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [1n, zeroAddress],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: tier,
        abi: membershipTierAbi,
        functionName: "grantTime",
        args: [expiredMember, 1n],
      }),
    );
    await rpcRequest("evm_increaseTime", [2_592_001]);
    await rpcRequest("evm_mine");
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [1n, zeroAddress],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: tier,
        abi: membershipTierAbi,
        functionName: "transferOwnership",
        args: [newOwner],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: newOwner,
        address: tier,
        abi: membershipTierAbi,
        functionName: "acceptOwnership",
      }),
    );

    const activeToken = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [member],
    });
    const expiredToken = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [expiredMember],
    });
    const before = await nonPresentationState(client, tier);

    await installAnvilWallet(page, newOwner);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, newOwner);
    await expect(page.getByText("This wallet operates the tier")).toBeVisible();
    await expect(
      page.getByText(/existing and future membership/i),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open Art Studio" }).click();
    await expect(
      page.getByRole("heading", { name: "Update your membership artwork" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Representative membership tokens"),
    ).toBeVisible();
    await page.getByRole("radio", { name: /Custom/i }).click();
    await page
      .getByRole("textbox", { name: "Renderer contract address" })
      .fill(replacementRenderer);
    await expect(
      page.getByRole("img", { name: /membership artwork, token 7/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Update artwork" }).click();
    await expectReconciled(page, "Update artwork renderer");

    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "renderer",
      }),
    ).resolves.toBe(replacementRenderer);
    expect(await nonPresentationState(client, tier)).toEqual(before);
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenURI",
        args: [activeToken],
      }),
    ).resolves.toMatch(/^data:application\/json;base64,/);
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenURI",
        args: [expiredToken],
      }),
    ).resolves.toMatch(/^data:application\/json;base64,/);
  } finally {
    await revertAnvil(snapshot);
  }
});
