import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { erc20Abi, getAddress, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import sources from "../../../contracts/external/verification/4663/sources.json" with { type: "json" };
import { forkContext } from "./helpers/protocol-fork";
import {
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  rpcRequest,
  expectReconciled,
} from "./helpers/anvil";

test.describe("@protocol-fork creator funding review", () => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1",
    "Requires an authentic local fork.",
  );
  test("keeps image controls focused while updating size, quality and storage price", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const creator = requiredAnvilAddress("creator");
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await connectAnvilWallet(page, creator);
    await page.getByRole("button", { name: /^art studio$/i }).click();
    await page.getByText("Add an image", { exact: true }).click();
    await page
      .getByLabel("Add new image")
      .setInputFiles(resolve("public/brand/backstage-membership-hero-v1.png"));
    const size = page.getByRole("combobox", {
      name: "Image size",
      exact: true,
    });
    await expect(size).toBeVisible();
    await size.selectOption("64");
    await expect(page.getByText(/gas · approximately/)).toBeVisible();
    const cost64 = await page.getByText(/gas · approximately/).textContent();
    await size.selectOption("128");
    await expect(page.getByText(/gas · approximately/)).toBeVisible();
    await expect(page.getByText(/gas · approximately/)).not.toHaveText(cost64!);
    const slider = page.getByRole("slider", { name: /^JPEG quality/ });
    await slider.focus();
    for (let i = 0; i < 3; i++) {
      await slider.press("ArrowLeft");
      await expect(slider).toBeFocused();
      await expect(size).toBeVisible();
    }
    await expect(page.getByText(/gas · approximately/)).toBeVisible();
  });

  test("wraps the exact shortfall through the wallet before purchasing", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "One wallet mutation is sufficient.",
    );
    test.setTimeout(120000);
    const f = await forkContext();
    const payer = privateKeyToAccount(generatePrivateKey()).address;
    const weth = getAddress(sources.records.weth.address);
    const price = parseEther("0.001");
    // Own a new local wallet and tier; never rewind the user's running fork.
    await rpcRequest("anvil_setBalance", [
      payer,
      `0x${parseEther("1").toString(16)}`,
    ]);
    await rpcRequest("anvil_impersonateAccount", [payer]);
    try {
      const tier = await f.tier(
        `Wrapping review ${Date.now()}`,
        weth,
        100,
        price,
      );
      await installAnvilWallet(page, payer);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, payer);
      await expect(
        page.getByRole("button", { name: "New membership" }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Wrap 0.001 ETH", exact: true })
        .click();
      await expectReconciled(page, "Wrap ETH");
      expect(
        await f.client.readContract({
          address: weth,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [payer],
        }),
      ).toBe(price);
      await page.getByRole("button", { name: "New membership" }).click();
      await expectReconciled(page, "New membership");
      expect(
        await f.client.readContract({
          address: weth,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [payer],
        }),
      ).toBe(0n);
    } finally {
      await rpcRequest("anvil_stopImpersonatingAccount", [payer]);
    }
  });
});
