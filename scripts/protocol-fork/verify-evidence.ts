import { readFile, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { Log } from "../../web/node_modules/viem";
import {
  erc20Abi,
  parseEventLogs,
  zeroAddress,
  keccak256,
  isAddress,
  isAddressEqual,
} from "../../web/node_modules/viem";
import {
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "../../web/src/contracts";
import { extractReceipts } from "./export-evidence";
import { verifyRetainedProtocolSources } from "./verify-sources";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "web/package.json"));
const Ajv: typeof import("../../web/node_modules/ajv").default = require("ajv");
type Json = Record<string, unknown>;
type Result = {
  status: "passed" | "failed" | "not-run";
  evidenceClass: "authentic-fork" | "browser" | "none";
  artifacts: string[];
  reason: string;
};
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
  "\n";
const n = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new Error("Missing raw integer evidence");
  return BigInt(value);
};
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

export function reconcileInventory(value: unknown) {
  const v = value as Json;
  assert(
    n(v.available) + n(v.totalSpent) ===
      n(v.totalReceived) + n(v.totalConvertedIn),
    "Asset inventory does not conserve raw units",
  );
}
export function reconcileBurnReceipts(
  receipts: unknown,
  token: string,
  vault: string,
) {
  let burned = 0n;
  for (const receipt of extractReceipts(receipts)) {
    const events = parseEventLogs({
      abi: protocolBuybackVaultAbi,
      logs: receipt.logs as Log[],
    }).filter((event) => event.address.toLowerCase() === vault.toLowerCase());
    const reported = events.reduce(
      (sum, event) =>
        sum +
        (event.eventName === "BuybackBurned"
          ? event.args.burned
          : event.eventName === "DirectBurned"
            ? event.args.amount
            : 0n),
      0n,
    );
    if (!reported) continue;
    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs as Log[],
    }).filter(
      (event) =>
        event.address.toLowerCase() === token.toLowerCase() &&
        event.args.to === zeroAddress,
    );
    const destroyed = transfers.reduce(
      (sum, event) => sum + event.args.value,
      0n,
    );
    assert(
      reported === destroyed,
      "Receipt burn event differs from token destruction",
    );
    assert(
      receipt.status === "success" || receipt.status === "0x1",
      "Burn receipt reverted",
    );
    burned += destroyed;
  }
  return burned;
}
/** These scenarios fund only protocol allocations; every remaining unit stays protected. */
export function reconcileVestedRefund(value: Json) {
  const accounting = value.refundAccounting as Json;
  const preview = value.preview as Json;
  const funding = preview.fundingScaled as unknown[];
  assert(
    Array.isArray(funding) && funding.length === 4,
    "Missing refund funding purposes",
  );
  assert(
    (preview.complete === true ||
      (preview.projected === true &&
        n(preview.fundingAsOf) === n(preview.accessAsOf) &&
        n(preview.fundingAsOf) >= n(preview.accountingAsOf))) &&
      funding.slice(0, 3).every((amount) => n(amount) === 0n) &&
      n(funding[3]) === n(preview.grossRefund) * (1n << 128n),
    "Refund is not funded by reserved protocol cash",
  );
  const events = extractReceipts(value.receipts)
    .flatMap((receipt) =>
      parseEventLogs({
        abi: membershipTierAbi,
        logs: receipt.logs as Log[],
      }),
    )
    .filter(
      (event) =>
        event.address.toLowerCase() === String(value.tier).toLowerCase(),
    );
  const released = events.reduce(
    (sum, event) =>
      sum +
      (event.eventName === "ProtocolFeesReleased" ? event.args.amount : 0n),
    0n,
  );
  const refunds = events.filter(
    (event) => event.eventName === "MembershipRefunded",
  );
  assert(refunds.length === 1, "Missing unique refund receipt");
  const refund = refunds[0].args.grossRefund;
  assert(
    refund > 0n &&
      refund <= n(preview.grossRefund) &&
      refund === n(accounting.after) - n(accounting.before),
    "Refund receipt differs from received cash",
  );
  assert(
    n(accounting.allocated) === n(accounting.held) + released + refund,
    "Vested refund raw cash does not conserve",
  );
  assert(
    n(accounting.held) === n(accounting.protected) &&
      n(accounting.generation) === n(preview.generation) + 1n,
    "Refund residue or cancellation generation differs",
  );
}

