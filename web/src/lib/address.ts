import { getAddress, isAddress, zeroAddress, type Address } from "viem";

export function isSameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

export function isNonZeroAddress(value: string): value is Address {
  return isAddress(value) && getAddress(value) !== zeroAddress;
}
