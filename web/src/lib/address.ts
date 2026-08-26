import type { Address } from "viem";

export function isSameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}
