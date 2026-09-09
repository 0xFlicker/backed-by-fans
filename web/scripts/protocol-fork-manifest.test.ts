import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import schema from "../../scripts/protocol-fork/manifest.schema.json";
import { originPin } from "../../scripts/protocol-fork/origin";

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
const hash = `0x${"1".repeat(64)}`;
const sourceHash = "2".repeat(64);
const pending = {
  status: "not-run",
  evidenceClass: "none",
  artifacts: [],
  reason: "Not executed",
};

function preflight() {
  return {
    schemaVersion: 1,
    runId: "fixture-one",
    mode: "preflight",
    status: "failed",
    source: { commit: "a".repeat(40), dirty: true, snapshotSha256: sourceHash },
    tools: [{ name: "forge", version: "1.7.1" }],
    dependencies: [],
    origin: {
      chainId: 4663,
      blockNumber: originPin.blockNumber,
      blockHash: hash,
    },
    execution: { chainId: 31337, rpcUrl: "http://127.0.0.1:8547" },
    safe: null,
    deployments: [],
    launch: null,
    assets: [],
    funding: [],
    receipts: [],
    gates: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`G${i + 1}`, { ...pending }]),
    ),
    acceptance: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `SC-${String(i + 1).padStart(3, "0")}`,
        { ...pending },
      ]),
    ),
    scenarios: [],
  };
}

describe("retained fork manifest", () => {
  it("records incomplete preflight honestly without inventing deployments", () => {
    expect(validate(preflight()), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(["blockNumber", "blockHash"])(
    "requires pinned origin %s",
    (field) => {
      const value = preflight();
      delete (value.origin as Record<string, unknown>)[field];
      expect(validate(value)).toBe(false);
    },
  );

  it("requires a source snapshot even when a commit is recorded", () => {
    const value = preflight();
    delete (value.source as Record<string, unknown>).snapshotSha256;
    expect(validate(value)).toBe(false);
  });

  it("rejects origin-chain execution, upstream credentials, and unowned artifact paths", () => {
    for (const rpcUrl of [
      "https://upstream.example/key",
      "http://user:secret@127.0.0.1:8547",
    ]) {
      const value = preflight();
      value.execution.rpcUrl = rpcUrl;
      expect(validate(value)).toBe(false);
    }
    const value = preflight();
    value.execution.chainId = 4663;
    expect(validate(value)).toBe(false);
    value.execution.chainId = 31337;
    Object.assign(value.gates.G1, { artifacts: ["../other-run/proof.json"] });
    expect(validate(value)).toBe(false);
  });

  it("rejects missing gates and success without attributable artifacts", () => {
    const value = preflight();
    delete value.gates.G3;
    expect(validate(value)).toBe(false);
    value.gates.G3 = {
      ...pending,
      status: "passed",
      evidenceClass: "authentic-fork",
      reason: "Claimed pass",
    };
    expect(validate(value)).toBe(false);
  });

  it("cannot promote a preflight or synthetic result to a complete authentic run", () => {
    const value = preflight();
    value.mode = "run";
    value.status = "passed";
    expect(validate(value)).toBe(false);
    value.mode = "preflight";
    value.status = "failed";
    Object.assign(value.acceptance["SC-001"], {
      status: "passed",
      evidenceClass: "synthetic",
      artifacts: ["test/unit.json"],
    });
    expect(validate(value)).toBe(false);
  });

  it("rejects secret-bearing or unrecognized manifest fields", () => {
    expect(
      validate({ ...preflight(), privateKey: "should-never-be-retained" }),
    ).toBe(false);
  });
});

it("validates the bootstrap export without promoting it to receipt evidence", () => {
  const validateBootstrap = new Ajv({ strict: true }).compile({
    $ref: "#/definitions/bootstrap",
    definitions: schema.definitions,
  });
  const address = "0x1111111111111111111111111111111111111111";
  const properties = Object.keys(schema.definitions.bootstrap.properties);
  const value: Record<string, unknown> = Object.fromEntries(
    properties.map((key) => [key, address]),
  );
  Object.assign(value, {
    runId: "isolated-bootstrap",
    chainId: 31337,
    scope: "deployment-fragment-awaiting-receipts",
    safeOwners: [
      address,
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
    safeThreshold: 2,
    launchFeeWei: "500000000000000",
    developerPurchaseWei: "10000000000000000",
    developerTokensPurchased: "5858334812710811290608911",
  });
  expect(
    validateBootstrap(value),
    JSON.stringify(validateBootstrap.errors),
  ).toBe(true);
  value.safeOwners = [address];
  value.safeThreshold = 1;
  expect(
    validateBootstrap(value),
    JSON.stringify(validateBootstrap.errors),
  ).toBe(true);
  value.safeThreshold = 0;
  expect(validateBootstrap(value)).toBe(false);
  value.safeThreshold = 1;
  value.chainId = 4663;
  expect(validateBootstrap(value)).toBe(false);
  value.chainId = 31337;
  value.status = "passed";
  expect(validateBootstrap(value)).toBe(false);
});
