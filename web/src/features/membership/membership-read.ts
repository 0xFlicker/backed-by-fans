import {
  multicall3Abi,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";

import { tierAbi, tokenAbi } from "@/contracts/abis";
import type {
  ReferralStatus,
  SupporterCredential,
  TierSupporterSnapshot,
} from "@/contracts/types";
import { isSameAddress } from "@/lib/address";
import type { ReadyDeployment } from "@/lib/config";
import {
  multicall3Address,
  readTierSnapshotState,
  verifyMulticall3,
} from "@/lib/direct-read";
import { classifyReadError, type ReadState } from "@/lib/read-state";

function referralStatus(value: number): ReferralStatus {
  if (value === 1) return "locked-none";
  if (value === 2) return "locked-address";
  return "unset";
}

type MulticallResult =
  { status: "success"; result: unknown } | { status: "failure" };

async function readMulticallValues(
  client: PublicClient,
  contracts: Record<string, unknown>[],
  blockNumber: bigint,
) {
  const results = (await client.multicall({
    contracts: contracts as never,
    allowFailure: true,
    blockNumber,
    multicallAddress: multicall3Address,
  })) as MulticallResult[];
  if (results.some((result) => result.status !== "success")) {
    throw new Error("A required batched membership read failed.");
  }
  return results.map((result) =>
    result.status === "success" ? result.result : undefined,
  );
}

export type GiftRecipientState = {
  tokenId: bigint;
  expiration: bigint;
  active: boolean;
  occupied: boolean;
  paidSeconds: bigint;
  referralStatus: ReferralStatus;
  referrer: Address;
};

export async function readGiftRecipientState(
  client: PublicClient,
  input: { tier: Address; recipient: Address; blockNumber: bigint },
): Promise<GiftRecipientState> {
  const tokenId = await client.readContract({
    address: input.tier,
    abi: tierAbi,
    functionName: "tokenOf",
    args: [input.recipient],
    blockNumber: input.blockNumber,
  });
  if (tokenId === 0n) {
    return {
      tokenId,
      expiration: 0n,
      active: false,
      occupied: false,
      paidSeconds: 0n,
      referralStatus: "unset",
      referrer: zeroAddress,
    };
  }
  const [expiration, active, occupied, time, referral] = await Promise.all([
    client.readContract({
      address: input.tier,
      abi: tierAbi,
      functionName: "expiresAt",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: tierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: tierAbi,
      functionName: "isOccupied",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: tierAbi,
      functionName: "timeBalances",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: tierAbi,
      functionName: "referralOf",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
  ]);
  return {
    tokenId,
    expiration,
    active,
    occupied,
    paidSeconds: time[0],
    referralStatus: referralStatus(referral[0]),
    referrer: referral[1],
  };
}

async function readCredential(
  client: PublicClient,
  tier: Address,
  tokenId: bigint,
  blockNumber: bigint,
): Promise<SupporterCredential> {
  const values = await Promise.all(
    credentialContracts(tier, tokenId).map((contract) =>
      client.readContract({ ...contract, blockNumber } as never),
    ),
  );
  return credentialFromValues(tokenId, values);
}

function credentialFromValues(tokenId: bigint, values: unknown[]) {
  const [
    owner,
    active,
    occupied,
    expiration,
    time,
    referral,
    shares,
    reward,
    refund,
  ] = values;
  return {
    tokenId,
    owner: owner as Address,
    active: active as boolean,
    occupied: occupied as boolean,
    expiration: expiration as bigint,
    paidSeconds: (time as readonly bigint[])[0],
    grantSeconds: (time as readonly bigint[])[1],
    shares: shares as bigint,
    claimableReward: reward as bigint,
    refundableGross: (refund as readonly bigint[])[0],
    referralStatus: referralStatus((referral as readonly [number, Address])[0]),
    referrer: (referral as readonly [number, Address])[1],
  } satisfies SupporterCredential;
}

function credentialContracts(
  tier: Address,
  tokenId: bigint,
): Record<string, unknown>[] {
  return [
    { address: tier, abi: tierAbi, functionName: "ownerOf", args: [tokenId] },
    {
      address: tier,
      abi: tierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
    },
    {
      address: tier,
      abi: tierAbi,
      functionName: "isOccupied",
      args: [tokenId],
    },
    { address: tier, abi: tierAbi, functionName: "expiresAt", args: [tokenId] },
    {
      address: tier,
      abi: tierAbi,
      functionName: "timeBalances",
      args: [tokenId],
    },
    {
      address: tier,
      abi: tierAbi,
      functionName: "referralOf",
      args: [tokenId],
    },
    { address: tier, abi: tierAbi, functionName: "sharesOf", args: [tokenId] },
    {
      address: tier,
      abi: tierAbi,
      functionName: "claimableReward",
      args: [tokenId],
    },
    {
      address: tier,
      abi: tierAbi,
      functionName: "previewRefund",
      args: [tokenId],
    },
  ];
}

export async function readTierSupporterState(
  client: PublicClient,
  input: {
    tier: Address;
    deployment: ReadyDeployment;
    wallet?: Address;
  },
): Promise<ReadState<TierSupporterSnapshot>> {
  const tier = await readTierSnapshotState(client, input);
  if (tier.status !== "valid" && tier.status !== "stale") return tier;

  try {
    const blockNumber = tier.capturedBlock;
    const blockPromise = client.getBlock({ blockNumber });
    if (!input.wallet) {
      const block = await blockPromise;
      return {
        ...tier,
        data: { ...tier.data, capturedTimestamp: block.timestamp },
      };
    }

    const wallet = input.wallet;
    const multicallStatus = await verifyMulticall3(client, blockNumber);
    let tokenId: bigint;
    let usdgBalance: bigint;
    let ethBalance: bigint;
    let allowance: bigint;
    let referralClaim: bigint;
    let credential: SupporterCredential | undefined;
    let creatorProceeds: bigint | undefined;

    if (multicallStatus === "verified") {
      const values = await readMulticallValues(
        client,
        [
          {
            address: input.tier,
            abi: tierAbi,
            functionName: "tokenOf",
            args: [wallet],
          },
          {
            address: input.deployment.usdgAddress,
            abi: tokenAbi,
            functionName: "balanceOf",
            args: [wallet],
          },
          {
            address: multicall3Address,
            abi: multicall3Abi,
            functionName: "getEthBalance",
            args: [wallet],
          },
          {
            address: input.deployment.usdgAddress,
            abi: tokenAbi,
            functionName: "allowance",
            args: [wallet, input.tier],
          },
          {
            address: input.tier,
            abi: tierAbi,
            functionName: "claimableReferral",
            args: [wallet],
          },
        ],
        blockNumber,
      );
      [tokenId, usdgBalance, ethBalance, allowance, referralClaim] = values as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];

      const detailContracts =
        tokenId === 0n ? [] : credentialContracts(input.tier, tokenId);
      const creatorIndex = detailContracts.length;
      if (isSameAddress(wallet, tier.data.creator)) {
        detailContracts.push({
          address: input.tier,
          abi: tierAbi,
          functionName: "creatorProceeds",
        });
      }
      if (detailContracts.length > 0) {
        const detailValues = await readMulticallValues(
          client,
          detailContracts,
          blockNumber,
        );
        credential =
          tokenId === 0n
            ? undefined
            : credentialFromValues(tokenId, detailValues.slice(0, 9));
        creatorProceeds = isSameAddress(wallet, tier.data.creator)
          ? (detailValues[creatorIndex] as bigint)
          : undefined;
      }
    } else {
      [tokenId, usdgBalance, ethBalance, allowance, referralClaim] =
        await Promise.all([
          client.readContract({
            address: input.tier,
            abi: tierAbi,
            functionName: "tokenOf",
            args: [wallet],
            blockNumber,
          }),
          client.readContract({
            address: input.deployment.usdgAddress,
            abi: tokenAbi,
            functionName: "balanceOf",
            args: [wallet],
            blockNumber,
          }),
          client.getBalance({ address: wallet, blockNumber }),
          client.readContract({
            address: input.deployment.usdgAddress,
            abi: tokenAbi,
            functionName: "allowance",
            args: [wallet, input.tier],
            blockNumber,
          }),
          client.readContract({
            address: input.tier,
            abi: tierAbi,
            functionName: "claimableReferral",
            args: [wallet],
            blockNumber,
          }),
        ]);
      [credential, creatorProceeds] = await Promise.all([
        tokenId === 0n
          ? undefined
          : readCredential(client, input.tier, tokenId, blockNumber),
        isSameAddress(wallet, tier.data.creator)
          ? client.readContract({
              address: input.tier,
              abi: tierAbi,
              functionName: "creatorProceeds",
              blockNumber,
            })
          : undefined,
      ]);
    }
    const block = await blockPromise;

    return {
      ...tier,
      data: {
        ...tier.data,
        capturedTimestamp: block.timestamp,
        wallet,
        walletUsdgBalance: usdgBalance,
        walletEthBalance: ethBalance,
        allowance,
        claimableReferral: referralClaim,
        creatorProceeds,
        credential,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}
