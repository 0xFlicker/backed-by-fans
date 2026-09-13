import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getAddress, zeroAddress } from "viem";
import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import { mintedPosition } from "./helpers/membership-positions";
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

for (const operation of ["renewal", "refund", "maintenance"] as const) {
  test(`@anvil resumes ${operation} through bounded permissionless expiration maintenance`, async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
    test.skip(
      info.project.name !== "desktop",
      "One stateful recovery per operation.",
    );
    const snapshot = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const token = requiredAnvilAddress("paymentToken");
    const client = anvilPublicClient();
    try {
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName: "setSupplyCap",
          args: [0n],
        }),
      );
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName: "setMaxPrepaidPeriods",
          args: [0n],
        }),
      );
      const price = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "pricePerPeriod",
      });
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: token,
          abi: usdgAbi,
          functionName: "approve",
          args: [tier, price * 13n],
        }),
      );
      const payment = await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "createMembership",
        args: [12n, zeroAddress, 25n],
      });
      expectSuccessfulReceipt(payment);
      const id = mintedPosition(payment, tier, member);
      let lastGrant = 0n;
      for (let i = 0; i < 101; i++) {
        const recipient = getAddress(
          `0x${(0x10000 + i).toString(16).padStart(40, "0")}`,
        );
        const grant = await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName: "grantMembership",
          args: [recipient, 1n, 25n],
        });
        expectSuccessfulReceipt(grant);
        lastGrant = mintedPosition(grant, tier, recipient);
      }
      const end = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [lastGrant],
      });
      await rpcRequest("evm_setNextBlockTimestamp", [Number(end)]);
      await rpcRequest("evm_mine");
      expect(
        (
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "accountingStatus",
          })
        ).complete,
      ).toBe(false);
      if (operation !== "renewal")
        expectSuccessfulReceipt(
          await sendContract({
            account: creator,
            address: tier,
            abi: membershipTierAbi,
            functionName: "setPaused",
            args: [true],
          }),
        );
      // The supporter can maintain even when the tier is paused.
      const wallet = operation === "refund" ? creator : member;
      await installAnvilWallet(page, wallet);
      await page.goto(
        `/chains/31337/tiers/${tier}${operation === "refund" ? "/manage" : `?tokenId=${id}`}`,
      );
      await connectAnvilWallet(page, wallet);
      if (operation !== "refund")
        await page.getByText("Rewards & accounting", { exact: true }).click();
      const maintenance = page.getByRole("region", {
        name: "Membership maintenance",
      });
      let batches = 0;
      while (
        (
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "accountingStatus",
          })
        ).scheduledExpirations > 1n
      ) {
        expect(batches++).toBeLessThan(8);
        const before = await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "occupiedSupply",
        });
        await maintenance
          .getByRole("button", { name: "Advance maintenance" })
          .click();
        await expect(maintenance.getByRole("status")).toContainText(
          "boundaries processed",
          { timeout: 45_000 },
        );
        await expect
          .poll(() =>
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "occupiedSupply",
            }),
          )
          .toBeLessThan(before);
      }
      expect(batches).toBeGreaterThan(1);
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "occupiedSupply",
        }),
      ).toBe(1n);
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [lastGrant],
        }),
      ).toBe(0n);
      if (operation === "renewal") {
        const expiry = await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "expiresAt",
          args: [id],
        });
        await page.getByLabel("Periods", { exact: true }).fill("1");
        await page
          .getByRole("button", { name: `Renew membership #${id}`, exact: true })
          .click();
        await expectReconciled(page, `Renew membership #${id}`);
        expect(
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "expiresAt",
            args: [id],
          }),
        ).toBeGreaterThan(expiry);
      } else if (operation === "refund") {
        await page
          .getByLabel("Membership token", { exact: true })
          .fill(id.toString());
        await page.getByRole("button", { name: "Read refund preview" }).click();
        await page.getByRole("button", { name: "Refund unused time" }).click();
        await expectReconciled(page, `Refund membership #${id}`);
        expect(
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "balanceOf",
            args: [member],
          }),
        ).toBe(0n);
        expect(
          (
            await client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "claimableRetiredReward",
              args: [member],
            })
          )[0],
        ).toBeGreaterThan(0n);
      }
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`recovered-${operation}.png`),
        fullPage: true,
      });
    } finally {
      await revertAnvil(snapshot);
    }
  });
}
