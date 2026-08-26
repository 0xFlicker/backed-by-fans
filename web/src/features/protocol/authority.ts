import type { Address } from "viem";

import type { ProtocolSnapshot } from "@/features/protocol/protocol-read";
import { isSameAddress } from "@/lib/address";

export function protocolPermissions(
  snapshot: ProtocolSnapshot,
  wallet?: Address,
) {
  return {
    isOwner: wallet ? isSameAddress(wallet, snapshot.owner) : false,
    isPendingOwner: wallet
      ? isSameAddress(wallet, snapshot.pendingOwner)
      : false,
    isFeeRecipient: wallet
      ? isSameAddress(wallet, snapshot.feeRecipient)
      : false,
  };
}
