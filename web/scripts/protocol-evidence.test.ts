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
import { protocolBuybackVaultAbi } from "../src/contracts";

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
