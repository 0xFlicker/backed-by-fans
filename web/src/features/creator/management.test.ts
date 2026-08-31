import { getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import type { TierManagementSnapshot } from "@/contracts/types";
import {
  managementPermissions,
  parseTokenId,
  validateAddressInput,
  validateMutableMetadata,
  validateSupplyCap,
} from "@/features/creator/management";

const owner = getAddress("0x1111111111111111111111111111111111111111");
const pending = getAddress("0x2222222222222222222222222222222222222222");
const base = {
  creator: owner,
  pendingOwner: pending,
  paused: true,
} as TierManagementSnapshot;

describe("creator management constraints", () => {
  it("keeps revoke, refund, and owner operations available while grants pause", () => {
    expect(managementPermissions(base, owner)).toMatchObject({
      isOwner: true,
      canGrant: false,
      canOperate: true,
    });
  });

  it("moves visible operating authority only when the pending owner accepts", () => {
    expect(managementPermissions(base, pending)).toMatchObject({
      isOwner: false,
      isPendingOwner: true,
      canAcceptOwnership: true,
      canOperate: false,
    });
    expect(
      managementPermissions(
        { ...base, creator: pending, pendingOwner: zeroAddress },
        pending,
      ),
    ).toMatchObject({ isOwner: true, canOperate: true });
  });

  it("allows unlimited capacity but rejects a finite cap below occupancy", () => {
    expect(validateSupplyCap("0", 12n)).toBeUndefined();
    expect(validateSupplyCap("11", 12n)).toMatch(/cannot be lower/i);
    expect(validateSupplyCap("12", 12n)).toBeUndefined();
  });

  it("accepts the full positive uint256 range for ERC-721 token ids", () => {
    const maximum = (1n << 256n) - 1n;
    expect(parseTokenId(maximum.toString())).toBe(maximum);
    expect(parseTokenId("0")).toBeUndefined();
    expect(parseTokenId((maximum + 1n).toString())).toBeUndefined();
  });

  it("rejects the zero address before an admin write is enabled", () => {
    expect(validateAddressInput(zeroAddress)).toMatch(/nonzero/i);
    expect(validateAddressInput(owner)).toBeUndefined();
  });

  it("limits only the remaining mutable description and website metadata", () => {
    expect(
      validateMutableMetadata({ description: "A room", externalURI: "" }),
    ).toBeUndefined();
    expect(
      validateMutableMetadata({
        description: "A room",
        externalURI: "x".repeat(2_049),
      }),
    ).toMatch(/website URI/i);
    expect(
      validateMutableMetadata({
        description: "bad\u0001text",
        externalURI: "",
      }),
    ).toMatch(/unsupported/i);
  });
});
