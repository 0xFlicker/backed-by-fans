import { expect, test } from "@playwright/test";

import { tierAbi, tokenAbi } from "../../src/contracts/abis";
import {
  anvilEnabled,
  anvilEnvironment,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  installAnvilWallet,
  loseNextSendResponse,
  requiredAnvilAddress,
  revertAnvil,
  sendContract,
  snapshotAnvil,
} from "./helpers/anvil";

test.describe("configured Anvil RPC and transaction recovery", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("@anvil treats RPC loss as unavailable rather than empty state", async ({
    page,
  }) => {
    const tier = requiredAnvilAddress("tier");
    await page.route(`${anvilEnvironment.rpcUrl}/`, (route) =>
      route.abort("connectionfailed"),
    );
    await page.goto(`/tiers/${tier}`);

    await expect(page.getByText("Onchain state unavailable")).toBeVisible();
    await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
    await expect(
      page.getByText("Complete and reconciled onchain."),
    ).toHaveCount(0);
  });

  test("@anvil recovers a broadcast whose wallet response is lost without resubmitting", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const usdg = requiredAnvilAddress("usdg");
    const client = anvilPublicClient();

    try {
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: usdg,
          abi: tokenAbi,
          functionName: "approve",
          args: [tier, 10_000_000n],
        }),
      );
      await installAnvilWallet(page, member);
      await page.goto(`/tiers/${tier}`);
      await connectAnvilWallet(page, member);
      await page.getByRole("radio", { name: "Explicitly no referrer" }).check();

      await loseNextSendResponse(page);
      const join = page.getByRole("button", { name: "Join this membership" });
      await expect(join).toBeEnabled();
      await join.click();
      await expectReconciled(page, "Join this membership");
      await expect(
        page.getByText(/do not submit the action again/i),
      ).toHaveCount(0);

      const tokenId = await client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "tokenOf",
        args: [member],
      });
      expect(tokenId).toBe(1n);
      await expect(
        client.readContract({
          address: tier,
          abi: tierAbi,
          functionName: "isActive",
          args: [member],
        }),
      ).resolves.toBe(true);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});
