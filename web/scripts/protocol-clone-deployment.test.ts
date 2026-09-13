// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  compareRuntime,
  exactLibraryRuntime,
} from "../../scripts/protocol-fork/verify-runtime";
import { verifyRetainedProtocolSources } from "../../scripts/protocol-fork/verify-sources";
import { getCreate2Address, keccak256, stringToHex, type Hex } from "viem";

function proofFixture(): Parameters<typeof verifyRetainedProtocolSources>[0] {
  const from = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;
  const tierCreationCode = "0x60076008" as const;
  const salt = keccak256(stringToHex("Backed By Fans vesting ledger v1"));
  const initCode = "0x6001" as const;
  const address = getCreate2Address({
    from,
    salt,
    bytecodeHash: keccak256(initCode),
  });
  const runtimeTemplate = `0x73${"00".repeat(20)}6001` as Hex;
  const runtime = exactLibraryRuntime(runtimeTemplate, address) as Hex;
  const implementationSalt = keccak256(
    stringToHex("Backed By Fans tier implementation v1"),
  );
  const implementation = {
    role: "tierImplementation",
    salt: implementationSalt,
    initCode: tierCreationCode,
    address: getCreate2Address({
      from,
      salt: implementationSalt,
      bytecodeHash: keccak256(tierCreationCode),
    }),
  };
  return {
    schemaVersion: 3,
    minimumPayments: [{ token: address, minimum: "1000000" }],
    tierCreationCode,
    creationCodeHash: keccak256(tierCreationCode),
    tierLibraries: { "src/libraries/VestingLedger.sol:VestingLedger": address },
    library: {
      salt,
      initCode,
      address,
      runtimeTemplate,
      runtime,
      runtimeCodeHash: keccak256(runtime),
    },
    implementation,
    executorCodeStore: {
      address,
      creationCode: "0x6001",
      runtime: "0x006001",
      runtimeCodeHash: keccak256("0x006001"),
    },
    records: (
      [
        "factory",
        "tierImplementation",
        "buybackVault",
        "burnRouter",
        "mediaStoreFactory",
        "renderer",
        "previewHarness",
      ] as const
    ).map((role) => ({
      role,
      address: role === "tierImplementation" ? implementation.address : address,
      code: "0x6001",
      compiled: { object: "0x6001", immutableReferences: {} },
      exact: true,
      immutables: {},
      compiledMetadata: "",
      onchainMetadata: "",
    })),
  };
}

describe("clone deployment bytecode verification", () => {
  it("rechecks retained deployment/source identities without RPC", () => {
    expect(() => verifyRetainedProtocolSources(proofFixture())).not.toThrow();
  });
  it.each(["library", "implementation", "address", "link", "source"])(
    "rejects changed retained %s evidence",
    (kind) => {
      const proof = proofFixture();
      if (kind === "library") proof.library.initCode = "0x6002";
      if (kind === "implementation") proof.implementation.initCode = "0x6002";
      if (kind === "address") proof.records[1].address = proof.library.address;
      if (kind === "link")
        proof.tierLibraries["src/libraries/VestingLedger.sol:VestingLedger"] =
          `0x${"11".repeat(20)}`;
      if (kind === "source") proof.records[0].compiled.object = "0x6002";
      expect(() => verifyRetainedProtocolSources(proof)).toThrow();
    },
  );
  it("patches only the compiler library self-address placeholder", () => {
    const address = `0x${"12".repeat(20)}`;
    const template = `0x73${"00".repeat(20)}60016002`;
    expect(exactLibraryRuntime(template, address)).toBe(
      `0x73${"12".repeat(20)}60016002`,
    );
    expect(() =>
      exactLibraryRuntime(`0x74${template.slice(4)}`, address),
    ).toThrow();
    expect(() =>
      exactLibraryRuntime(`0x73${"11".repeat(20)}6001`, address),
    ).toThrow();
  });
  it("does not treat differing linked call addresses as immutable placeholders", () => {
    const compiled = `0x73${"12".repeat(20)}6001`;
    const wrongLink = `0x73${"13".repeat(20)}6001`;
    expect(() => compareRuntime(compiled, wrongLink, {})).toThrow("differs");
  });
});
