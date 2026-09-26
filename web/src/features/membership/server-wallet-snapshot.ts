import "server-only";

import type { Address, PublicClient } from "viem";
import type { ReadyDeployment } from "@/lib/config";
import {
  readAcceptedPaymentTokens,
  type AcceptedPaymentTokenReadState,
} from "@/lib/payment-token-read";
import { classifyReadError } from "@/lib/read-state";
import { readRewardUsdPrices } from "@/lib/reward-usd";
import {
  discoverAccountPage,
  readAccountOwnerPage,
  type AccountDiscoveryPage,
} from "./account-discovery";
import { sortClaimSelection } from "./account-rewards-read";
import { readAccountRewardStreams } from "./account-reward-streams";

export type WalletSnapshot = {
  page: AccountDiscoveryPage;
  paymentTokens: AcceptedPaymentTokenReadState;
  rewards?: Awaited<ReturnType<typeof readAccountRewardStreams>>;
  rewardError?: string;
  usd?: Awaited<ReturnType<typeof readRewardUsdPrices>>;
  usdError?: string;
};

/** Read the entire wallet at one block, without a connection or browser cursor. */
export async function readServerWalletSnapshot(
  client: PublicClient,
  deployment: ReadyDeployment,
  wallet: Address,
): Promise<WalletSnapshot> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const paymentTokensPromise = readAcceptedPaymentTokens(client, {
    chainId: deployment.chainId,
    factory: deployment.factoryAddress,
    blockNumber,
  });
  const page = await discoverAccountPage(client, {
    deployment,
    wallet,
    offset: 0n,
    blockNumber,
  });
  while (page.nextOffset !== null) {
    const offset = page.nextOffset;
    const next = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset,
      blockNumber,
    });
    if (next.scannedTo <= offset)
      throw new Error("Membership catalogue did not advance.");
    page.scannedTo = next.scannedTo;
    page.nextOffset = next.nextOffset;
    page.scannedTiers.push(...next.scannedTiers);
    page.results.push(...next.results);
    page.skipped.push(...next.skipped);
  }
  await Promise.all(
    page.results.map(async (tier) => {
      while (!tier.ownerComplete) {
        const offset = tier.nextOwnerOffset;
        const next = await readAccountOwnerPage(client, {
          deployment,
          wallet,
          tier: tier.tier,
          offset,
          blockNumber,
        });
        if (!next.ownerComplete && next.nextOwnerOffset <= offset)
          throw new Error("Membership ownership page did not advance.");
        tier.positions.push(...next.positions);
        tier.nextOwnerOffset = next.nextOwnerOffset;
        tier.ownerComplete = next.ownerComplete;
      }
    }),
  );
  const snapshot: WalletSnapshot = {
    page,
    paymentTokens: await paymentTokensPromise,
  };
  const tiers = sortClaimSelection(
    page.results.map((tier) => ({
      tier: tier.tier,
      name: tier.name,
      tokenIds: tier.positions.map((position) => position.tokenId),
    })),
  );
  try {
    snapshot.rewards = await readAccountRewardStreams(
      client,
      wallet,
      tiers,
      blockNumber,
    );
  } catch (error) {
    snapshot.rewardError = classifyReadError(error).label;
  }
  if (page.results.length && deployment.chainId !== 46630) {
    try {
      snapshot.usd = await readRewardUsdPrices(
        client,
        deployment.factoryAddress,
        [
          ...new Set(
            page.results.map(
              (tier) => tier.paymentToken.toLowerCase() as Address,
            ),
          ),
        ],
        blockNumber,
      );
    } catch (error) {
      snapshot.usdError = classifyReadError(error).label;
    }
  }
  return snapshot;
}
