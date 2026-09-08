import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi } from "viem";
import {
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "../../src/contracts";
import { forkContext, testKey } from "./helpers/protocol-fork";
import {
  requiredAnvilAddress,
  snapshotAnvil,
  revertAnvil,
} from "./helpers/anvil";

const runnerIntervalSeconds = 30;

async function scheduledRunner(
  key: `0x${string}`,
  interval: number,
  rpc: string,
  factory: string,
) {
  const child = spawn(
    "bun",
    [
      "scripts/run-buybacks.ts",
      "--rpc-url",
      rpc,
      "--factory",
      factory,
      "--interval-seconds",
      String(interval),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, BBF_RUNNER_PRIVATE_KEY: key },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const records: Record<string, unknown>[] = [];
  const startedAt = Date.now();
  let firstProcessAfterMs: number | undefined;
  let buffer = "",
    stderr = "",
    done = false;
  const completed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Runner did not complete two sweeps: ${stderr}`));
      child.kill("SIGTERM");
    }, 240000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const record = JSON.parse(line);
          records.push(record);
          if (
            record.action === "process" &&
            record.outcome === "success" &&
            firstProcessAfterMs === undefined
          )
            firstProcessAfterMs = Date.now() - startedAt;
        } catch {
          reject(new Error("Runner emitted an invalid JSON record"));
          child.kill("SIGTERM");
        }
        if (
          !done &&
          records.filter((record) => record.action === "sweep-complete")
            .length >= 2
        ) {
          done = true;
          clearTimeout(timeout);
          child.kill("SIGTERM");
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (done && code === 0) resolve();
      else reject(new Error(`Runner exited ${code}: ${stderr}`));
    });
  });
  try {
    await completed;
    return { records, firstProcessAfterMs, elapsedMs: Date.now() - startedAt };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill("SIGTERM");
      const shutdown = setTimeout(() => child.kill("SIGKILL"), 10000);
      await exited;
      clearTimeout(shutdown);
    }
    const directory = process.env.BBF_FORK_BROWSER_EVIDENCE;
    if (directory)
      await writeFile(
        resolve(directory, `runner-${privateKeyToAccount(key).address}.json`),
        JSON.stringify(
          {
            records,
            stderr,
            firstProcessAfterMs,
            elapsedMs: Date.now() - startedAt,
          },
          null,
          2,
        ),
      );
  }
}

test("@protocol-fork independently funded callers replace scheduled collection and processing", async ({}, testInfo) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      testInfo.project.name !== "desktop",
    "One authentic scheduled runner scenario is required",
  );
  test.setTimeout(600000);
  const snapshot = await snapshotAnvil();
  try {
    const f = await forkContext(),
      asset = requiredAnvilAddress("paymentToken"),
      member = requiredAnvilAddress("member");
    const tier = await f.tier("Runner replacement", asset);
    await f.policyForUSDG();
    await f.write(member, asset, erc20Abi, "approve", [tier, 120_000_000n]);
    const purchase = await f.write(
      member,
      tier,
      membershipTierAbi,
      "purchase",
      [12n, "0x0000000000000000000000000000000000000000"],
    );
    const start = (
      await f.client.getBlock({ blockNumber: purchase.blockNumber })
    ).timestamp;
    await f.testClient.setNextBlockTimestamp({ timestamp: start + 300n });
    await f.testClient.mine({ blocks: 1 });
    const readState = (blockNumber?: bigint) =>
      f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeState",
        args: [1n],
        blockNumber,
      });
    const accrualBlock = await f.client.getBlock();
    const before = await readState(accrualBlock.number);
    const elapsed = accrualBlock.timestamp - start;
    expect(elapsed).toBeGreaterThanOrEqual(300n);
    expect(elapsed).toBeLessThan(1200n);
    expect(before.uncheckpointedEarned).toBe((12_000_000n * elapsed) / 1200n);
    expect(before.unearned).toBe(12_000_000n - before.uncheckpointedEarned);
    const a = privateKeyToAccount(testKey(0xb001)),
      b = privateKeyToAccount(testKey(0xb002));
    await f.testClient.setBalance({ address: a.address, value: 10n ** 18n });
    await f.testClient.setBalance({ address: b.address, value: 10n ** 18n });
    const supplyBefore = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    const runA = await scheduledRunner(
      testKey(0xb001),
      runnerIntervalSeconds,
      f.rpc,
      f.bootstrap.factory,
    );
    const afterA = await readState();
    const releasedA = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "totalProtocolFeeReleased",
    });
    expect(releasedA).toBeGreaterThanOrEqual(3_000_000n);
    expect(afterA.earned).toBe(releasedA + afterA.uncheckpointedEarned);
    const gasAfterA = await f.client.getBalance({ address: a.address });
    expect(gasAfterA).toBeLessThan(10n ** 18n);
    await f.testClient.setBalance({ address: a.address, value: 0n });
    const gasAfterRemoval = await f.client.getBalance({ address: a.address });
    await f.testClient.setNextBlockTimestamp({ timestamp: start + 600n });
    await f.testClient.mine({ blocks: 1 });
    const stopped = await readState();
    expect(stopped.earned).toBeGreaterThan(afterA.earned);
    expect(stopped.uncheckpointedEarned).toBe(stopped.earned - releasedA);
    expect(
      await f.client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "totalProtocolFeeReleased",
      }),
    ).toBe(releasedA);
    const runB = await scheduledRunner(
      testKey(0xb002),
      runnerIntervalSeconds,
      f.rpc,
      f.bootstrap.factory,
    );
    const releasedB = await f.client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "totalProtocolFeeReleased",
    });
    const inventory = await f.client.readContract({
      address: f.bootstrap.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [asset, 0],
    });
    const tokenInventory = await f.client.readContract({
      address: f.bootstrap.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "inventory",
      args: [f.bootstrap.protocolToken, 0],
    });
    const supplyAfter = await f.client.readContract({
      address: f.bootstrap.protocolToken,
      abi: erc20Abi,
      functionName: "totalSupply",
    });
    expect(releasedB).toBeGreaterThanOrEqual(6_000_000n);
    expect(inventory.totalReceived).toBe(releasedB);
    expect(inventory.available).toBe(
      inventory.totalReceived - inventory.totalSpent,
    );
    expect(inventory.totalSpent).toBeGreaterThan(0n);
    // Contract time keeps earning while real receipts and discovery reads finish.
    // Test actual replacement liveness rather than assuming zero new inventory.
    expect(runB.firstProcessAfterMs).toBeDefined();
    expect(runB.firstProcessAfterMs!).toBeLessThanOrEqual(
      2 * runnerIntervalSeconds * 1000,
    );
    expect(supplyBefore - supplyAfter).toBe(tokenInventory.totalBurned);
    expect(tokenInventory.totalBurned).toBeGreaterThan(0n);
    expect(await f.client.getBalance({ address: a.address })).toBe(0n);
    expect(await f.client.getBalance({ address: b.address })).toBeLessThan(
      10n ** 18n,
    );
    await f.retain("runner-replacement", {
      tier,
      asset,
      start,
      before,
      accrualBlock: {
        number: accrualBlock.number,
        timestamp: accrualBlock.timestamp,
      },
      afterA,
      stopped,
      releasedA,
      releasedB,
      inventory,
      tokenInventory,
      supplyBefore,
      supplyAfter,
      callerA: a.address,
      callerB: b.address,
      intervalSecondsA: runnerIntervalSeconds,
      intervalSecondsB: runnerIntervalSeconds,
      gasAfterA,
      gasAfterRemoval,
      firstProcessAfterMsB: runB.firstProcessAfterMs,
      elapsedMsA: runA.elapsedMs,
      elapsedMsB: runB.elapsedMs,
      logsA: runA.records,
      logsB: runB.records,
    });
  } finally {
    await revertAnvil(snapshot);
  }
});
