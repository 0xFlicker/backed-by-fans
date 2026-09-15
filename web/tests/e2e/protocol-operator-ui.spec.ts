import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  zeroAddress,
} from "viem";
import { anvil } from "viem/chains";
import { protocolBuybackVaultAbi } from "../../src/contracts";
import { forkContext } from "./helpers/protocol-fork";
import {
  installAnvilWallet,
  connectAnvilWallet,
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
  rpcRequest,
  switchAnvilAccount,
} from "./helpers/anvil";

test("@protocol-fork operator reviews and submits a wallet buyback; stale authority and quotes cannot submit", async ({
  page,
}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "Authentic local fork required",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      b = f.bootstrap;
    const caller = requiredAnvilAddress("member");
    await rpcRequest("anvil_impersonateAccount", [caller]);
    await f.safe("operator", { operator: caller });
    await f.safe("pause", { paused: false });
    const wallet = createWalletClient({
      chain: anvil,
      account: caller,
      transport: http(f.rpc),
    });
    await f.client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        to: b.buybackVault,
        value: parseEther("0.0001"),
        gasPrice: 100_000_000n,
      }),
    });
    await f.write(
      caller,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [zeroAddress],
    );
    await installAnvilWallet(page, caller);
    await page.goto("/chains/31337/tools/buybacks");
    await expect(
      page.getByRole("heading", { name: "Submit an operator buyback" }),
    ).toBeVisible();
    console.log("Operator form loaded");
    await connectAnvilWallet(page, caller);
    await switchAnvilAccount(page, requiredAnvilAddress("creator"));
    await expect(
      page.getByRole("button", { name: "Review buyback", exact: true }),
    ).toBeDisabled();
    await switchAnvilAccount(page, caller);
    await page.getByLabel("Funds to use").selectOption("1");
    await page
      .getByRole("combobox", { name: "Asset", exact: true })
      .selectOption(zeroAddress);
    await page.getByLabel("Amount (ETH)", { exact: true }).fill("0.00001");
    const review = page.getByRole("button", {
      name: "Review buyback",
      exact: true,
    });
    const submit = page.getByRole("button", {
      name: "Submit buyback",
      exact: true,
    });
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    // Editing reviewed terms removes the submission action.
    await page.getByLabel("Amount (ETH)", { exact: true }).fill("0.00002");
    await expect(submit).toHaveCount(0);
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    const supply = () =>
      f.client.readContract({
        address: b.protocolToken,
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    console.log("Native quote reviewed");
    const before = await supply();
    const nonce = await f.client.getTransactionCount({ address: caller });
    await submit.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Buyback confirmed." }),
    ).toBeVisible({ timeout: 60000 });
    expect(await supply()).toBeLessThan(before);
    expect(await f.client.getTransactionCount({ address: caller })).toBe(
      nonce + 1,
    );
    await expect(submit).toHaveCount(0);
    console.log("Native buyback confirmed");
    // Exercise a typed conversion route using authentic USDG and its real pool.
    const fixture = JSON.parse(
      await readFile(
        resolve(dirname(process.env.BBF_FORK_BOOTSTRAP!), "fixture.json"),
        "utf8",
      ),
    );
    const usdg = fixture.assets.usdg;
    const donor = fixture.accounts[0];
    await rpcRequest("anvil_impersonateAccount", [donor]);
    try {
      await f.write(donor, usdg, erc20Abi, "transfer", [
        b.buybackVault,
        1_000_000n,
      ]);
    } finally {
      await rpcRequest("anvil_stopImpersonatingAccount", [donor]);
    }
    await f.write(
      caller,
      b.buybackVault,
      protocolBuybackVaultAbi,
      "syncDonation",
      [usdg],
    );
    const route = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "route",
      args: [usdg],
    });
    const policy = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "permissionlessPolicy",
      args: [usdg],
    });
    await page.reload();
    await page.getByLabel("Funds to use").selectOption("1");
    await page
      .getByRole("combobox", { name: "Asset", exact: true })
      .selectOption(usdg);
    await page.getByLabel("Amount (USDG)", { exact: true }).fill("0.25");
    await expect(
      page.getByText("USDG → ETH → protocol token", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add conversion pool" }),
    ).toHaveCount(0);
    console.log("Conversion route entered");
    const beforeConversion = await supply();
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    await submit.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Buyback confirmed." }),
    ).toBeVisible({ timeout: 60000 });
    expect(await supply()).toBeLessThan(beforeConversion);
    expect(
      await f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "permissionlessPolicy",
        args: [usdg],
      }),
    ).toEqual(policy);
    expect(
      await f.client.readContract({
        address: b.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "route",
        args: [usdg],
      }),
    ).toEqual(route);
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    console.log("Testing operator revocation");
    await f.safe("operator", { operator: zeroAddress });
    const afterBuy = await f.client.getTransactionCount({ address: caller });
    await submit.click();
    await expect(
      page
        .getByRole("region", {
          name: "Submit an operator buyback",
          exact: true,
        })
        .getByRole("alert"),
    ).toContainText("no longer the authorized operator");
    expect(await f.client.getTransactionCount({ address: caller })).toBe(
      afterBuy,
    );
    await f.safe("operator", { operator: caller });
    await page.getByLabel("Amount (USDG)", { exact: true }).fill("0.24");
    await expect(submit).toHaveCount(0);
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    await rpcRequest("evm_increaseTime", [121]);
    await rpcRequest("evm_mine");
    await submit.click();
    await expect(
      page
        .getByRole("region", {
          name: "Submit an operator buyback",
          exact: true,
        })
        .getByRole("alert"),
    ).toContainText("quote expired");
    expect(await f.client.getTransactionCount({ address: caller })).toBe(
      afterBuy,
    );
    // Release the real seeded membership earnings on this same page, then buy with them.
    await rpcRequest("evm_increaseTime", [86400]);
    await rpcRequest("evm_mine");
    await page.reload();
    await page
      .getByRole("combobox", { name: "Asset", exact: true })
      .selectOption(usdg);
    await page.getByLabel("Funds to use").selectOption("0");
    const beforeRelease = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [usdg, 0],
    });
    const supplyBeforeRelease = await supply();
    await page
      .getByRole("button", { name: "Release earned fees", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Funds are ready for a buyback." }),
    ).toBeVisible({ timeout: 60000 });
    const released = await f.client.readContract({
      address: b.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [usdg, 0],
    });
    expect(released.available).toBeGreaterThan(beforeRelease.available);
    expect(await supply()).toBe(supplyBeforeRelease);
    await page.getByRole("button", { name: "Max", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Amount (USDG)", exact: true }),
    ).not.toHaveValue("");
    await review.click();
    await expect(submit).toBeEnabled({ timeout: 60000 });
    await expect(
      page.getByRole("region", { name: "Buyback review", exact: true }),
    ).toContainText("You spend up to");
    await submit.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Buyback confirmed." }),
    ).toBeVisible({ timeout: 60000 });
    expect(await supply()).toBeLessThan(supplyBeforeRelease);
    await page.screenshot({
      path: info.outputPath("operator-review.png"),
      fullPage: true,
    });
  } finally {
    await rpcRequest("anvil_stopImpersonatingAccount", [
      requiredAnvilAddress("member"),
    ]);
    await revertAnvil(snapshot);
  }
});
