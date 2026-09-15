import { expect, it } from "vitest";
import { zeroAddress } from "viem";
import { operatorRoute } from "./operator-route";
import inputs from "../../../../specs/003-protocol-buyback-burn/evidence/pinned-preflight-inputs-20260907.json";
import { getAddress } from "viem";
it("selects existing venue routes without stored public policy", () => {
  expect(operatorRoute(31337, zeroAddress)?.pools).toEqual([]);
  for (const asset of inputs.assets) {
    const result = operatorRoute(31337, getAddress(asset.address));
    expect(result?.pools.length).toBe(
      asset.kind === "usdg" ? 1 : asset.kind === "stock" ? 2 : 0,
    );
  }
});
it("does not guess unsupported currencies or networks", () => {
  expect(
    operatorRoute(31337, "0x1111111111111111111111111111111111111111"),
  ).toBeUndefined();
  expect(operatorRoute(46630, zeroAddress)).toBeUndefined();
});
