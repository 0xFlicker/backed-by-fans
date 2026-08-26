import type { Address } from "viem";

import type { ProtocolSnapshot } from "@/features/protocol/protocol-read";

export function protocolPermissions(
  snapshot: ProtocolSnapshot,
  wallet?: Address,
) {
  const address = wallet?.toLowerCase();
  return {
    isOwner: address === snapshot.owner.toLowerCase(),
    isPendingOwner: address === snapshot.pendingOwner.toLowerCase(),
    isFeeRecipient: address === snapshot.feeRecipient.toLowerCase(),
  };
}
