import type { PublicClient } from "viem";

import type { CatalogTierSummary } from "@/contracts/types";
import {
  catalogPageLimit,
  readCatalogPage,
  readTierSummaries,
} from "@/lib/direct-read";
import {
  readAcceptedPaymentTokens,
  type AcceptedPaymentTokenReadState,
} from "@/lib/payment-token-read";
import type { ReadState } from "@/lib/read-state";
import type { ReadyDeployment } from "@/lib/config";
import type { SupportedChainId } from "@/lib/chains";

export type CatalogSnapshot = {
  page: Awaited<ReturnType<typeof readCatalogPage>>;
  summaries: ReadState<CatalogTierSummary[]>;
  paymentTokens: AcceptedPaymentTokenReadState;
};

export type CatalogInitialState =
  | {
      status: "ready";
      chainId: SupportedChainId;
      data: CatalogSnapshot;
    }
  | {
      status: "failed";
      chainId: SupportedChainId;
      state: ReadState<never>;
    };

export async function readCatalogSnapshot(
  client: PublicClient,
  deployment: ReadyDeployment,
  input: { offset?: bigint; capturedBlock?: bigint } = {},
): Promise<CatalogSnapshot> {
  const page = await readCatalogPage(client, deployment.factoryAddress, {
    offset: input.offset,
    limit: catalogPageLimit,
    blockNumber: input.capturedBlock,
  });
  const [summaries, paymentTokens] = await Promise.all([
    readTierSummaries(client, page.addresses, page.capturedBlock),
    readAcceptedPaymentTokens(client, {
      chainId: deployment.chainId,
      factory: deployment.factoryAddress,
      blockNumber: page.capturedBlock,
    }),
  ]);
  return { page, summaries, paymentTokens };
}
