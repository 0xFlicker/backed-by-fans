import { expect, test } from "@playwright/test";
import { getAddress } from "viem";
import {
  iAirdropCreatorCollectionAbi,
  iAirdropTransferRegistryAbi,
} from "../../src/contracts";
import {
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  revertAnvil,
  rpcRequest,
  snapshotAnvil,
} from "./helpers/anvil";

const collectionText = process.env.BBF_AIRDROP_REGISTER_E2E_COLLECTION;
test.skip(
  !collectionText ||
    !process.env.BBF_ANVIL_RPC_URL ||
    !process.env.NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS,
  "Requires the separate mainnet-state registration fork with execution chain 31337.",
);
test("detects restriction and registers Gaslite from the collection owner's wallet on the local fork", async ({
  page,
}) => {
  const collection = getAddress(collectionText!);
  const helper = getAddress(
    process.env.NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS!,
  );
  const client = anvilPublicClient();
  const owner = await client.readContract({
    address: collection,
    abi: iAirdropCreatorCollectionAbi,
    functionName: "owner",
  });
  const registry = await client.readContract({
    address: collection,
    abi: iAirdropCreatorCollectionAbi,
    functionName: "getTransferValidator",
  });
  const before = await client.readContract({
    address: registry,
    abi: iAirdropTransferRegistryAbi,
    functionName: "getCollectionSecurityPolicy",
    args: [collection],
  });
  const [whitelist, blacklist, authorizers] = await Promise.all([
    client.readContract({
      address: registry,
      abi: iAirdropTransferRegistryAbi,
      functionName: "getWhitelistedAccountsByCollection",
      args: [collection],
    }),
    client.readContract({
      address: registry,
      abi: iAirdropTransferRegistryAbi,
      functionName: "getBlacklistedAccountsByCollection",
      args: [collection],
    }),
    client.readContract({
      address: registry,
      abi: iAirdropTransferRegistryAbi,
      functionName: "getAuthorizerAccountsByCollection",
      args: [collection],
    }),
  ]);
  const snapshot = await snapshotAnvil();
  try {
    await rpcRequest("anvil_impersonateAccount", [owner]);
    await rpcRequest("anvil_setBalance", [owner, "0xde0b6b3a7640000"]);
    await installAnvilWallet(page, owner);
    await page.goto("/chains/31337/airdrop");
    const input = page.getByLabel("NFT collection");
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute(
      "placeholder",
      /Gentlemen Prefer Blondes/,
    );
    await input.focus();
    await expect(input).toHaveAttribute("placeholder", "");
    await input.fill(collection);
    await expect(
      page.getByText(/transfer registry blocks GasliteDrop/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Owner registration" }),
    ).toHaveAttribute("href", `/chains/31337/airdrop/register/${collection}`);
    await connectAnvilWallet(page, owner);
    await page.getByRole("link", { name: "Owner registration" }).click();
    await page.getByRole("checkbox").check();
    await expect(
      page.getByRole("button", { name: "Register GasliteDrop" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Register GasliteDrop" }).click();
    await expect(
      page.getByText(
        "GasliteDrop registered. The NFT holder can now prepare the airdrop.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    const after = await client.readContract({
      address: registry,
      abi: iAirdropTransferRegistryAbi,
      functionName: "getCollectionSecurityPolicy",
      args: [collection],
    });
    expect(after.transferSecurityLevel).toBe(before.transferSecurityLevel);
    expect(after.permittedContractReceiversId).toBe(
      before.permittedContractReceiversId,
    );
    expect(after.operatorWhitelistId).not.toBe(before.operatorWhitelistId);
    expect(
      await client.readContract({
        address: registry,
        abi: iAirdropTransferRegistryAbi,
        functionName: "listOwners",
        args: [after.operatorWhitelistId],
      }),
    ).toBe(owner);
    expect(
      await client.readContract({
        address: registry,
        abi: iAirdropTransferRegistryAbi,
        functionName: "getWhitelistedAccountsByCollection",
        args: [collection],
      }),
    ).toEqual([...whitelist, helper]);
    expect(
      await client.readContract({
        address: registry,
        abi: iAirdropTransferRegistryAbi,
        functionName: "getBlacklistedAccountsByCollection",
        args: [collection],
      }),
    ).toEqual(blacklist);
    expect(
      await client.readContract({
        address: registry,
        abi: iAirdropTransferRegistryAbi,
        functionName: "getAuthorizerAccountsByCollection",
        args: [collection],
      }),
    ).toEqual(authorizers);
    await page.screenshot({
      path: `/tmp/bbf-airdrop-register-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Return to airdrop" }).click();
    await page.getByLabel("NFT collection").fill(collection);
    await expect(
      page.getByText(/transfer registry blocks GasliteDrop/),
    ).not.toBeVisible();
  } finally {
    await revertAnvil(snapshot);
  }
});

test("only serves public airdrops on Robinhood mainnet", async ({ page }) => {
  const response = await page.goto("/chains/46630/airdrop");
  expect(response?.status()).toBe(404);
});
