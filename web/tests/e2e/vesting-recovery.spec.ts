import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { getAddress, zeroAddress, type Address } from "viem";
import {
  membershipTierAbi,
  protocolBurnRouterAbi,
  membershipFactoryAbi,
  usdgAbi,
} from "../../src/contracts";
import {
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
  switchAnvilAccount,
} from "./helpers/anvil";

for (const operation of ["purchase", "refund", "sync"] as const) {
  test(`@anvil vesting-recovery resumes ${operation} through repeated website advances`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    test.skip(
      !process.env.BBF_ANVIL_RPC_URL,
      "Requires a configured local chain.",
    );
    test.skip(
      testInfo.project.name !== "desktop",
      "One recovery journey is sufficient.",
    );
    const checkpoint = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const member = requiredAnvilAddress("member");
    const token = requiredAnvilAddress("paymentToken");
    const client = anvilPublicClient();
    try {
      await installAnvilWallet(page, creator);
      await page.goto("/create");
      await page
        .getByRole("combobox", { name: "Membership network" })
        .selectOption("31337");
      await connectAnvilWallet(page, creator);
      await page
        .getByLabel("Membership name")
        .fill(`Recover ${operation} accounting`);
      await page.getByLabel("Symbol", { exact: true }).fill("STEP");
      await page.getByRole("button", { name: /^price & period$/i }).click();
      await page.getByLabel(/price per period/i).fill("1");
      await page.getByRole("button", { name: /^risks$/i }).click();
      await page.getByRole("checkbox").nth(0).check();
      await page.getByRole("checkbox").nth(1).check();
      await page.getByRole("button", { name: /^review$/i }).click();
      await page
        .getByRole("button", { name: "Publish this membership" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your membership is ready to share.",
        }),
      ).toBeVisible({ timeout: 45_000 });
      const tier = (await page
        .locator(".creator-success code")
        .first()
        .innerText()) as Address;
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: token,
          abi: usdgAbi,
          functionName: "approve",
          args: [tier, 113_000_000n],
        }),
      );
      const purchase = await sendContract({
        account: creator,
        address: tier,
        abi: membershipTierAbi,
        functionName: "gift",
        args: [member, 12n, 0, zeroAddress],
      });
      expectSuccessfulReceipt(purchase);
      const start = (
        await client.getBlock({ blockNumber: purchase.blockNumber })
      ).timestamp;
      // Real contract gifts create 101 distinct due checkpoints. This does not
      // edit contract storage, install synthetic tier code or fake RPC reads.
      for (let index = 0; index < 101; index++) {
        const recipient = getAddress(
          `0x${(0x1000 + index).toString(16).padStart(40, "0")}`,
        );
        expectSuccessfulReceipt(
          await sendContract({
            account: creator,
            address: tier,
            abi: membershipTierAbi,
            functionName: "gift",
            args: [recipient, 1n, 0, zeroAddress],
            gas: 2_000_000n,
          }),
        );
      }
      await rpcRequest("evm_setNextBlockTimestamp", [Number(start + 86_400n)]);
      await rpcRequest("evm_mine");
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: tier,
          abi: membershipTierAbi,
          functionName: "processAccounting",
          args: [25n],
        }),
      );
      await rpcRequest("evm_setNextBlockTimestamp", [
        Number(start + 3n * 30n * 86_400n),
      ]);
      await rpcRequest("evm_mine");
      const behind = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "accountingStatus",
      });
      expect(behind.complete).toBe(false);
      expect(behind.scheduledMembers).toBe(102n);
      await page.goto(
        `/chains/31337/tiers/${tier}${operation === "purchase" ? "" : "/manage"}`,
      );
      if (operation === "purchase") {
        await switchAnvilAccount(page, member);
        // Durable settled claims are reachable even before the backlog is cleared.
        const claim = page
          .locator(".claim-row")
          .filter({ hasText: "Membership rewards" })
          .getByRole("button", { name: "Claim to this wallet" });
        await claim.focus();
        await page.keyboard.press("Enter");
        await expectReconciled(page, "Claim membership rewards");
        await page
          .getByRole("button", { name: "Renew active membership" })
          .click();
        await expect(
          page.getByText(/Membership accounting needs to catch up/).first(),
        ).toBeVisible();
      } else if (operation === "refund") {
        await page
          .getByRole("button", { name: "Pause time increases" })
          .click();
        await expectReconciled(page, "Pause tier");
        await page.getByLabel("Membership token", { exact: true }).fill("1");
        await page.getByRole("button", { name: "Read refund preview" }).click();
        await expect(page.locator(".refund-preview[aria-live]")).toContainText(
          "Historical funding estimate",
        );
        await expect(
          page.getByRole("button", { name: "Refund unused time" }),
        ).toBeDisabled();
      } else {
        await page
          .getByRole("button", { name: "Scan for expired memberships" })
          .click();
        await page
          .getByRole("button", { name: "Sync next 100 expired memberships" })
          .click();
        await expect(
          page.getByText(/Membership accounting needs to catch up/).first(),
        ).toBeVisible();
        await page
          .getByRole("link", { name: "advance accounting", exact: true })
          .click();
      }
      const widget = page.getByRole("region", {
        name: "Advance membership accounting",
      });
      await expect(widget).toBeVisible();
      const semantics = await new AxeBuilder({ page })
        .include("[aria-label='Advance membership accounting']")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(semantics.violations).toEqual([]);
      await expect(widget.getByLabel("Maximum checkpoints")).toHaveCount(0);
      const fromBlock = await client.getBlockNumber({ cacheTime: 0 });
      const statuses = [];
      for (let round = 0; round < 5; round++) {
        const advance = widget.getByRole("button", {
          name: "Advance accounting",
          exact: true,
        });
        await expect(advance).toBeEnabled();
        await advance.focus();
        await page.keyboard.press("Enter");
        await expect
          .poll(
            async () =>
              (
                await client.readContract({
                  address: tier,
                  abi: membershipTierAbi,
                  functionName: "accountingStatus",
                })
              ).scheduledMembers,
            { timeout: 30_000 },
          )
          .toBe(102n - BigInt(Math.min((round + 1) * 25, 101)));
        await expect(advance).toBeEnabled();
        await expect(widget.getByRole("status")).toContainText(
          `${round === 4 ? 1 : 25} checkpoint`,
        );
        statuses.push(
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "accountingStatus",
          }),
        );
      }
      const factory = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "factory",
      });
      const router = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "burnRouter",
      });
      const completions = await client.getContractEvents({
        address: router,
        abi: protocolBurnRouterAbi,
        eventName: "AdvanceCompleted",
        fromBlock,
        toBlock: "latest",
      });
      expect(completions.map((event) => event.args.processedSteps)).toEqual([
        25n,
        25n,
        25n,
        25n,
        1n,
      ]);
      if (operation === "purchase") {
        await page
          .getByRole("button", { name: "Renew active membership" })
          .click();
        await expectReconciled(page, "Renew active membership");
      } else if (operation === "refund") {
        await expect(page.locator(".refund-preview[aria-live]")).toHaveCount(0);
        await page.getByRole("button", { name: "Read refund preview" }).click();
        await page.getByRole("button", { name: "Refund unused time" }).click();
        await expectReconciled(page, "Refund membership #1");
      } else {
        await page
          .getByRole("button", { name: "Scan for expired memberships" })
          .click();
        await page
          .getByRole("button", { name: "Sync next 100 expired memberships" })
          .click();
        await expectReconciled(page, "Sync 100 expired memberships");
        const last = page.getByRole("button", {
          name: "Sync next 1 expired membership",
          exact: true,
        });
        await expect(last).toBeEnabled();
        await last.click();
        await expectReconciled(page, "Sync 1 expired membership");
        expect(
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "occupiedSupply",
          }),
        ).toBe(1n);
      }
      const path = testInfo.outputPath(`recovery-${operation}.json`);
      await writeFile(
        path,
        JSON.stringify(
          {
            kind: "real local split graph, mock payment asset",
            operation,
            tier,
            behind,
            statuses,
            completions,
          },
          (_, value) => (typeof value === "bigint" ? String(value) : value),
          2,
        ),
      );
      await testInfo.attach("recovery-evidence", {
        path,
        contentType: "application/json",
      });
      await widget.screenshot({
        path: testInfo.outputPath(`recovery-${operation}.png`),
      });
    } finally {
      await revertAnvil(checkpoint);
    }
  });
}
