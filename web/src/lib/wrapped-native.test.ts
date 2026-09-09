import { describe, expect, it } from "vitest";
import { getAddress, zeroAddress } from "viem";
import sources from "../../../contracts/external/verification/4663/sources.json";
import { isWrappedNative } from "./wrapped-native";

describe("verified native wrapper", () => {
  it("recognizes only the verified mainnet dependency and its local fork", () => {
    const weth = getAddress(sources.records.weth.address);
    expect(isWrappedNative(4663, weth)).toBe(true);
    expect(isWrappedNative(31337, weth)).toBe(true);
    expect(isWrappedNative(46630, weth)).toBe(false);
    expect(isWrappedNative(1, weth)).toBe(false);
    expect(isWrappedNative(4663, zeroAddress)).toBe(false);
  });
});
