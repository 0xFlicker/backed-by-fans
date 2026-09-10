// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  compareRuntime,
  exactLibraryRuntime,
  verifyTierCodeStores,
} from "../../scripts/protocol-fork/verify-runtime";
import { verifyRetainedProtocolSources } from "../../scripts/protocol-fork/verify-sources";
import {
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";

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
  const stores = ["0x006007", "0x006008"].map((value, index) => {
    const runtime = value as Hex;
    const role = index ? "tierCodeStoreB" : "tierCodeStoreA";
    const salt = keccak256(
      stringToHex(`Backed By Fans tier code ${index ? "B" : "A"} v1`),
    );
    const initCode = concatHex([
      "0x6009",
      encodeAbiParameters([{ type: "bytes" }], [`0x${runtime.slice(4)}`]),
    ]);
    return {
      role,
      salt,
      initCode,
      runtime,
      address: getCreate2Address({
        from,
        salt,
        bytecodeHash: keccak256(initCode),
      }),
      runtimeCodeHash: keccak256(runtime),
    };
  });
  return {
    schemaVersion: 2,
    minimumPayments: [{ token: address, minimum: "1000000" }],
    tierCreationCode,
    creationCodeHash: keccak256(tierCreationCode),
    tierLibraries: { "src/libraries/VestingLedger.sol:VestingLedger": address },
    storeCreationCode: "0x6009",
    library: {
      salt,
      initCode,
      address,
      runtimeTemplate,
      runtime,
      runtimeCodeHash: keccak256(runtime),
    },
    stores,
    executorCodeStore: {
      address,
      creationCode: "0x6001",
      runtime: "0x006001",
      runtimeCodeHash: keccak256("0x006001"),
    },
    records: (
      [
        "factory",
        "tierDeployer",
        "buybackVault",
        "burnRouter",
        "mediaStoreFactory",
        "renderer",
        "previewHarness",
      ] as const
    ).map((role) => ({
      role,
      address,
      code: "0x6001",
      compiled: { object: "0x6001", immutableReferences: {} },
      exact: true,
      immutables: {},
      compiledMetadata: "",
      onchainMetadata: "",
    })),
  };
}

describe("split deployment bytecode verification", () => {
  it("rechecks retained deployment/source identities without RPC", () => {
    expect(() => verifyRetainedProtocolSources(proofFixture())).not.toThrow();
  });
  it.each(["library", "store", "link", "source"])(
    "rejects changed retained %s evidence",
    (kind) => {
      const proof = proofFixture();
      if (kind === "library") proof.library.initCode = "0x6002";
      if (kind === "store") proof.stores[0].initCode = "0x6002";
      if (kind === "link")
        proof.tierLibraries["src/libraries/VestingLedger.sol:VestingLedger"] =
          `0x${"11".repeat(20)}`;
      if (kind === "source") proof.records[0].compiled.object = "0x6002";
      expect(() => verifyRetainedProtocolSources(proof)).toThrow();
    },
  );
  it("reconstructs odd-length code using the exact first-half split", () => {
    expect(
      verifyTierCodeStores("0x6001600203", "0x006001", "0x00600203"),
    ).toEqual({
      creationCodeLength: 5,
      storeALength: 3,
      storeBLength: 4,
    });
  });
  it.each([
    ["0x", "0x00600203"],
    ["0x016001", "0x00600203"],
    ["0x006001", "0x006002"],
    ["0x00600203", "0x006001"],
    ["0x006001", "0x00600204"],
  ])(
    "rejects absent, executable, truncated, reordered or changed stores",
    (a, b) => {
      expect(() => verifyTierCodeStores("0x6001600203", a, b)).toThrow();
    },
  );
  it("never strips trailing metadata from raw stores", () => {
    const metadata = `a164736f6c6343000824000a`;
    const creation = `0x6001${metadata}`;
    const split = Math.floor((creation.length - 2) / 4) * 2 + 2;
    const a = `0x00${creation.slice(2, split)}`;
    const b = `0x00${creation.slice(split)}`;
    expect(() => verifyTierCodeStores(creation, a, b)).not.toThrow();
    expect(() =>
      verifyTierCodeStores(creation, a, `${b.slice(0, -2)}0b`),
    ).toThrow();
  });
  it("enforces the unchanged two-store capacity", () => {
    expect(() =>
      verifyTierCodeStores(`0x${"00".repeat(49151)}`, "0x00", "0x00"),
    ).toThrow("bounds");
  });
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
