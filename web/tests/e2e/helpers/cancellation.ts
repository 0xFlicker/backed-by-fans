import { expect, type Page } from "@playwright/test";
import type { Address } from "viem";
import { membershipTierAbi } from "../../../src/contracts";
import { anvilPublicClient, switchAnvilAccount } from "./anvil";

export async function openMemberCancellation(
  page: Page,
  tier: Address,
  tokenId: bigint,
) {
  const owner = await anvilPublicClient().readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  await page.goto(`/chains/31337/tiers/${tier}`);
  await switchAnvilAccount(page, owner);
  await page.goto(`/chains/31337/tiers/${tier}?tokenId=${tokenId}`);
}

export async function reviewMemberCancellation(page: Page) {
  await page
    .getByRole("button", { name: "Review cancellation", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Cancel membership", exact: true }),
  ).toContainText("Minimum refund");
  await page.getByRole("checkbox", { name: /End membership #/ }).check();
}
