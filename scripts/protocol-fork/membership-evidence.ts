import {
  decodeFunctionData,
  erc20Abi,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
  type Log,
} from "../../web/node_modules/viem";
import { membershipTierAbi } from "../../web/src/contracts";

const same = (a: string | null, b: string | null) =>
  a?.toLowerCase() === b?.toLowerCase();
function requireEvidence(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`Membership evidence: ${message}`);
}
type Branch = {
  executionChainId: number;
  transactions: {
    transaction: { hash: Hex; from: Address; to: Address | null; input: Hex };
    receipt: {
      transactionHash: Hex;
      from: Address;
      to: Address | null;
      status: string;
      logs: Log[];
    };
  }[];
};

/** Reconcile retained mined branches, never application transaction recovery. */
export function reconcileMembershipBranch(input: unknown) {
  const branch = input as Branch;
  requireEvidence(branch.executionChainId === 31337, "wrong execution chain");
  requireEvidence(Array.isArray(branch.transactions), "missing transactions");
  const counts = {
    enrollments: 0,
    stops: 0,
    refills: 0,
    cancellations: 0,
    retirements: 0,
  };
  for (const { transaction, receipt } of branch.transactions) {
    requireEvidence(
      same(transaction.hash, receipt.transactionHash) &&
        same(transaction.from, receipt.from) &&
        same(transaction.to, receipt.to),
      "receipt transaction mismatch",
    );
    const events = parseEventLogs({
      abi: membershipTierAbi,
      logs: receipt.logs,
    });
    const relevant = events.filter((event) =>
      [
        "RefillTargetSet",
        "RefillStopped",
        "MembershipRefilled",
        "MembershipCanceled",
        "MembershipRetired",
      ].includes(event.eventName),
    );
    if (!relevant.length) continue;
    requireEvidence(
      receipt.status === "success" || receipt.status === "0x1",
      "state events in failed receipt",
    );
    for (const event of relevant) {
      const tier = event.address;
      const tierEvents = events.filter((row) => same(row.address, tier));
      const tokenTransfers = parseEventLogs({
        abi: erc20Abi,
        eventName: "Transfer",
        logs: receipt.logs.filter((row) => !same(row.address, tier)),
      });
      const cash = (from: Address, to: Address) =>
        tokenTransfers.filter(
          (row) => same(row.args.from, from) && same(row.args.to, to),
        );
      const paidExactly = (from: Address, to: Address, amount: bigint) => {
        const transfers = cash(from, to);
        return amount === 0n
          ? transfers.length === 0
          : transfers.length === 1 && transfers[0].args.value === amount;
      };
      if (event.eventName === "RefillTargetSet") {
        requireEvidence(
          same(transaction.to, tier),
          "enrollment target mismatch",
        );
        const call = decodeFunctionData({
          abi: membershipTierAbi,
          data: transaction.input,
        });
        requireEvidence(
          call.functionName === "setRefillTarget" &&
            call.args[0] === event.args.tokenId &&
            call.args[1] === event.args.targetSeconds &&
            same(call.args[2], event.args.referralChoice) &&
            same(transaction.from, event.args.owner) &&
            event.args.targetSeconds > 0n,
          "unauthorized enrollment or changed target",
        );
        requireEvidence(
          cash(event.args.owner, tier).length === 0,
          "enrollment collected payment",
        );
        counts.enrollments++;
      } else if (event.eventName === "RefillStopped") {
        counts.stops++;
      } else if (event.eventName === "MembershipRefilled") {
        requireEvidence(same(transaction.to, tier), "refill target mismatch");
        const call = decodeFunctionData({
          abi: membershipTierAbi,
          data: transaction.input,
        });
        requireEvidence(
          call.functionName === "refillMembership" &&
            call.args[0] === event.args.tokenId &&
            event.args.periods > 0n &&
            event.args.periods <= call.args[1] &&
            call.args[2] > 0n &&
            same(transaction.from, event.args.executor),
          "refill bounds or executor mismatch",
        );
        requireEvidence(
          event.args.gross > 0n &&
            paidExactly(event.args.owner, tier, event.args.gross),
          "refill payment differs from owner cash",
        );
        requireEvidence(
          tierEvents.some(
            (row) =>
              row.eventName === "SubscriptionUpdate" &&
              row.args.tokenId === event.args.tokenId &&
              row.args.expiration === event.args.expiration,
          ),
          "refill expiration mismatch",
        );
        counts.refills++;
      } else if (event.eventName === "MembershipCanceled") {
        const {
          canceledGross,
          ownerRefund,
          creatorRetained,
          creatorRetentionBps,
          owner,
          tokenId,
        } = event.args;
        requireEvidence(
          creatorRetentionBps <= 10000 &&
            ownerRefund ===
              (canceledGross * BigInt(10000 - creatorRetentionBps)) / 10000n &&
            ownerRefund + creatorRetained === canceledGross,
          "cancellation split does not conserve",
        );
        requireEvidence(
          paidExactly(tier, owner, ownerRefund),
          "cancellation owner payment mismatch",
        );
        requireEvidence(
          tierEvents.some(
            (row) =>
              row.eventName === "SubscriptionUpdate" &&
              row.args.tokenId === tokenId &&
              row.args.expiration === 0n,
          ),
          "cancellation missing zero expiration",
        );
        requireEvidence(
          tierEvents.some(
            (row) =>
              row.eventName === "MembershipRetired" &&
              row.args.tokenId === tokenId &&
              same(row.args.owner, owner),
          ),
          "cancellation missing retirement",
        );
        counts.cancellations++;
      } else if (event.eventName === "MembershipRetired") {
        requireEvidence(
          tierEvents.some(
            (row) =>
              row.eventName === "Transfer" &&
              row.args.tokenId === event.args.tokenId &&
              same(row.args.from, event.args.owner) &&
              row.args.to === zeroAddress,
          ),
          "retirement missing final-owner burn",
        );
        counts.retirements++;
      }
    }
  }
  return counts;
}
