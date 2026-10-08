import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";
import { parseAirdropList, distributionHash } from "./airdrop";

const alice = "0x0000000000000000000000000000000000000001";
const bob = "0x0000000000000000000000000000000000000002";

describe("recipient assignments", () => {
  it("parses CSV headers, TSV and integer IDs without number precision loss", () => {
    expect(
      parseAirdropList(
        `\uFEFFaddress,tokenId\r\n${alice},0\n\n${bob}\t9007199254740993`,
        "pairs",
        "",
      ),
    ).toEqual([
      { recipient: alice, tokenId: 0n },
      { recipient: bob, tokenId: 9007199254740993n },
    ]);
  });
  it("maps address-only rows consecutively from an explicit first ID", () => {
    expect(
      parseAirdropList(`address\n${alice}\n${bob}`, "addresses", "42").map(
        (row) => row.tokenId,
      ),
    ).toEqual([42n, 43n]);
    expect(() => parseAirdropList(alice, "addresses", "")).toThrow(
      "whole nonnegative",
    );
  });
  it("allows repeated recipients but never repeated token IDs", () => {
    expect(
      parseAirdropList(`${alice},1\n${alice},2`, "pairs", ""),
    ).toHaveLength(2);
    expect(() =>
      parseAirdropList(`${alice},1\n${bob},01`, "pairs", ""),
    ).toThrow("appears more than once");
  });
  it.each([
    `${alice},,1`,
    `${alice},1.5`,
    `${alice},-1`,
    `${alice},1,extra`,
    `not-an-address,1`,
    `${"0x" + "0".repeat(40)},1`,
    `${alice},${maxUint256 + 1n}`,
  ])("rejects malformed input without dropping rows: %s", (list) => {
    expect(() => parseAirdropList(list, "pairs", "")).toThrow();
  });
  it("rejects consecutive ID overflow and oversized lists", () => {
    expect(() =>
      parseAirdropList(`${alice}\n${bob}`, "addresses", maxUint256.toString()),
    ).toThrow("exceeds uint256");
    expect(() =>
      parseAirdropList(
        Array.from({ length: 10_001 }, (_, i) => `${alice},${i}`).join("\n"),
        "pairs",
        "",
      ),
    ).toThrow("10,000");
  });
  it("binds a receipt commitment to both recipient order and token IDs", () => {
    const rows = parseAirdropList(`${alice},1\n${bob},2`, "pairs", "");
    expect(distributionHash(rows)).not.toEqual(
      distributionHash([...rows].reverse()),
    );
    expect(distributionHash(rows)).not.toEqual(
      distributionHash([{ ...rows[0], tokenId: 3n }, rows[1]]),
    );
  });
});
