import { expect, it } from "vitest";
import { zeroAddress } from "viem";
import { membershipPaymentCall, positionKey } from "./state";

const input = {
  now: 100n,
  periods: 2n,
  gross: 20n,
  pricePerPeriod: 10n,
  referralChoice: zeroAddress,
};
it("always creates a new position when creation is explicitly selected", () => {
  expect(membershipPaymentCall({ ...input, intent: { kind: "new" } })).toEqual({
    functionName: "createMembership",
    args: [2n, zeroAddress],
  });
});
it("targets exactly the selected live token for fixed-price renewal", () => {
  expect(
    membershipPaymentCall({
      ...input,
      intent: { kind: "renew", tokenId: 7n, expiration: 101n },
    }),
  ).toEqual({ functionName: "renewMembership", args: [7n, 2n, zeroAddress] });
});
it("rejects expired renewal without silently choosing creation", () => {
  expect(() =>
    membershipPaymentCall({
      ...input,
      intent: { kind: "renew", tokenId: 7n, expiration: 100n },
    }),
  ).toThrow(/ended/);
});
it("keeps zero-value contribution creation separate from renewal", () => {
  expect(
    membershipPaymentCall({
      ...input,
      pricePerPeriod: 0n,
      gross: 0n,
      intent: { kind: "new" },
    }),
  ).toEqual({
    functionName: "createContributionMembership",
    args: [0n, zeroAddress],
  });
  expect(
    membershipPaymentCall({
      ...input,
      pricePerPeriod: 0n,
      gross: 0n,
      intent: { kind: "renew", tokenId: 8n, expiration: 200n },
    }),
  ).toEqual({
    functionName: "renewContributionMembership",
    args: [8n, 0n, zeroAddress],
  });
});
it("keys positions by chain, tier and token rather than wallet or tier alone", () => {
  expect(
    new Set([
      positionKey(1, zeroAddress, 1n),
      positionKey(1, zeroAddress, 2n),
      positionKey(2, zeroAddress, 1n),
    ]).size,
  ).toBe(3);
});
