import { expect, test } from "@playwright/test";
import { erc20Abi, zeroAddress } from "viem";
import { membershipTierAbi } from "../../src/contracts";
import { forkContext } from "./helpers/protocol-fork";
import {
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
} from "./helpers/anvil";

test("@protocol-fork protocol page separates accounting, buybacks and combined execution", async ({
  page,
}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "One authentic wallet journey",
  );
  test.setTimeout(180000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext();
    const member = requiredAnvilAddress("member");
    const token = f.bootstrap.protocolToken;
    const tier = await f.tier("Three protocol actions", token, 10000, 100n);
    await f.giveProtocolTokens(member, 1200n);
    await f.write(member, token, erc20Abi, "approve", [tier, 1200n]);
    await f.write(member, tier, membershipTierAbi, "purchase", [
      12n,
      zeroAddress,
    ]);
    await f.testClient.increaseTime({ seconds: 350 });
    await f.testClient.mine({ blocks: 1 });
    const supply = () =>
      f.client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    const held = () =>
      f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeEarnedHeld",
      });
    const status = () =>
      f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "accountingStatus",
      });
    await installAnvilWallet(page, member);
    await page.goto("/chains/31337/protocol");
    await connectAnvilWallet(page, member);
    const widget = page.locator(".protocol-burn");
    const mode = widget.getByRole("combobox", { name: "Action", exact: true });
    await mode.selectOption("accounting");
    await widget
      .getByText("Choose a membership instead of automatic selection", {
        exact: true,
      })
      .click();
    await widget.getByLabel("Membership contract address").fill(tier);
    const beforeAccounting = await supply();
    await widget
      .getByRole("button", { name: "Advance accounting", exact: true })
      .click();
    await expect.poll(held, { timeout: 45000 }).toBeGreaterThan(0n);
    await expect(mode).toBeEnabled({ timeout: 45000 });
    expect(await supply()).toBe(beforeAccounting);
    const firstEarnings = await held();
    await mode.selectOption("both");
    await widget
      .getByRole("button", { name: "Advance and burn", exact: true })
      .click();
    await expect
      .poll(supply, { timeout: 45000 })
      .toBeLessThan(beforeAccounting);
    await expect(mode).toBeEnabled({ timeout: 45000 });
    expect(await held()).toBe(0n);
    expect(beforeAccounting - (await supply())).toBeGreaterThanOrEqual(
      firstEarnings,
    );
    await f.testClient.increaseTime({ seconds: 100 });
    await f.testClient.mine({ blocks: 1 });
    await f.write(member, tier, membershipTierAbi, "processAccounting", [25n]);
    await f.write(member, tier, membershipTierAbi, "releaseProtocolFees");
    const beforeBuyback = await supply();
    const cursor = (await status()).accountedThrough;
    await mode.selectOption("buyback");
    await widget
      .getByRole("button", { name: "Buyback and burn", exact: true })
      .click();
    await expect.poll(supply, { timeout: 45000 }).toBeLessThan(beforeBuyback);
    await expect(mode).toBeEnabled({ timeout: 45000 });
    expect((await status()).accountedThrough).toBe(cursor);
    await f.retain("protocol-advance-modes", {
      tier,
      beforeAccounting,
      beforeBuyback,
      finalSupply: await supply(),
      cursor,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
