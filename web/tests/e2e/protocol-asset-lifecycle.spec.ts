import { expect, test } from "@playwright/test";
import { erc20Abi } from "viem";
import { membershipTierAbi } from "../../src/contracts";
import { forkContext } from "./helpers/protocol-fork";
import { compiledAbi } from "./helpers/pons-pool";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
  installAnvilWallet,
  connectAnvilWallet,
  expectReconciled,
} from "./helpers/anvil";

for (const kind of ["WETH", "protocol-token"] as const)
  test(`@protocol-fork ${kind} membership and artwork appear in the supporter's account`, async ({
    page,
  }, info) => {
    test.skip(
      process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
        info.project.name !== "desktop",
      "One authentic asset lifecycle per token",
    );
    test.setTimeout(120000);
    const snapshot = await snapshotAnvil();
    try {
      const f = await forkContext(),
        member = requiredAnvilAddress("member");
      const asset =
        kind === "WETH"
          ? "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
          : f.bootstrap.protocolToken;
      const price = 1000000000000n,
        name = `${kind} Backstage`;
      const tier = await f.tier(name, asset, 10000, price);
      if (kind === "WETH")
        await f.write(
          member,
          asset,
          await compiledAbi("AuthenticAssetFixture.sol/IAuthenticWETH.json"),
          "deposit",
          [],
          price * 12n,
        );
      else await f.giveProtocolTokens(member, price * 12n);
      const balanceBefore = await f.client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      await installAnvilWallet(page, member);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);
      await page.getByLabel("Periods", { exact: true }).fill("12");
      await page.getByRole("button", { name: "Join this membership" }).click();
      await expectReconciled(page, "Join this membership");
      const tokenId = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [member],
      });
      expect(tokenId).toBe(1n);
      expect(
        balanceBefore -
          (await f.client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [member],
          })),
      ).toBe(price * 12n);
      const uri = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenURI",
        args: [tokenId],
      });
      expect(uri).toMatch(/^data:application\/json/);
      await page.goto("/account");
      await connectAnvilWallet(page, member);
      const card = page
        .locator(".account-membership-card")
        .filter({ hasText: name });
      await expect(card).toContainText("Membership active");
      await expect(
        card.getByRole("link", { name: `View ${name}` }),
      ).toBeVisible();
      await expect
        .poll(() =>
          card
            .locator("img")
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        )
        .toBe(true);
      const state = await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeState",
        args: [tokenId],
      });
      await f.retain(`asset-lifecycle-${kind}`, {
        asset,
        tier,
        tokenId,
        price,
        gross: price * 12n,
        balanceBefore,
        state,
        tokenURI: uri,
      });
    } finally {
      await revertAnvil(snapshot);
    }
  });
