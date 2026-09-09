import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { protocolPermissions } from "@/features/protocol/authority";
import type { ProtocolSnapshot } from "@/features/protocol/protocol-read";

const owner = getAddress("0x1111111111111111111111111111111111111111");
const pending = getAddress("0x2222222222222222222222222222222222222222");
const tokenHolder = getAddress("0x3333333333333333333333333333333333333333");
const snapshot = {
  owner,
  pendingOwner: pending,
} as ProtocolSnapshot;

describe("protocol authority separation", () => {
  it("exposes configuration authority without a fee withdrawal permission", () => {
    expect(protocolPermissions(snapshot, owner)).toMatchObject({
      isOwner: true,
    });
    expect(protocolPermissions(snapshot, tokenHolder)).toMatchObject({
      isOwner: false,
    });
    expect(protocolPermissions(snapshot, owner)).not.toHaveProperty(
      "isFeeRecipient",
    );
  });

  it("lets only the nominated wallet accept pending ownership", () => {
    expect(protocolPermissions(snapshot, pending).isPendingOwner).toBe(true);
    expect(protocolPermissions(snapshot, owner).isPendingOwner).toBe(false);
  });
});
