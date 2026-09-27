#!/usr/bin/env node
// Offline preparation only: no RPC, signing, or changes to the original airdrop script.
import { readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";

const require = createRequire(new URL("../web/package.json", import.meta.url));
const { getAddress } = require("viem");
const root = fileURLToPath(new URL("../", import.meta.url));
const tier = getAddress("0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B");
const operator = getAddress("0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027");
const paymentToken = getAddress("0x68cdeB4985317B7dad73F9C47A7226879721Cb86");
const nft = getAddress("0x505a22ffed8d37ebe580ffd98d2cdb0021189146");
const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const key = (a) => getAddress(a).toLowerCase();
const address = (a) => {
  const result = getAddress(a);
  if (BigInt(result) === 0n) throw new Error("Zero recipient in input.");
  return result;
};

async function assertStopped() {
  const lock = resolve(
    tmpdir(),
    `bbf-airdrop-46630-${operator.toLowerCase()}.lock`,
  );
  try {
    await stat(lock);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    `Old script lock exists at ${lock}. Stop and reconcile that run first.`,
  );
}

export function preparePlan(snapshot, state, journalEntries) {
  if (
    snapshot.sourceChainId !== 4663 ||
    snapshot.targetChainId !== 46630 ||
    !same(snapshot.nft, nft) ||
    !same(snapshot.tier, tier) ||
    !same(snapshot.deployer, operator) ||
    !same(snapshot.paymentToken, paymentToken) ||
    !Array.isArray(snapshot.holders) ||
    snapshot.holders.length === 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(snapshot.sourceBlockHash) ||
    BigInt(snapshot.sourceBlock) < 0n
  )
    throw new Error("Wrong or incomplete holder snapshot for this campaign.");
  const holders = new Set();
  let supply = 0n;
  const recipients = snapshot.holders.map((h) => {
    const recipient = address(h.address);
    const count = BigInt(h.nftBalance);
    if (holders.has(key(recipient)) || count <= 0n)
      throw new Error("Invalid holder list.");
    holders.add(key(recipient));
    supply += count;
    return recipient;
  });
  if (supply !== 10_000n)
    throw new Error("Snapshot must account for all 10,000 NFTs.");
  if (!same(state.tier, tier) || !Array.isArray(state.confirmed)) {
    throw new Error("Wrong membership progress file.");
  }
  if (state.pending)
    throw new Error("Reconcile the old script's pending membership first.");
  const eth = new Map();
  const memberships = new Map(state.confirmed.map((a) => [key(a), address(a)]));
  const submitted = new Set();
  const confirmed = new Set();
  const deliveries = new Map();
  for (const entry of journalEntries) {
    if (
      !["eth", "membership", "approval"].includes(entry.asset) ||
      !["submitted", "confirmed"].includes(entry.status) ||
      !/^0x[0-9a-fA-F]{64}$/.test(entry.hash)
    ) {
      throw new Error("Invalid transaction journal entry.");
    }
    const hash = entry.hash.toLowerCase();
    const recipient = address(entry.recipient);
    const identity = `${entry.asset}:${key(recipient)}`;
    if (deliveries.has(hash) && deliveries.get(hash) !== identity) {
      throw new Error("Conflicting transaction journal entries.");
    }
    deliveries.set(hash, identity);
    if (entry.status === "submitted") submitted.add(hash);
    else {
      confirmed.add(hash);
      if (entry.asset === "eth") eth.set(key(recipient), recipient);
      if (entry.asset === "membership")
        memberships.set(key(recipient), recipient);
    }
  }
  if ([...submitted].some((hash) => !confirmed.has(hash))) {
    throw new Error(
      "Unconfirmed old-script transaction in journals. Reconcile it before preparing.",
    );
  }
  return {
    chainId: 46630,
    tier,
    operator,
    paymentToken,
    nft,
    sourceChainId: 4663,
    sourceBlock: String(snapshot.sourceBlock),
    sourceBlockHash: snapshot.sourceBlockHash,
    recipients,
    ethCompleted: [...eth.values()].sort(),
    membershipCompleted: [...memberships.values()].sort(),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      snapshot: { type: "string" },
      progress: {
        type: "string",
        default: resolve(root, "cache/holder-airdrops"),
      },
      output: {
        type: "string",
        default: resolve(
          root,
          "contracts/deployments/holder-airdrop-plan.json",
        ),
      },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: node scripts/prepare-holder-airdrop.mjs --snapshot FILE [--progress DIRECTORY] [--output FILE]\nStop the old script first. Reads all transaction journals and membership progress. Writes an offline Foundry plan.",
    );
    return;
  }
  if (!values.snapshot) throw new Error("--snapshot FILE is required.");
  await assertStopped();
  const progress = resolve(values.progress);
  const names = await readdir(progress);
  if (names.some((n) => n.endsWith(".lock"))) {
    throw new Error(
      "Old script lock exists. Stop and reconcile that run first.",
    );
  }
  const evidence = [];
  const read = async (path) => {
    const data = await readFile(path, "utf8");
    evidence.push({
      path,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
    return data;
  };
  const snapshot = JSON.parse(await read(resolve(values.snapshot)));
  const state = JSON.parse(
    await read(resolve(progress, `membership-${tier.toLowerCase()}.json`)),
  );
  const journals = names
    .filter((n) => n.endsWith(".transactions.jsonl"))
    .sort();
  const entries = [];
  for (const name of journals) {
    for (const line of (await read(resolve(progress, name)))
      .split("\n")
      .filter(Boolean)) {
      entries.push(JSON.parse(line));
    }
  }
  // Refuse a moving progress file instead of creating an inconsistent handoff.
  for (const item of evidence) {
    const current = await readFile(item.path, "utf8");
    if (createHash("sha256").update(current).digest("hex") !== item.sha256) {
      throw new Error(
        "Input changed while preparing. Stop the old script and try again.",
      );
    }
  }
  if (
    (await readdir(progress)).some((n) => n.endsWith(".lock")) ||
    (await readdir(progress)).filter((n) => n.endsWith(".transactions.jsonl"))
      .length !== journals.length
  ) {
    throw new Error("Old-script progress changed during preparation.");
  }
  await assertStopped();
  const plan = {
    ...preparePlan(snapshot, state, entries),
    evidence: evidence.map(({ path, sha256 }) => ({
      path: relative(root, path),
      sha256,
    })),
  };
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  // Create a new plan; never overwrite an already reviewed recipient list.
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        output,
        holders: plan.recipients.length,
        importedETH: plan.ethCompleted.length,
        importedMemberships: plan.membershipCompleted.length,
        batchesOf25: Math.ceil(plan.recipients.length / 25),
        note: "Offline plan only. Review and import completion before distributing. Keep this plan for retries.",
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
