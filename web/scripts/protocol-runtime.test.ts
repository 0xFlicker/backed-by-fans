// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  compareRuntime,
  type ImmutableReferences,
} from "../../scripts/protocol-fork/verify-runtime";
const metadata = (hash: string) =>
  `a2646970667358221220${hash.repeat(64)}64736f6c63430008230033`;
describe("independent runtime matching", () => {
  it("distinguishes exact code from metadata-only differences", () => {
    expect(
      compareRuntime(`60fe${metadata("1")}`, `60fe${metadata("1")}`, {}).exact,
    ).toBe(true);
    expect(
      compareRuntime(`60fe${metadata("1")}`, `60fe${metadata("2")}`, {}).exact,
    ).toBe(false);
    expect(() =>
      compareRuntime(`60fe${metadata("1")}`, `61fe${metadata("2")}`, {}),
    ).toThrow("Executable bytecode differs");
  });
  it("allows only compiler-reported immutable slots with consistent values", () => {
    const compiled = `7f${"00".repeat(32)}7f${"00".repeat(32)}fe`;
    const onchain = `7f${"ab".repeat(32)}7f${"ab".repeat(32)}fe`;
    const refs = {
      "7": [
        { start: 1, length: 32 },
        { start: 34, length: 32 },
      ],
    };
    expect(compareRuntime(compiled, onchain, refs).immutables["7"]).toBe(
      `0x${"ab".repeat(32)}`,
    );
    expect(() =>
      compareRuntime(compiled, onchain.replace(/^7f/, "60"), refs),
    ).toThrow("Executable bytecode differs");
    expect(() =>
      compareRuntime(compiled, onchain.replace(/abfe$/, "aafe"), refs),
    ).toThrow("Inconsistent");
    expect(() => compareRuntime(onchain, onchain, refs)).toThrow("placeholder");
  });
  it("rejects masking metadata, overlapping slots and malformed ranges", () => {
    const code = `7f${"00".repeat(32)}fe${metadata("1")}`;
    for (const refs of [
      { x: [{ start: 34, length: 32 }] },
      { x: [{ start: 1, length: 31 }] },
      { x: [{ start: -1, length: 32 }] },
      { x: [{ start: 1, length: 32 }], y: [{ start: 1, length: 32 }] },
    ] as ImmutableReferences[])
      expect(() => compareRuntime(code, code, refs)).toThrow();
    expect(() => compareRuntime("not hex", "00", {})).toThrow(
      "Invalid bytecode",
    );
    expect(() => compareRuntime("60feabcd0002", "60feffff0002", {})).toThrow(
      "Executable bytecode differs",
    );
  });
});
