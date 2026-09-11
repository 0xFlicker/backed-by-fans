import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { type Address, zeroAddress, encodeFunctionData } from "viem";
import { membershipTierAbi, membershipFactoryAbi } from "../../src/contracts";
import {
  installAnvilWallet,
  connectAnvilWallet,
  anvilPublicClient,
  rpcRequest,
} from "./helpers/anvil";

const directory = process.env.BBF_PREVIEW_REVIEW_DIR;
test("live previews refresh without a transaction and a membership claim pays projected earnings", async ({
  page,
}, info) => {
  test.skip(!directory, "Requires a newly deployed local preview graph");
  test.setTimeout(120_000);
  const demo = JSON.parse(
    await readFile(`${directory}/buyback-demo.json`, "utf8"),
  ) as {
    owner: Address;
    factory: Address;
    tiers: { address: Address; symbol: string }[];
  };
  const client = anvilPublicClient();
  expect(await client.getChainId()).toBe(31337);
  const saved = await rpcRequest<string>("evm_snapshot");
  const tier = demo.tiers[0].address;
  const readonlySelectors = new Set([
    encodeFunctionData({
      abi: membershipFactoryAbi,
      functionName: "claimEverything",
      args: [[]],
    }).slice(0, 10),
    encodeFunctionData({
      abi: membershipTierAbi,
      functionName: "claimAll",
    }).slice(0, 10),
  ]);
  const transactionPreviews: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    let body;
    try {
      body = request.postDataJSON();
    } catch {
      return;
    }
    for (const call of Array.isArray(body) ? body : [body]) {
      const selector = call?.params?.[0]?.data?.slice(0, 10);
      if (call?.method === "eth_call" && readonlySelectors.has(selector))
        transactionPreviews.push(selector);
    }
  });
  try {
    const nonce = await client.getTransactionCount({ address: demo.owner });
    await installAnvilWallet(page, demo.owner);
    await page.goto("/account");
    await connectAnvilWallet(page, demo.owner);
    const rewards = page.getByRole("region", { name: "Rewards", exact: true });
    await expect(rewards).toContainText("WETH");
    await expect(
      rewards.getByRole("button", { name: "Claim everything" }),
    ).toBeEnabled();
    const before = await rewards
      .locator(".account-reward-amount")
      .allTextContents();
    await rpcRequest("evm_increaseTime", [86400]);
    await rpcRequest("evm_mine");
    await expect
      .poll(() => rewards.locator(".account-reward-amount").allTextContents(), {
        timeout: 25000,
      })
      .not.toEqual(before);
    await page.screenshot({
      path: info.outputPath("account-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("account-phone.png"),
      fullPage: true,
    });
    await page.goto(`/chains/31337/tiers/${tier}`);
    const earnings = page.locator(".claim-groups");
    await expect(earnings).toContainText("Your earnings");
    await expect(
      earnings.getByRole("button", { name: "Claim rewards" }),
    ).toBeEnabled();
    const memberBefore = await earnings.innerText();
    await rpcRequest("evm_increaseTime", [86400]);
    await rpcRequest("evm_mine");
    await expect
      .poll(() => earnings.innerText(), { timeout: 25000 })
      .not.toBe(memberBefore);
    await page.screenshot({
      path: info.outputPath("membership-phone.png"),
      fullPage: true,
    });
    await page.goto("/chains/31337/protocol");
    await expect(
      page.locator(".protocol-funding-preview").first(),
    ).toBeVisible();
    await expect(page.locator(".protocol-burn")).toContainText(
      "since last settlement",
    );
    await page.screenshot({
      path: info.outputPath("protocol-phone.png"),
      fullPage: true,
    });
    expect(transactionPreviews).toEqual([]);
    expect(await client.getTransactionCount({ address: demo.owner })).toBe(
      nonce,
    );
    await page.goto(`/chains/31337/tiers/${tier}`);
    await expect(
      earnings.getByRole("button", { name: "Claim rewards" }),
    ).toBeEnabled();
    const projected = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [1n, demo.owner, 256n],
    });
    expect(
      projected.current.member + projected.current.creator,
    ).toBeGreaterThan(0n);
    const heldBefore = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [0n, zeroAddress, 0n],
    });
    await rpcRequest("anvil_impersonateAccount", [demo.owner]);
    await earnings.getByRole("button", { name: "Claim rewards" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Paid " }),
    ).toBeVisible({ timeout: 20000 });
    expect(await client.getTransactionCount({ address: demo.owner })).toBe(
      nonce + 1,
    );
    const after = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [1n, demo.owner, 0n],
    });
    expect(after.settled.creator).toBe(0n);
    expect(after.settled.member).toBe(0n);
    expect(after.settled.status.accountedThrough).toBeGreaterThan(
      heldBefore.settled.status.accountedThrough,
    );
    expect(errors).toEqual([]);
  } finally {
    await rpcRequest("anvil_stopImpersonatingAccount", [demo.owner]);
    expect(await rpcRequest("evm_revert", [saved])).toBe(true);
  }
});
