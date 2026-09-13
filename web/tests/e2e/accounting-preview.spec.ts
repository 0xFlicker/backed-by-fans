import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { type Address, zeroAddress, encodeFunctionData } from "viem";
import { membershipTierAbi, membershipFactoryAbi } from "../../src/contracts";
import {
  installAnvilWallet,
  connectAnvilWallet,
  anvilPublicClient,
  rpcRequest,
  snapshotAnvil,
  revertAnvil,
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
  const saved = await snapshotAnvil();
  const tier = demo.tiers[0].address;
  const readonlySelectors = new Set([
    encodeFunctionData({
      abi: membershipFactoryAbi,
      functionName: "claimEverything",
      args: [[], 25n],
    }).slice(0, 10),
    encodeFunctionData({
      abi: membershipTierAbi,
      functionName: "claimRewards",
      args: [[], 25n],
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
    const ownerPage = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokensOfOwner",
      args: [demo.owner, 0n, 100n],
    });
    expect(ownerPage.tokenIds.length).toBeGreaterThan(0);
    const selectedId = ownerPage.tokenIds[0];
    const rewards = page.getByRole("region", { name: "Rewards", exact: true });
    await rewards
      .getByRole("checkbox", { name: new RegExp(`membership #${selectedId}$`) })
      .first()
      .check();
    await expect(rewards).toContainText("WETH");
    await expect(
      rewards.getByRole("button", { name: "Claim selected rewards" }),
    ).toBeEnabled();
    const before = await rewards
      .getByText(/^(Partial selected rewards|Selected rewards):/)
      .allTextContents();
    await rpcRequest("evm_increaseTime", [86400]);
    await rpcRequest("evm_mine");
    await expect
      .poll(
        () =>
          rewards
            .getByText(/^(Partial selected rewards|Selected rewards):/)
            .allTextContents(),
        {
          timeout: 25000,
        },
      )
      .not.toEqual(before);
    await page.screenshot({
      path: info.outputPath("account-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 844 });
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
    await page.goto(`/chains/31337/tiers/${tier}?tokenId=${selectedId}`);
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
    await page
      .locator(".protocol-burn")
      .getByText("Accounting details", { exact: true })
      .click();
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
    await page.goto(`/chains/31337/tiers/${tier}?tokenId=${selectedId}`);
    await expect(
      earnings.getByRole("button", { name: "Claim rewards" }),
    ).toBeEnabled();
    const projected = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [selectedId, demo.owner, demo.owner, 256n],
    });
    expect(
      projected.current.member + projected.current.creator,
    ).toBeGreaterThan(0n);
    const heldBefore = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [0n, zeroAddress, zeroAddress, 0n],
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
      args: [selectedId, demo.owner, demo.owner, 0n],
    });
    expect(after.settled.creator).toBe(0n);
    expect(after.settled.member).toBe(0n);
    expect(after.settled.status.accountedThrough).toBeGreaterThan(
      heldBefore.settled.status.accountedThrough,
    );
    expect(errors).toEqual([]);
  } finally {
    await rpcRequest("anvil_stopImpersonatingAccount", [demo.owner]);
    await revertAnvil(saved);
  }
});
