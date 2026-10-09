import { expect, test } from "@playwright/test";
import { getAddress } from "viem";
import { ierc721Abi } from "../../src/contracts";
import {
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

const senderText = process.env.BBF_AIRDROP_E2E_SENDER;
const nftText = process.env.BBF_AIRDROP_E2E_NFT;
const recipientText = process.env.BBF_AIRDROP_E2E_RECIPIENT;
test.skip(
  !senderText ||
    !nftText ||
    !recipientText ||
    !process.env.NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS ||
    !process.env.BBF_ANVIL_RPC_URL,
  "Requires the disposable local ERC721 airdrop fixture.",
);

test("reviews assignments and sends a real local ERC721 batch through the connected wallet", async ({
  page,
}) => {
  const sender = getAddress(senderText!);
  const nft = getAddress(nftText!);
  const recipient = getAddress(recipientText!);
  const snapshot = await snapshotAnvil();
  try {
    await installAnvilWallet(page, sender);
    await page.goto("/chains/31337/airdrop");
    await expect(
      page.getByRole("heading", { name: /Send a little/ }),
    ).toBeVisible();
    await page.getByLabel("NFT collection").fill(nft);
    await page
      .getByLabel("Recipient list")
      .fill(`address,tokenId\n${recipient},1\n${recipient},2`);
    // Connecting must preserve the creator's draft list.
    await connectAnvilWallet(page, sender);
    await expect(page.getByLabel("Recipient list")).toHaveValue(
      `address,tokenId\n${recipient},1\n${recipient},2`,
    );
    await page.getByRole("checkbox").check();
    await expect(
      page.getByRole("button", { name: "Start airdrop" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Start airdrop" }).click();
    await expect(
      page.getByText("Airdrop complete. Every batch has a confirmed receipt."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: /Batch 1 · 2 NFTs · confirmed/ }),
    ).toBeVisible();
    const client = anvilPublicClient();
    for (const id of [1n, 2n])
      expect(
        await client.readContract({
          address: nft,
          abi: ierc721Abi,
          functionName: "ownerOf",
          args: [id],
        }),
      ).toBe(recipient);
    await page.getByRole("button", { name: "Remove approval" }).click();
    await expect(page.getByText("Collection approval removed.")).toBeVisible();
    expect(
      await client.readContract({
        address: nft,
        abi: ierc721Abi,
        functionName: "isApprovedForAll",
        args: [
          sender,
          getAddress(process.env.NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS!),
        ],
      }),
    ).toBe(false);
    await page.screenshot({
      path: `/tmp/bbf-airdrop-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