/** The approved standing operating model runs one finite sweep per process. */
export function reconcileRunnerReplacement(runner: Json) {
  assert(
    runner.executionMode === "one-shot" &&
      runner.maximumGasPercent === 100 &&
      isAddress(String(runner.callerA)) &&
      isAddress(String(runner.callerB)) &&
      !isAddressEqual(
        runner.callerA as `0x${string}`,
        runner.callerB as `0x${string}`,
      ) &&
      n(runner.gasAfterRemoval) === 0n &&
      typeof runner.firstProcessAfterMsB === "number" &&
      runner.firstProcessAfterMsB > 0 &&
      runner.firstProcessAfterMsB <= 60_000 &&
      n(runner.releasedB) > n(runner.releasedA),
    "Runner independence failed",
  );
  for (const name of ["logsA", "logsB"]) {
    const logs = runner[name] as Json[];
    const sweeps = logs.filter((row) => row.action === "sweep-complete");
    const visits = logs.filter((row) => row.action === "tier-visit");
    assert(
      sweeps.length === 1 &&
        n(sweeps[0].visits) > 0n &&
        n(sweeps[0].visits) === n(sweeps[0].visitBound) &&
        BigInt(visits.length) === n(sweeps[0].visitBound) &&
        new Set(visits.map((row) => String(row.tier).toLowerCase())).size ===
          visits.length &&
        visits.every(
          (row, i) =>
            isAddress(String(row.tier)) &&
            n(row.visits) === BigInt(i + 1) &&
            n(row.visitBound) === n(sweeps[0].visitBound) &&
            row.complete === (i === visits.length - 1),
        ),
      `Missing bounded one-shot ${name} progress`,
    );
  }
}
export async function ownedArtifact(directory: string, path: string) {
  assert(
    !isAbsolute(path) && !path.split(/[\\/]/).includes(".."),
    "Artifact path escapes retained run",
  );
  const absolute = await realpath(resolve(directory, path)),
    base = await realpath(directory);
  const local = relative(base, absolute);
  assert(
    local !== ".." && !local.startsWith("../") && !isAbsolute(local),
    "Artifact symlink escapes retained run",
  );
  return absolute;
}
type Requirement = {
  contracts?: string[];
  browser?: string[];
  scenarios?: string[];
};
// Exact names from the requirements-quality matrix. An added/renamed row fails
// until it has explicit evidence; counts or a top-level 'passed' cannot replace it.
const requirements: Record<string, Requirement> = {
  "Fee range": {
    contracts: ["FactoryAndFeesTest"],
    browser: [
      "with 1% protocol allocation",
      "with 12.34% protocol allocation",
      "with 100% protocol allocation",
    ],
  },
  "Safe configuration": {
    contracts: ["ProtocolSafeForkTest", "BuybackAdministrationTest"],
    scenarios: ["safe-configuration-continuity"],
  },
  "Administration workflow": {
    contracts: ["ProtocolSafeForkTest"],
    scenarios: ["safe-configuration-continuity"],
  },
  "Configuration continuity": {
    scenarios: ["safe-configuration-continuity", "unrouted-authentic-asset"],
  },
  "Authority limits": {
    contracts: [
      "BuybackAdministrationTest",
      "ProtocolSafeForkTest",
      "ProtocolBuybackVaultTest",
    ],
  },
  "Payment split": {
    contracts: ["FactoryAndFeesTest", "AccountingInvariantTest"],
    browser: ["supporter payment and gifting story"],
  },
  "Entire membership lifecycle": {
    contracts: ["MembershipInvariantTest"],
    browser: [
      "every mutable tier control",
      "expired NFT",
      "exact gross refund",
      "supporter payment and gifting story",
    ],
  },
  "Full protocol allocation": {
    scenarios: [
      "wallet-direct-burn-refund",
      "asset-burn-refund-AMD",
      "asset-burn-refund-WETH",
    ],
  },
  "Continuous accrual": {
    contracts: ["VestingLedgerTest", "AccountingInvariantTest"],
    scenarios: ["runner-replacement"],
  },
  "Accrual lifecycle": {
    contracts: ["PublicVestingTest", "MembershipInvariantTest"],
    browser: ["expired NFT"],
  },
  "Refund and release race": {
    contracts: [
      "PublicVestingTest",
      "FixedPriceRefundsAndOwnershipTest",
      "AdversarialRefundsTest",
    ],
  },
  "Collection and forecast": {
    contracts: ["PublicVestingTest"],
    browser: ["conditional forecasts"],
    scenarios: ["runner-replacement"],
  },
  "Collector traversal": {
    contracts: ["VestingSchedulerTest", "VestingCapacityTest"],
    scenarios: ["runner-replacement"],
  },
  "Asset coverage": {
    scenarios: [
      "asset-burn-refund-AMD",
      "asset-burn-refund-WETH",
      "wallet-direct-burn-refund",
      "runner-replacement",
      "unrouted-authentic-asset",
    ],
  },
  "Stock action": {
    browser: [
      "authentic AMD lifecycle",
      "labeled AMD display-read adjustments",
    ],
    contracts: ["ProtocolExternalFailuresForkTest"],
  },
  "Token launch": {
    contracts: ["PonsLaunchForkTest", "ProtocolForkDeploymentTest"],
  },
  "Bonding purchase": {
    scenarios: [
      "asset-burn-refund-AMD",
      "asset-burn-refund-WETH",
      "runner-replacement",
    ],
  },
  "Early pricing": {
    contracts: ["ProtocolExternalFailuresForkTest"],
    scenarios: ["runner-replacement"],
  },
  "Crossing purchase": {
    contracts: ["PonsGraduationForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "Graduation recovery": {
    contracts: ["PonsGraduationForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "Graduated purchase": { scenarios: ["graduation-pool-compensation"] },
  "Protocol-token payment": {
    scenarios: ["wallet-direct-burn-refund", "asset-lifecycle-protocol-token"],
  },
  "No market / unsafe market": {
    contracts: ["ProtocolExternalFailuresForkTest"],
    scenarios: ["unrouted-authentic-asset"],
  },
  "External fee harvesting": {
    contracts: ["PonsCompensationForkTest", "ProtocolExternalFailuresForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "Vested trading buybacks": {
    contracts: ["PonsCompensationForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "Fee-flow separation": {
    contracts: ["PonsCompensationForkTest", "ProtocolBuybacksForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "Native Pons fallback": {
    contracts: ["PonsCompensationForkTest"],
    scenarios: ["graduation-pool-compensation"],
  },
  "External creator controls": { contracts: ["PonsCompensationForkTest"] },
  "Adversarial execution": {
    contracts: [
      "PonsBuybackExecutorTest",
      "ProtocolBuybackVaultTest",
      "BuybackInvariantTest",
    ],
  },
  "Replace automation": { scenarios: ["runner-replacement"] },
  "Administrative disclosure": {
    browser: ["without a wallet", "without browser JavaScript"],
    scenarios: ["safe-configuration-continuity"],
  },
  "External authority": {
    contracts: ["PonsCompensationForkTest", "ProtocolExternalFailuresForkTest"],
  },
  "Browser failures": {
    browser: [
      "wrong-network",
      "rejected wallet request",
      "insufficient asset",
      "insufficient gas",
      "repriced transaction",
      "browser RPC loss",
      "blocked destination",
    ],
    scenarios: ["safe-configuration-continuity"],
  },
  Reproduction: {},
};
type BrowserCase = {
  title: string;
  projectName: string;
  results: { status: string; attachments?: { path?: string }[] }[];
};
function browserCases(value: unknown): BrowserCase[] {
  if (!value || typeof value !== "object") return [];
  const v = value as {
    specs?: { title: string; tests: Omit<BrowserCase, "title">[] }[];
    suites?: unknown[];
  };
  return [
    ...(v.specs ?? []).flatMap((spec) =>
      spec.tests.map((test) => ({ ...test, title: spec.title })),
    ),
    ...(v.suites ?? []).flatMap(browserCases),
  ];
}

export function requiredScenarioTitles(document: string) {
  const matrix = document
    .split("## Required scenario matrix")[1]
    ?.split(/\n##? /)[0];
  assert(matrix, "Required scenario matrix is absent");
  return [...matrix!.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
    .map((match) => match[1].trim())
    .filter((title) => title !== "Scenario" && !/^:?-{3,}:?$/.test(title));
}

export async function verifyEvidence(
  directory: string,
  peerDirectory?: string,
  persist = true,
) {
  directory = resolve(directory);
  const read = async (path: string) =>
    JSON.parse(await readFile(await ownedArtifact(directory, path), "utf8"));
  const manifest = await read("manifest.json"),
    index = await read("artifacts.json");
  for (const item of index) {
    const data = await readFile(await ownedArtifact(directory, item.path));
    assert(
      data.length === item.bytes &&
        createHash("sha256").update(data).digest("hex") === item.sha256,
      `Artifact hash mismatch: ${item.path}`,
    );
  }
  assert(
    manifest.execution.chainId === 31337 && manifest.origin.chainId === 4663,
    "Wrong evidence chains",
  );
  const preflight = await read("preflight/report.json");
  const finalSource = await read("source-at-export.json");
  const measurements = await read("deployment-measurements.json");
  assert(
    manifest.protocolGraph === "protocol-graph.json",
    "Protocol graph artifact is missing",
  );
  const protocolGraph = await read("protocol-graph.json");
  verifyRetainedProtocolSources(protocolGraph);
  for (const record of [
    ...protocolGraph.records.map(
      (row: { role: string; address: string; code: `0x${string}` }) => ({
        role: row.role,
        address: row.address,
        runtimeCodeHash: keccak256(row.code),
      }),
    ),
    { role: "vestingLedger", ...protocolGraph.library },
    { role: "executorCodeStore", ...protocolGraph.executorCodeStore },
  ]) {
    const deployment = manifest.deployments.find(
      (row: { role: string }) => row.role === record.role,
    );
    assert(
      deployment?.address.toLowerCase() === record.address.toLowerCase() &&
        deployment?.runtimeCodeHash === record.runtimeCodeHash,
      `Deployment graph identity differs: ${record.role}`,
    );
    if (record.initCode) {
      const transaction = measurements.transactions.find(
        (row: { hash: string }) => row.hash === deployment.receipt,
      );
      assert(
        transaction?.input?.toLowerCase() ===
          `${record.salt}${record.initCode.slice(2)}`.toLowerCase(),
        `Actual CREATE2 payload differs: ${record.role}`,
      );
    }
  }
  for (const role of [
    "vestingLedger",
    "tierImplementation",
    "burnRouter",
    "executorCodeStore",
  ]) {
    assert(
      manifest.deployments.some((row: { role: string }) => row.role === role),
      `Missing deployment proof: ${role}`,
    );
  }
  assert(
    measurements.deployments.length === manifest.deployments.length &&
      measurements.deployments.every(
        (row: { runtimeBytes: number }) =>
          row.runtimeBytes > 0 && row.runtimeBytes <= 98304,
      ),
    "Deployment runtime size gate failed",
  );
  assert(
    measurements.transactions.length > 0 &&
      measurements.transactions.every(
        (row: { serializedBytes: number; gasUsed: string }) =>
          row.serializedBytes > 0 &&
          n(row.gasUsed) > 0n &&
          n(row.gasUsed) <= 100000000n,
      ),
    "Actual deployment transaction size or gas gate failed",
  );
  assert(
    preflight.status === "passed" &&
      preflight.checks.length >= 88 &&
      preflight.checks.every(
        (check: { status: string }) => check.status === "passed",
      ),
    "Incomplete authentic source/route preflight",
  );
  const contractText = await readFile(
    await ownedArtifact(directory, "contracts.log"),
    "utf8",
  );
  const contracts = JSON.parse(
    contractText.slice(
      contractText.indexOf("{"),
      contractText.lastIndexOf("}") + 1,
    ),
  ) as Record<string, { test_results: Record<string, { status: string }> }>;
  assert(Object.keys(contracts).length > 0, "No executed contract suites");
  assert(
    Object.values(contracts).every((suite) =>
      Object.values(suite.test_results).every(
        (test) => test.status === "Success" || test.status === "Skipped",
      ),
    ),
    "A contract test failed",
  );
  const browser = await read("browser/report.json"),
    cases = browserCases(browser);
  for (const name of [
    "reward-curves publishes all presets",
    "vesting-lifecycle distinguishes free access",
    "vested-refund mixed free and paid periods",
    "vested-refund checkpoint recovery after claims",
    "vested-claims pays all beneficiaries",
    "vested-account discovers a burned membership",
    "vesting-recovery resumes purchase",
    "vesting-recovery resumes refund",
    "vesting-recovery resumes sync",
    "vesting accessibility: keyboard presets",
    "vesting accessibility: motion preferences",
  ]) {
    assert(
      cases.some(
        (test) =>
          test.projectName === "desktop" &&
          test.title.includes(name) &&
          test.results.length === 1 &&
          test.results[0].status === "passed",
      ),
      `Required vesting/curve browser journey absent/failed/skipped: ${name}`,
    );
  }
  const webUnit = await read("web-unit.json");
  assert(
    webUnit.success === true && webUnit.numFailedTests === 0,
    "Web unit verification failed",
  );
  for (const file of [
    "run-buybacks.test.ts",
    "fee-forecast.test.ts",
    "ProcessBuyback.test.tsx",
    "protocol-admin.test.ts",
  ]) {
    const suite = webUnit.testResults.find((result: { name: string }) =>
      result.name.endsWith(file),
    );
    assert(
      suite && suite.status === "passed" && suite.assertionResults.length > 0,
      `Missing runner/read/wallet boundary unit suite: ${file}`,
    );
  }
  assert(
    browser.errors.length === 0 &&
      browser.stats.unexpected === 0 &&
      browser.stats.flaky === 0,
    "Browser run has failures or retries",
  );
  const scenarioData = new Map<string, Record<string, unknown>>();
  const scenario = async (name: string) => {
    if (scenarioData.has(name)) return scenarioData.get(name)!;
    const value = await read(`browser/scenarios/${name}.json`);
    assert(
      value.status === "passed" &&
        value.bootstrap.runId === manifest.runId &&
        value.bootstrap.protocolToken.toLowerCase() ===
          manifest.launch.token.toLowerCase(),
      `Scenario bootstrap/status mismatch: ${name}`,
    );
    scenarioData.set(name, value);
    return value;
  };
  const executedBurns = [];
  for (const name of [
    "asset-burn-refund-AMD",
    "asset-burn-refund-WETH",
    "wallet-direct-burn-refund",
    "graduation-pool-compensation",
    "runner-replacement",
  ]) {
    const s = await scenario(name);
    const before = n(s.supplyBefore ?? s.openingSupply),
      after = n(s.supplyAfter ?? s.afterBurnSupply);
    assert(before > after, `${name}: no supply destruction`);
    // The runner receipts are in the exported mined branch because
    // the runner is an independently spawned process, not the scenario helper.
    let source: unknown = s.receipts;
    if (name === "runner-replacement") {
      const matching = index.filter(
        (item: { path: string }) =>
          item.path.startsWith("browser/branches/") &&
          item.path.endsWith(".json"),
      );
      const branchValues = await Promise.all(
        matching.map((item: { path: string }) => read(item.path)),
      );
      const branch = branchValues.find((value) =>
        value.title.includes("independently funded callers"),
      );
      assert(branch, "Runner transaction branch missing");
      source = branch.transactions;
    }
    const burned = reconcileBurnReceipts(
      source,
      manifest.launch.token,
      manifest.deployments.find(
        (item: { role: string }) => item.role === "buybackVault",
      ).address,
    );
    assert(
      burned === before - after,
      `${name}: receipt burns do not equal measured supply delta`,
    );
    executedBurns.push({ name, burned: String(burned) });
  }
  for (const name of ["asset-burn-refund-AMD", "asset-burn-refund-WETH"]) {
    const s = await scenario(name);
    reconcileInventory(s.released);
    reconcileInventory(s.spent);
    reconcileInventory(s.burned);
    reconcileVestedRefund(s);
  }
  reconcileVestedRefund(await scenario("wallet-direct-burn-refund"));
  const runner = await scenario("runner-replacement");
  reconcileInventory(runner.inventory);
  reconcileInventory(runner.tokenInventory);
  reconcileRunnerReplacement(runner);
  const graduated = await scenario("graduation-pool-compensation");
  const crossing = graduated.crossing as Json;
  reconcileInventory(crossing);
  assert(
    n(crossing.totalSpent) > 0n &&
      n(crossing.totalSpent) < n(graduated.offered) &&
      n(crossing.available) + n(crossing.totalSpent) === n(graduated.offered),
    "Partial closing purchase does not conserve its input",
  );
  assert(
    (graduated.swept as Json).phase === 1 &&
      (graduated.graduated as Json).phase === 2,
    "Missing real graduation phases",
  );
  assert(
    n((graduated.poolMembershipBurn as Json).totalBurned) > 0n,
    "Missing earned membership-funded pool burn",
  );
  const vest = (graduated.final as { vesting: Json }).vesting,
    first = (graduated.firstDeposit as { vesting: Json }).vesting,
    second = (graduated.secondDeposit as { vesting: Json }).vesting;
  assert(
    n(vest.deposited) === n(vest.released) &&
      n(vest.unvested) === 0n &&
      n(second.deposited) > n(first.deposited),
    "Native pool vesting or additional deposits do not reconcile",
  );
  const evidenceDoc = await readFile(
    resolve(root, "specs/003-protocol-buyback-burn/acceptance-evidence.md"),
    "utf8",
  );
  const titles = requiredScenarioTitles(evidenceDoc);
  assert(
    titles.length === Object.keys(requirements).length &&
      titles.every((title) => requirements[title]),
    "Required scenario matrix lacks an explicit evidence mapping",
  );
  const results: Record<string, Result> = {};
  for (const [title, required] of Object.entries(requirements)) {
    if (title === "Reproduction") continue;
    const artifacts = new Set<string>([
      "bootstrap.json",
      "preflight/report.json",
      "web-unit.json",
    ]);
    for (const name of required.contracts ?? []) {
      const matching = Object.entries(contracts).filter(([id]) =>
        id.endsWith(`:${name}`),
      );
      assert(
        matching.length === 1 &&
          Object.keys(matching[0][1].test_results).length > 0 &&
          Object.values(matching[0][1].test_results).every(
            (test) => test.status === "Success",
          ),
        `Required contract suite absent/failed/skipped: ${name}`,
      );
      artifacts.add("contracts.log");
    }
    for (const name of required.browser ?? []) {
      const matching = cases.filter(
        (test) => test.projectName === "desktop" && test.title.includes(name),
      );
      assert(
        matching.some(
          (test) =>
            test.results.length === 1 && test.results[0].status === "passed",
        ),
        `Required browser journey absent/failed: ${name}`,
      );
      artifacts.add("browser/report.json");
      for (const item of matching.filter(
        (test) => test.results[0]?.status === "passed",
      ))
        for (const attachment of item.results[0].attachments ?? []) {
          if (attachment.path) {
            const path = relative(directory, attachment.path);
            await ownedArtifact(directory, path);
            artifacts.add(path);
          }
        }
    }
    for (const name of required.scenarios ?? []) {
      await scenario(name);
      artifacts.add(`browser/scenarios/${name}.json`);
    }
    results[title] = {
      status: "passed",
      evidenceClass: required.browser?.length ? "browser" : "authentic-fork",
      artifacts: [...artifacts],
      reason:
        "Named executed tests, authentic bootstrap and retained scenario postconditions verified",
    };
  }
  let reproduced = false;
  if (peerDirectory) {
    const peer = JSON.parse(
      await readFile(resolve(peerDirectory, "manifest.json"), "utf8"),
    );
    // Recompute the peer's evidence instead of trusting a saved pass label.
    // Do not reset its already finalized manifest while verifying this run.
    const proof = await verifyEvidence(peerDirectory, undefined, false);
    assert(
      peer.runId !== manifest.runId &&
        JSON.stringify(peer.origin) === JSON.stringify(manifest.origin) &&
        peer.source.snapshotSha256 === manifest.source.snapshotSha256,
      "Reproduction requires a fresh run of the same source and origin",
    );
    assert(
      proof.runLocalPassed === true &&
        proof.executedBurns.length === executedBurns.length,
      "Peer run did not independently reconcile",
    );
    reproduced = true;
    await writeFile(
      resolve(directory, "reproduction.json"),
      json({
        peerRunId: peer.runId,
        origin: manifest.origin,
        source: manifest.source,
        peerBurns: proof.executedBurns,
        currentBurns: executedBurns,
        note: "Fresh run salts change addresses; local timestamps and curve token ordering can change raw trade outputs. Each run independently conserves its own inputs, reserves and burned output.",
      }),
    );
  }
  results.Reproduction = reproduced
    ? {
        status: "passed",
        evidenceClass: "authentic-fork",
        artifacts: ["reproduction.json"],
        reason:
          "Two distinct fresh run IDs independently reconcile from the identical source/origin",
      }
    : {
        status: "not-run",
        evidenceClass: "none",
        artifacts: [],
        reason:
          "This run passed independently; a second fresh run is still required",
      };
  const combine = (names: string[]): Result => ({
    status: names.every((name) => results[name].status === "passed")
      ? "passed"
      : "not-run",
    evidenceClass: names.every((name) => results[name].status === "passed")
      ? "authentic-fork"
      : "none",
    artifacts: [...new Set(names.flatMap((name) => results[name].artifacts))],
    reason: names.join("; "),
  });
  manifest.scenarios = Object.entries(results).map(([title, result]) => ({
    id: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, ""),
    result,
  }));
  const gateNames = [
    ["Token launch"],
    ["Bonding purchase", "Full protocol allocation"],
    ["Asset coverage", "No market / unsafe market"],
    ["Crossing purchase", "Graduation recovery", "Graduated purchase"],
    ["Vested trading buybacks", "Native Pons fallback", "Fee-flow separation"],
    [
      "Safe configuration",
      "Administration workflow",
      "Administrative disclosure",
      "Browser failures",
      "Reproduction",
    ],
  ];
  manifest.gates = Object.fromEntries(
    gateNames.map((names, i) => [`G${i + 1}`, combine(names)]),
  );
  const successNames = [
    ["Fee range", "Payment split"],
    ["Refund and release race", "Adversarial execution", "Fee-flow separation"],
    ["Bonding purchase", "Graduated purchase"],
    ["Entire membership lifecycle", "Configuration continuity"],
    ["Replace automation"],
    ["Token launch"],
    ["Stock action", "Entire membership lifecycle", "Browser failures"],
    ["Reproduction"],
    ["Vested trading buybacks"],
    ["Safe configuration", "Authority limits"],
    ["Continuous accrual", "Full protocol allocation"],
    ["Collection and forecast", "Collector traversal"],
  ];
  manifest.acceptance = Object.fromEntries(
    successNames.map((names, i) => [
      `SC-${String(i + 1).padStart(3, "0")}`,
      combine(names),
    ]),
  );
  manifest.status = reproduced ? "passed" : "running";
  assert(
    finalSource.snapshotSha256 === preflight.source.snapshotSha256,
    "Source changed during execution; retain this exploratory run and start a clean run",
  );
  const schema = JSON.parse(
    await readFile(
      resolve(root, "scripts/protocol-fork/manifest.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  assert(
    validate(manifest),
    `Reconciled manifest invalid: ${JSON.stringify(validate.errors)}`,
  );
  const reconciliation = {
    runId: manifest.runId,
    runLocalPassed: true,
    completeAcceptance: reproduced,
    executedBurns,
    results,
  };
  if (persist) {
    await writeFile(
      resolve(directory, "reconciliation.json"),
      json(reconciliation),
    );
    await writeFile(resolve(directory, "manifest.json"), json(manifest));
  }
  return reconciliation;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  verifyEvidence(process.argv[2], process.argv[3])
    .then((result) =>
      console.log(
        result.completeAcceptance
          ? "Complete acceptance reconciled against a second clean run"
          : "Run reconciled; SC-008 remains pending a second clean run",
      ),
    )
    .catch((error) => {
      console.error(String(error));
      process.exitCode = 1;
    });
