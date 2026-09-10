// @vitest-environment node
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractReceipts,
  publicFiles,
} from "../../scripts/protocol-fork/export-evidence";
import {
  reconcileInventory,
  reconcileVestedRefund,
  reconcileRunnerReplacement,
  reconcileBurnReceipts,
  ownedArtifact,
  requiredScenarioTitles,
} from "../../scripts/protocol-fork/verify-evidence";
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  type Hex,
} from "viem";
import { membershipTierAbi, protocolBuybackVaultAbi } from "../src/contracts";

describe("retained fork artifact export", () => {
  it("reads the real acceptance matrix without counting its Markdown separator", async () => {
    const document = await readFile(
      new URL(
        "../../specs/003-protocol-buyback-burn/acceptance-evidence.md",
        import.meta.url,
      ),
      "utf8",
    );
    const titles = requiredScenarioTitles(document);
    expect(titles).toHaveLength(34);
    expect(titles[0]).toBe("Fee range");
    expect(titles.at(-1)).toBe("Reproduction");
  });
  it("keeps unknown scenario rows for the mapping gate and respects table alignment", () => {
    expect(
      requiredScenarioTitles(
        "## Required scenario matrix\n|Scenario|Evidence|\n|:---:|---:|\n|New requirement|Required proof|\n## Later section\n|Unrelated|Value|",
      ),
    ).toEqual(["New requirement"]);
    expect(() => requiredScenarioTitles("No matrix")).toThrow("absent");
  });
  it("rejects invented revenue, missing raw amounts and cross-asset accounting shortcuts", () => {
    const inventory = {
      available: "7",
      totalReceived: "10",
      totalConvertedIn: "2",
      totalSpent: "5",
      totalBurned: "0",
    };
    expect(() => reconcileInventory(inventory)).not.toThrow();
    expect(() =>
      reconcileInventory({ ...inventory, totalReceived: "11" }),
    ).toThrow("conserve");
    expect(() => reconcileInventory({ ...inventory, available: 7 })).toThrow(
      "raw integer",
    );
  });
  it("reconciles reserved refunds from receipts and rejects reused or unprotected cash", () => {
    const tier = `0x${"1".repeat(40)}` as Hex;
    const receipt = {
      transactionHash: `0x${"3".repeat(64)}`,
      blockHash: `0x${"4".repeat(64)}`,
      blockNumber: "1",
      status: "success",
      from: tier,
      to: tier,
      logs: [
        {
          address: tier,
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "ProtocolFeesReleased",
            args: { vault: zeroAddress, asset: zeroAddress },
          }),
          data: encodeAbiParameters(parseAbiParameters("uint256"), [30n]),
        },
        {
          address: tier,
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "MembershipRefunded",
            args: { tokenId: 1n, recipient: zeroAddress },
          }),
          data: encodeAbiParameters(
            parseAbiParameters("uint256,uint64,uint64"),
            [89n, 900n, 0n],
          ),
        },
      ],
    };
    const value = {
      tier,
      receipts: [receipt],
      preview: {
        complete: true,
        generation: "0",
        grossRefund: "90",
        fundingScaled: ["0", "0", "0", String(90n * (1n << 128n))],
      },
      refundAccounting: {
        allocated: "120",
        held: "1",
        protected: "1",
        before: "10",
        after: "99",
        generation: "1",
      },
    };
    expect(() => reconcileVestedRefund(value)).not.toThrow();
    const projected = {
      ...value,
      preview: {
        ...value.preview,
        complete: false,
        projected: true,
        fundingAsOf: "301",
        accessAsOf: "301",
        accountingAsOf: "300",
      },
    };
    expect(() => reconcileVestedRefund(projected)).not.toThrow();
    for (const preview of [
      { ...projected.preview, projected: false },
      { ...projected.preview, fundingAsOf: "300" },
      { ...projected.preview, accountingAsOf: "302" },
    ])
      expect(() => reconcileVestedRefund({ ...projected, preview })).toThrow(
        "reserved protocol cash",
      );
    expect(() => reconcileVestedRefund({ ...value, receipts: [] })).toThrow(
      "refund receipt",
    );
    expect(() =>
      reconcileVestedRefund({ ...value, tier: zeroAddress }),
    ).toThrow("refund receipt");
    expect(() =>
      reconcileVestedRefund({
        ...value,
        refundAccounting: { ...value.refundAccounting, held: "0" },
      }),
    ).toThrow("conserve");
    expect(() =>
      reconcileVestedRefund({
        ...value,
        refundAccounting: { ...value.refundAccounting, protected: "0" },
      }),
    ).toThrow("residue");
    expect(() =>
      reconcileVestedRefund({
        ...value,
        refundAccounting: { ...value.refundAccounting, generation: "0" },
      }),
    ).toThrow("generation");
    expect(() =>
      reconcileVestedRefund({
        ...value,
        refundAccounting: { ...value.refundAccounting, after: "100" },
      }),
    ).toThrow("received cash");
    expect(() =>
      reconcileVestedRefund({
        ...value,
        preview: { ...value.preview, fundingScaled: ["1", "0", "0", "0"] },
      }),
    ).toThrow("reserved protocol cash");
  });
  it("verifies bounded one-shot replacement and rejects incomplete or repeated work", () => {
    const logs = [
      {
        action: "tier-visit",
        tier: `0x${"1".repeat(40)}`,
        visits: "1",
        visitBound: "2",
        complete: false,
      },
      {
        action: "tier-visit",
        tier: `0x${"2".repeat(40)}`,
        visits: "2",
        visitBound: "2",
        complete: true,
      },
      { action: "sweep-complete", visits: "2", visitBound: "2" },
    ];
    const runner = {
      executionMode: "one-shot",
      maximumGasPercent: 100,
      callerA: `0x${"3".repeat(40)}`,
      callerB: `0x${"4".repeat(40)}`,
      gasAfterRemoval: "0",
      firstProcessAfterMsB: 8292,
      releasedA: "3",
      releasedB: "6",
      logsA: logs,
      logsB: logs,
    };
    expect(() => reconcileRunnerReplacement(runner)).not.toThrow();
    for (const change of [
      { executionMode: "scheduled" },
      { callerB: runner.callerA },
      { gasAfterRemoval: "1" },
      { firstProcessAfterMsB: 60_001 },
      { releasedB: "3" },
      { callerA: "not-an-address" },
    ])
      expect(() =>
        reconcileRunnerReplacement({ ...runner, ...change }),
      ).toThrow("independence");
    for (const logsB of [
      logs.slice(1),
      [...logs, logs[2]],
      [logs[0], { ...logs[1], tier: logs[0].tier }, logs[2]],
      [{ ...logs[0], complete: true }, logs[1], logs[2]],
      [logs[0], logs[1], { ...logs[2], visitBound: "3" }],
    ])
      expect(() => reconcileRunnerReplacement({ ...runner, logsB })).toThrow(
        "bounded one-shot",
      );
  });
  it("rejects a reported burn when the supplied receipt contains no token destruction", () => {
    const vault = `0x${"1".repeat(40)}` as Hex,
      token = `0x${"2".repeat(40)}` as Hex;
    const receipt = {
      transactionHash: `0x${"3".repeat(64)}`,
      blockHash: `0x${"4".repeat(64)}`,
      blockNumber: "1",
      status: "success",
      from: vault,
      to: token,
      logs: [
        {
          address: vault,
          topics: encodeEventTopics({
            abi: protocolBuybackVaultAbi,
            eventName: "DirectBurned",
            args: { sequence: 1n, bucket: 0, token },
          }),
          data: encodeAbiParameters(parseAbiParameters("uint256"), [10n]),
        },
      ],
    };
    expect(() => reconcileBurnReceipts(receipt, token, vault)).toThrow(
      "token destruction",
    );
    expect(reconcileBurnReceipts(receipt, token, zeroAddress)).toBe(0n);
  });
  it("extracts mined receipts without promoting transaction requests or scenario status labels", () => {
    const receipt = {
      transactionHash: `0x${"1".repeat(64)}`,
      blockHash: `0x${"2".repeat(64)}`,
      blockNumber: "1",
      status: "success",
      logs: [],
    };
    expect(
      extractReceipts({
        status: "passed",
        hash: receipt.transactionHash,
        transactions: [
          { request: { hash: receipt.transactionHash } },
          { receipt },
        ],
      }),
    ).toEqual([receipt]);
    expect(
      extractReceipts({
        status: "passed",
        transactions: [{ transactionHash: receipt.transactionHash }],
      }),
    ).toEqual([]);
  });
  it("exports only files inside the evidence tree and rejects symlink escapes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bbf-evidence-test-"));
    try {
      await mkdir(join(directory, "nested"));
      await writeFile(join(directory, "nested/receipt.json"), "{}");
      expect(await publicFiles(directory)).toEqual([
        join(directory, "nested/receipt.json"),
      ]);
      await symlink("/etc/hosts", join(directory, "outside"));
      await expect(publicFiles(directory)).rejects.toThrow("symbolic links");
      await expect(ownedArtifact(directory, "../escape")).rejects.toThrow(
        "escapes",
      );
      await expect(ownedArtifact(directory, "outside")).rejects.toThrow(
        "escapes",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
