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

async function readCredentialMulticallValues(
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
  if (results.length !== contracts.length) {
    throw new Error("The batched membership detail read was incomplete.");
  }
  for (let index = 0; index < 8; index += 1) {
    if (results[index]?.status !== "success") {
      throw new Error("A permanent membership record read failed.");
    }
  }
  const minted =
    results[0]?.status === "success" && (results[0].result as bigint) !== 0n;
  if (minted && results[8]?.status !== "success") {
    throw new Error("The live membership refund read failed.");
  }
  if (contracts.length > 9 && results[9]?.status !== "success") {
    throw new Error("The creator proceeds read failed.");
  }

  const values = results.map((result) =>
    result.status === "success" ? result.result : undefined,
  );
  if (!minted) values[8] = [0n, 0n];
  return values;
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
    abi: membershipTierAbi,
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
  const [active, occupied, time, referral] = await Promise.all([
    client.readContract({
      address: input.tier,
      abi: membershipTierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: membershipTierAbi,
      functionName: "isOccupied",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: membershipTierAbi,
      functionName: "timeBalances",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
    client.readContract({
      address: input.tier,
      abi: membershipTierAbi,
      functionName: "referralOf",
      args: [tokenId],
      blockNumber: input.blockNumber,
    }),
  ]);
  return {
    tokenId,
    expiration: time[2] + time[0] + time[1],
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
  wallet: Address,
  blockNumber: bigint,
): Promise<SupporterCredential> {
  const [
    balance,
    active,
    occupied,
    time,
    referral,
    shares,
    reward,
    rewardEligible,
  ] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "balanceOf",
      args: [wallet],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "isOccupied",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "timeBalances",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "referralOf",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "sharesOf",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "claimableReward",
      args: [tokenId],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "rewardEligible",
      args: [tokenId],
      blockNumber,
    }),
  ]);
  const refund =
    balance !== 0n
      ? await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "previewRefund",
          args: [tokenId],
          blockNumber,
        })
      : ([0n, 0n] as const);
  return credentialFromValues(tokenId, wallet, [
    balance,
    active,
    occupied,
    time,
    referral,
    shares,
    reward,
    rewardEligible,
    refund,
  ]);
}

function credentialFromValues(
  tokenId: bigint,
  wallet: Address,
  values: unknown[],
) {
  const [
    balance,
    active,
    occupied,
    time,
    referral,
    shares,
    reward,
    rewardEligible,
    refund,
  ] = values;
  const timeValues = time as readonly bigint[];
  return {
    tokenId,
    owner: wallet,
    minted: (balance as bigint) !== 0n,
    active: active as boolean,
    occupied: occupied as boolean,
    expiration: timeValues[2] + timeValues[0] + timeValues[1],
    paidSeconds: timeValues[0],
    grantSeconds: timeValues[1],
    shares: shares as bigint,
    rewardEligible: rewardEligible as boolean,
    claimableReward: reward as bigint,
    refundableGross: (refund as readonly bigint[])[0],
    referralStatus: referralStatus((referral as readonly [number, Address])[0]),
    referrer: (referral as readonly [number, Address])[1],
  } satisfies SupporterCredential;
}

function credentialContracts(
  tier: Address,
  tokenId: bigint,
  wallet: Address,
): Record<string, unknown>[] {
  return [
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "balanceOf",
      args: [wallet],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "isOccupied",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "timeBalances",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "referralOf",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "sharesOf",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "claimableReward",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "rewardEligible",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
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
    let paymentTokenBalance: bigint;
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
            abi: membershipTierAbi,
            functionName: "tokenOf",
            args: [wallet],
          },
          {
            address: tier.data.paymentToken,
            abi: erc20Abi,
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
            address: tier.data.paymentToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet, input.tier],
          },
          {
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "claimableReferral",
            args: [wallet],
          },
        ],
        blockNumber,
      );
      [tokenId, paymentTokenBalance, ethBalance, allowance, referralClaim] =
        values as [bigint, bigint, bigint, bigint, bigint];

      const detailContracts =
        tokenId === 0n ? [] : credentialContracts(input.tier, tokenId, wallet);
      const creatorIndex = detailContracts.length;
      if (isSameAddress(wallet, tier.data.creator)) {
        detailContracts.push({
          address: input.tier,
          abi: membershipTierAbi,
          functionName: "creatorProceeds",
        });
      }
      if (detailContracts.length > 0) {
        const detailValues =
          tokenId === 0n
            ? await readMulticallValues(client, detailContracts, blockNumber)
            : await readCredentialMulticallValues(
                client,
                detailContracts,
                blockNumber,
              );
        if (tokenId !== 0n) {
          const credentialValues = detailValues.slice(0, 9);
          credential = credentialFromValues(tokenId, wallet, credentialValues);
        }
        creatorProceeds = isSameAddress(wallet, tier.data.creator)
          ? (detailValues[creatorIndex] as bigint)
          : undefined;
      }
    } else {
      [tokenId, paymentTokenBalance, ethBalance, allowance, referralClaim] =
        await Promise.all([
          client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "tokenOf",
            args: [wallet],
            blockNumber,
          }),
          client.readContract({
            address: tier.data.paymentToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
            blockNumber,
          }),
          client.getBalance({ address: wallet, blockNumber }),
          client.readContract({
            address: tier.data.paymentToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet, input.tier],
            blockNumber,
          }),
          client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "claimableReferral",
            args: [wallet],
            blockNumber,
          }),
        ]);
      [credential, creatorProceeds] = await Promise.all([
        tokenId === 0n
          ? undefined
          : readCredential(client, input.tier, tokenId, wallet, blockNumber),
        isSameAddress(wallet, tier.data.creator)
          ? client.readContract({
              address: input.tier,
              abi: membershipTierAbi,
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
        walletPaymentTokenBalance: paymentTokenBalance,
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
