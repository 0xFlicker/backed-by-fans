import {
  erc20Abi,
  multicall3Abi,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { membershipTierAbi } from "@/contracts";
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
  readTierAccounting,
  verifyMulticall3,
} from "@/lib/direct-read";
import { classifyReadError, type ReadState } from "@/lib/read-state";

function referralStatus(value: number): ReferralStatus {
  return value === 1 ? "locked-none" : value === 2 ? "locked-address" : "unset";
}

async function readValues(
  client: PublicClient,
  contracts: Record<string, unknown>[],
  blockNumber: bigint,
  batched: boolean,
) {
  if (!batched)
    return Promise.all(
      contracts.map((contract) =>
        client.readContract({ ...contract, blockNumber } as never),
      ),
    );
  const results = (await client.multicall({
    contracts: contracts as never,
    allowFailure: true,
    blockNumber,
    multicallAddress: multicall3Address,
  })) as Array<
    { status: "success"; result: unknown } | { status: "failure"; error: Error }
  >;
  if (
    results.length !== contracts.length ||
    results.some((result) => result.status !== "success")
  ) {
    throw new Error(
      "A required membership read failed or returned an incomplete batch.",
    );
  }
  return results.map((result) =>
    result.status === "success" ? result.result : undefined,
  );
}

/** Reads one explicit position at one block. A wallet's NFT count is never ownership proof. */
export async function readMembershipPosition(
  client: PublicClient,
  input: {
    tier: Address;
    tokenId: bigint;
    owner: Address;
    blockNumber: bigint;
    batched?: boolean;
  },
): Promise<SupporterCredential> {
  const common = {
    address: input.tier,
    abi: membershipTierAbi,
    args: [input.tokenId],
  };
  const values = await readValues(
    client,
    [
      { ...common, functionName: "ownerOf" },
      { ...common, functionName: "isActiveToken" },
      { ...common, functionName: "isOccupied" },
      { ...common, functionName: "timeBalances" },
      { ...common, functionName: "referralOf" },
      { ...common, functionName: "sharesOf" },
      { ...common, functionName: "claimableReward" },
      { ...common, functionName: "rewardEligible" },
    ],
    input.blockNumber,
    input.batched ?? false,
  );
  const [owner, active, occupied, time, referral, shares, reward, eligible] =
    values;
  if (!isSameAddress(owner as Address, input.owner)) {
    throw new Error("This membership's owner changed. Refresh your selection.");
  }
  const [paidSeconds, grantSeconds, checkpoint] = time as readonly bigint[];
  const [status, referrer] = referral as readonly [number, Address];
  return {
    tokenId: input.tokenId,
    owner: owner as Address,
    minted: true,
    active: active as boolean,
    occupied: occupied as boolean,
    expiration: checkpoint + paidSeconds + grantSeconds,
    paidSeconds,
    grantSeconds,
    shares: shares as bigint,
    rewardEligible: eligible as boolean,
    claimableReward: reward as bigint,
    referralStatus: referralStatus(status),
    referrer,
  };
}

export type GiftRecipientState = Pick<
  SupporterCredential,
  | "tokenId"
  | "expiration"
  | "active"
  | "occupied"
  | "paidSeconds"
  | "referralStatus"
  | "referrer"
>;

export async function readGiftRecipientState(
  client: PublicClient,
  input: {
    tier: Address;
    recipient: Address;
    tokenId?: bigint;
    blockNumber: bigint;
  },
): Promise<GiftRecipientState> {
  if (!input.tokenId)
    return {
      tokenId: 0n,
      expiration: 0n,
      active: false,
      occupied: false,
      paidSeconds: 0n,
      referralStatus: "unset",
      referrer: zeroAddress,
    };
  return readMembershipPosition(client, {
    tier: input.tier,
    tokenId: input.tokenId,
    owner: input.recipient,
    blockNumber: input.blockNumber,
  });
}

export async function readTierSupporterState(
  client: PublicClient,
  input: {
    tier: Address;
    deployment: ReadyDeployment;
    wallet?: Address;
    tokenId?: bigint;
    ownerOffset?: bigint;
  },
): Promise<ReadState<TierSupporterSnapshot>> {
  const tier = await readTierSnapshotState(client, input);
  if (tier.status !== "valid" && tier.status !== "stale") return tier;
  try {
    const blockNumber = tier.capturedBlock;
    const blockPromise = client.getBlock({ blockNumber });
    if (!input.wallet)
      return {
        ...tier,
        data: {
          ...tier.data,
          capturedTimestamp: (await blockPromise).timestamp,
        },
      };
    const wallet = input.wallet;
    const tokenId = input.tokenId ?? 0n;
    const ownerOffset = input.ownerOffset ?? 0n;
    const batched =
      (await verifyMulticall3(client, blockNumber)) === "verified";
    const common = { address: input.tier, abi: membershipTierAbi };
    const walletContracts = [
      {
        ...common,
        functionName: "tokensOfOwner",
        args: [wallet, ownerOffset, 100n],
      },
      {
        address: tier.data.paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet],
      },
      {
        address: tier.data.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet, input.tier],
      },
      { ...common, functionName: "claimableReferral", args: [wallet] },
    ];
    if (batched)
      walletContracts.push({
        address: multicall3Address,
        abi: multicall3Abi,
        functionName: "getEthBalance",
        args: [wallet],
      } as never);
    const [
      walletValues,
      credential,
      creatorProceeds,
      ethBalance,
      block,
      vesting,
      totalEligibleRewardShares,
    ] = await Promise.all([
      readValues(client, walletContracts, blockNumber, batched),
      tokenId === 0n
        ? undefined
        : readMembershipPosition(client, {
            tier: input.tier,
            tokenId,
            owner: wallet,
            blockNumber,
            batched,
          }),
      isSameAddress(wallet, tier.data.creator)
        ? client.readContract({
            ...common,
            functionName: "creatorProceeds",
            blockNumber,
          })
        : undefined,
      batched ? undefined : client.getBalance({ address: wallet, blockNumber }),
      blockPromise,
      readTierAccounting(client, {
        tier: input.tier,
        tokenId,
        beneficiary: wallet,
        referrer: wallet,
        blockNumber,
      }).then(
        (data) => ({ data, error: undefined }),
        (error) => ({ data: undefined, error: classifyReadError(error).label }),
      ),
      client.readContract({
        ...common,
        functionName: "totalRewardShares",
        blockNumber,
      }),
    ]);
    const [ownerPage, paymentBalance, allowance, referralClaim, batchedEth] =
      walletValues;
    return {
      ...tier,
      data: {
        ...tier.data,
        capturedTimestamp: block.timestamp,
        wallet,
        ownerOffset,
        ownerPage: ownerPage as TierSupporterSnapshot["ownerPage"],
        credential,
        walletPaymentTokenBalance: paymentBalance as bigint,
        walletEthBalance: batched ? (batchedEth as bigint) : ethBalance,
        allowance: allowance as bigint,
        claimableReferral: referralClaim as bigint,
        creatorProceeds,
        vesting: vesting.data,
        vestingError: vesting.error,
        totalEligibleRewardShares,
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
