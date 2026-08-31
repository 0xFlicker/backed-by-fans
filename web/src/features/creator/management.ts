import type { Address } from "viem";

import type { TierManagementSnapshot } from "@/contracts/types";
import { isValidOnchainText, uint64Max } from "@/features/creator/config";
import { isNonZeroAddress, isSameAddress } from "@/lib/address";

const uint256Max = (1n << 256n) - 1n;

export function parseUint64Input(
  value: string,
  options: { allowZero: boolean },
): bigint | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = BigInt(value.trim());
  if (parsed > uint64Max || (!options.allowZero && parsed === 0n)) {
    return undefined;
  }
  return parsed;
}

export function parseTokenId(value: string): bigint | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = BigInt(value.trim());
  return parsed > 0n && parsed <= uint256Max ? parsed : undefined;
}

export function validateSupplyCap(value: string, occupiedSupply: bigint) {
  const parsed = parseUint64Input(value, { allowZero: true });
  if (parsed === undefined)
    return "Enter a whole-number capacity within uint64.";
  if (parsed !== 0n && parsed < occupiedSupply) {
    return `Capacity cannot be lower than the ${occupiedSupply} places currently held.`;
  }
  return undefined;
}

export function validateMutableMetadata(input: {
  description: string;
  externalURI: string;
}) {
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (bytes(input.description) > 500)
    return "Description exceeds 500 UTF-8 bytes.";
  if (!isValidOnchainText(input.description)) {
    return "Description contains unsupported control or text characters.";
  }
  if (bytes(input.externalURI) > 2_048) {
    return "Website URI exceeds 2,048 UTF-8 bytes.";
  }
  if (!isValidOnchainText(input.externalURI)) {
    return "Website URI contains unsupported control or text characters.";
  }
  return undefined;
}

export function managementPermissions(
  snapshot: TierManagementSnapshot,
  wallet?: Address,
) {
  const isOwner = wallet ? isSameAddress(wallet, snapshot.creator) : false;
  const isPendingOwner = wallet
    ? isSameAddress(wallet, snapshot.pendingOwner)
    : false;
  return {
    isOwner,
    isPendingOwner,
    canGrant: isOwner && !snapshot.paused,
    canOperate: isOwner,
    canAcceptOwnership: isPendingOwner,
  };
}

export function validateAddressInput(value: string) {
  return isNonZeroAddress(value.trim())
    ? undefined
    : "Enter a nonzero EVM address.";
}
