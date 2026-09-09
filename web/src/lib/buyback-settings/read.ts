import { zeroAddress, type PublicClient } from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";
import {
  readPublicBuybacks,
  type PublicBuybacks,
} from "@/features/protocol/protocol-read";
import type { DeploymentAvailability } from "@/lib/config";
import { quoteMarket, readMarketState } from "../buyback-policy/live";

export async function readCalculator(
  client: PublicClient,
  deployment: DeploymentAvailability,
) {
  const state = await readPublicBuybacks(client, deployment);
  if (state.status !== "valid") throw new Error(state.label);
  if (state.data.assetCoverage.nextOffset !== null)
    throw new Error("This calculator supports up to 100 canonical currencies.");
  const { factory, vault, tierCount } = state.data;
  const blockNumber = state.capturedBlock;
  if (tierCount > 1000n)
    throw new Error(
      "This local review is limited to 1,000 tiers. Use a bounded protocol index before reviewing a larger deployment.",
    );
  const fees = new Map<string, { earned: bigint; future: bigint }>();
  let membersRead = 0;
  for (let offset = 0n; offset < tierCount; offset += 100n) {
    const tiers = await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "tiers",
      args: [offset, 100n],
      blockNumber,
    });
    for (const tier of tiers) {
      const [paymentToken, earnedHeld, count] = await Promise.all([
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "paymentToken",
          blockNumber,
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeEarnedHeld",
          blockNumber,
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "totalMinted",
          blockNumber,
        }),
      ]);
      const canonical = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "canonicalAsset",
        args: [paymentToken],
        blockNumber,
      });
      const amounts = fees.get(canonical.toLowerCase()) ?? {
        earned: 0n,
        future: 0n,
      };
      amounts.earned += earnedHeld;
      membersRead += Number(count);
      if (membersRead > 5000)
        throw new Error(
          "This local review is limited to 5,000 memberships; funds were not silently omitted.",
        );
      for (let start = 1n; start <= count; start += 50n) {
        const length = Number(
          count - start + 1n < 50n ? count - start + 1n : 50n,
        );
        const members = await Promise.all(
          Array.from({ length }, (_, i) =>
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "protocolFeeState",
              args: [start + BigInt(i)],
              blockNumber,
            }),
          ),
        );
        for (const member of members) {
          amounts.earned += member.uncheckpointedEarned;
          amounts.future += member.unearned;
        }
      }
      fees.set(canonical.toLowerCase(), amounts);
    }
  }
  return { ...state, fees };
}

export async function estimateAsset(
  client: PublicClient,
  snapshot: PublicBuybacks,
  asset: PublicBuybacks["assets"][number],
  blockNumber: bigint,
  amount: bigint,
) {
  if (asset.status !== "valid" || amount <= 0n)
    throw new Error("Choose a positive batch for an available currency.");
  if (asset.asset.toLowerCase() === snapshot.protocolToken.toLowerCase())
    throw new Error(
      "Protocol tokens burn directly; no purchase settings are needed.",
    );
  const market = await readMarketState(client, {
    vault: snapshot.vault,
    asset: asset.asset,
    protocolToken: snapshot.protocolToken,
    blockNumber,
  });
  const legs = await quoteMarket(client, market, amount);
  const nativeLeg = legs.find((leg) => leg.input === zeroAddress);
  if (!nativeLeg) throw new Error("This route has no native ETH purchase leg.");
  const bucket =
    asset.data.membership.available > 0n
      ? 0
      : asset.data.donation.available > 0n
        ? 1
        : undefined;
  const eligibility =
    bucket === undefined ? undefined : asset.data.eligibility[bucket];
  let gasWei: bigint | undefined;
  let gasNote =
    "Gas unavailable until a released batch is eligible under current settings. Sequential rehearsal estimates proposed settings without changing this vault.";
  if (
    bucket !== undefined &&
    eligibility?.status === "valid" &&
    eligibility.data.status === 0
  ) {
    const [gas, gasPrice] = await Promise.all([
      client.estimateContractGas({
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "process",
        args: [
          asset.asset,
          bucket,
          eligibility.data.maxInput,
          eligibility.data.revision,
          snapshot.timestamp + 120n,
        ],
        account: snapshot.owners[0],
        blockNumber,
      }),
      client.getGasPrice(),
    ]);
    gasWei = gas * gasPrice;
    gasNote =
      "Gas estimated against the current eligible batch; actual execution costs may change.";
  }
  return {
    burned: legs.at(-1)!.outputRaw,
    nativeValueWei: nativeLeg.inputRaw,
    gasWei,
    gasNote,
    amount,
    legs,
  };
}
