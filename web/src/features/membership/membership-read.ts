import { zeroAddress, type Address, type PublicClient } from "viem";

import { tierAbi, tokenAbi } from "@/contracts/abis";
import type {
  ReferralStatus,
  SupporterCredential,
  TierSupporterSnapshot,
} from "@/contracts/types";
import { isSameAddress } from "@/lib/address";
import type { ReadyDeployment } from "@/lib/config";
import { readTierSnapshotState } from "@/lib/direct-read";
import { classifyReadError, type ReadState } from "@/lib/read-state";

function referralStatus(value: number): ReferralStatus {
  if (value === 1) return "locked-none";
  if (value === 2) return "locked-address";
  return "unset";
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
  const [
    owner,
    active,
    occupied,
    expiration,
    time,
    referral,
    shares,
    claimableReward,
    refund,
  ] = await Promise.all([
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "ownerOf",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "isOccupied",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "expiresAt",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "timeBalances",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "referralOf",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "sharesOf",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "claimableReward",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: tierAbi,
      functionName: "previewRefund",
      args: [tokenId],
      blockNumber,
    }),
  ]);

  return {
    tokenId,
    owner,
    active,
    occupied,
    expiration,
    paidSeconds: time[0],
    grantSeconds: time[1],
    shares,
    claimableReward,
    refundableGross: refund[0],
    referralStatus: referralStatus(referral[0]),
    referrer: referral[1],
  };
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
    const [
      block,
      [tokenId, usdgBalance, ethBalance, allowance, referralClaim],
    ] = await Promise.all([
      blockPromise,
      Promise.all([
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
      ]),
    ]);
    const [credential, creatorProceeds] = await Promise.all([
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
