#!/usr/bin/env node
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  appendFile,
  rm,
  rename,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const require = createRequire(new URL("../web/package.json", import.meta.url));
const {
  createPublicClient,
  http,
  erc20Abi,
  erc721Abi,
  parseAbi,
  getAddress,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  parseEventLogs,
} = require("viem");
const { robinhood, robinhoodTestnet } = require("viem/chains");
export const NFT = getAddress("0x505a22ffed8d37ebe580ffd98d2cdb0021189146");
export const DEPLOYER = getAddress(
  "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027",
);
export const ETH_AMOUNT = parseEther("0.01");
export const GIFT_AMOUNT = parseUnits("1000", 6);
export const TIER = getAddress("0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B");
export const tierAbi = parseAbi([
  "function paymentToken() view returns (address)",
  "function pricePerPeriod() view returns (uint256)",
  "function periodDuration() view returns (uint64)",
  "function paused() view returns (bool)",
  "function supplyCap() view returns (uint64)",
  "function occupiedSupply() view returns (uint64)",
  "function giftMembership(address,uint64,uint256) returns (uint256)",
  "function createMembership(uint64,address,uint256) returns (uint256)",
  "event PaymentProcessed(address indexed payer,address indexed recipient,uint256 indexed tokenId,uint256 gross,uint64 periods)",
]);
const ZERO = "0x0000000000000000000000000000000000000000";
const ACCOUNTING_STEPS = 256n;
export const eligibleMembership = (row) =>
  row.memberships === 0n && !row.gifted;
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const json = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// This fixed collection is fully minted with IDs 1..10,000. A strict,
// block-pinned ownerOf scan avoids stale/inaccurate explorer holder balances.
export async function collectHolders(
  supply,
  maxSupply,
  readOwners,
  progress = () => {},
) {
  if (supply !== 10_000n || maxSupply !== 10_000n)
    throw new Error(
      "Unexpected CCFF00 supply; refusing an incomplete holder scan.",
    );
  const holders = new Map();
  for (let start = 1n; start <= supply; start += 200n) {
    const ids = Array.from(
      {
        length: Number(supply - start + 1n < 200n ? supply - start + 1n : 200n),
      },
      (_, i) => start + BigInt(i),
    );
    const owners = await readOwners(ids);
    if (owners.length !== ids.length)
      throw new Error("Incomplete ownerOf results.");
    for (const owner of owners) {
      const address = getAddress(owner);
      if (/^0x0{40}$/i.test(address))
        throw new Error("NFT returned a zero owner.");
      const prior = holders.get(address.toLowerCase());
      holders.set(address.toLowerCase(), {
        address,
        nftBalance: (prior?.nftBalance ?? 0n) + 1n,
      });
    }
    progress({ tokens: Number(start) + ids.length - 1, holders: holders.size });
  }
  return [...holders.values()].sort((a, b) =>
    a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
  );
}

export function summarize(rows, firstAirdrop = false) {
  for (const row of rows) {
    if (
      typeof row.eth !== "bigint" ||
      typeof row.memberships !== "bigint" ||
      row.eth < 0n ||
      row.memberships < 0n
    )
      throw new Error(
        "Missing or invalid balance; never interpret failed reads as zero.",
      );
  }
  const ethThreshold = firstAirdrop ? ETH_AMOUNT : 1n;
  const ethRecipients = rows.filter((r) => r.eth < ethThreshold).length;
  const membershipRecipients = rows.filter(eligibleMembership).length;
  return {
    holders: rows.length,
    ethRecipients,
    membershipRecipients,
    ethRequired: BigInt(ethRecipients) * ETH_AMOUNT,
    fundingRequired: BigInt(membershipRecipients) * GIFT_AMOUNT,
  };
}

export function fundingShortfalls(summary, sender, gasReserve) {
  const gas =
    summary.ethRecipients + summary.membershipRecipients > 0 ? gasReserve : 0n;
  const eth = summary.ethRequired + gas - sender.eth;
  const funding = summary.fundingRequired - sender.funding;
  return { eth: eth > 0n ? eth : 0n, funding: funding > 0n ? funding : 0n };
}

export async function distribute(rows, io, firstAirdrop = false) {
  const ethThreshold = firstAirdrop ? ETH_AMOUNT : 1n;
  const sent = { eth: 0, membership: 0 };
  for (const row of rows) {
    if (io.stopped())
      throw new Error(
        "Stopped between transfers. Run again to recheck balances.",
      );
    if (!(await io.owns(row.address))) continue;
    // Recheck chain eligibility; the durable campaign journal also prevents repeat gifts.
    if ((await io.balances(row.address)).eth < ethThreshold) {
      await io.send(row.address, "eth");
      sent.eth++;
    }
    if (io.stopped())
      throw new Error(
        "Stopped between transfers. Run again to recheck balances.",
      );
    if (
      (await io.owns(row.address)) &&
      eligibleMembership(await io.balances(row.address))
    ) {
      await io.send(row.address, "membership");
      sent.membership++;
    }
  }
  return sent;
}

export function assertChains(sourceId, targetId) {
  if (sourceId !== 4663 || targetId !== 46630)
    throw new Error(
      `Wrong chains: NFT source must be 4663, payout target must be 46630; got ${sourceId}/${targetId}.`,
    );
}

export function validatePayout(receipt, transaction, recipient, asset, token) {
  if (receipt.status !== "success")
    throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
  const destination = asset === "eth" ? recipient : TIER;
  if (
    !transaction.to ||
    !same(transaction.from, DEPLOYER) ||
    !same(transaction.to, destination)
  )
    throw new Error(
      `Receipt belongs to a different payout: ${receipt.transactionHash}`,
    );
  if (asset === "eth") {
    if (transaction.value !== ETH_AMOUNT)
      throw new Error(
        `Receipt did not confirm 0.01 ETH: ${receipt.transactionHash}`,
      );
  } else {
    const payments = parseEventLogs({
      abi: tierAbi,
      eventName: "PaymentProcessed",
      logs: receipt.logs,
    });
    const payment = payments.find(
      (event) =>
        same(event.address, TIER) &&
        same(event.args.payer, DEPLOYER) &&
        same(event.args.recipient, recipient) &&
        event.args.gross === GIFT_AMOUNT &&
        event.args.periods === 1n,
    );
    const mints = parseEventLogs({
      abi: erc721Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    });
    if (
      !payment ||
      !mints.some(
        (event) =>
          same(event.address, TIER) &&
          same(event.args.from, ZERO) &&
          same(event.args.to, recipient) &&
          event.args.tokenId === payment.args.tokenId,
      )
    ) {
      throw new Error(
        `Receipt did not confirm a funded one-period membership: ${receipt.transactionHash}`,
      );
    }
  }
}

async function promptPassword(account) {
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new Error(
      "Run --execute in a terminal to unlock the Foundry keystore.",
    );
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  rl.once("SIGINT", cancel);
  rl.once("close", cancel);
  process.once("SIGTERM", cancel);
  process.stderr.write(`Unlock Foundry account ${account} (password hidden): `);
  try {
    const answer = await rl.question("", { signal: abort.signal });
    return Buffer.from(answer, "utf8");
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("Keystore unlock canceled. Nothing sent.");
    throw error;
  } finally {
    process.removeListener("SIGTERM", cancel);
    rl.close();
    muted.end();
    process.stderr.write("\n");
  }
}

async function cast(args, password) {
  let directory;
  try {
    if (password) {
      // Foundry requires a regular password file; /dev/fd pipes fail its path check.
      // mkdtemp creates a private directory; the file is readable only by this user.
      directory = await mkdtemp(join(tmpdir(), "bbf-keystore-unlock-"));
      const passwordFile = join(directory, "password");
      await writeFile(passwordFile, password, { mode: 0o600, flag: "wx" });
      args = [...args, "--password-file", passwordFile];
    }
    return await new Promise((resolvePromise, reject) => {
      const child = spawn("cast", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      let output = "";
      let stderr = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      // Classify errors without echoing provider URLs, account data, or secrets.
      child.stderr.on("data", (data) => {
        stderr = (stderr + data).slice(-16000);
      });
      child.on("error", () =>
        reject(new Error("Could not start cast; install Foundry.")),
      );
      child.on("close", (code) => {
        if (code === 0) return resolvePromise(output.trim());
        let reason =
          "Check the account, funding, and pending transactions before retrying.";
        if (/password file.*does not exist/i.test(stderr))
          reason = "Foundry could not read its temporary password file.";
        else if (/keystore file.*does not exist/i.test(stderr))
          reason = "The selected Foundry keystore account does not exist.";
        else if (
          /mac mismatch|decrypt|incorrect password|invalid password/i.test(
            stderr,
          )
        )
          reason =
            "Keystore decryption failed; check the password for the selected account.";
        const phase =
          args[0] === "wallet" ? "Keystore unlock" : "Foundry transaction";
        reject(new Error(`${phase} failed (exit ${code}). ${reason}`));
      });
    });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

export function loadSnapshot(value) {
  if (
    value.sourceChainId !== 4663 ||
    value.targetChainId !== 46630 ||
    value.nft !== NFT ||
    value.tier !== TIER ||
    value.deployer !== DEPLOYER ||
    !Array.isArray(value.holders) ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.holders.length ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.sourceBlockHash)
  )
    throw new Error(
      "Snapshot must be a complete report for this collection, tier, chains, and deployer.",
    );
  const seen = new Set();
  const holders = value.holders.map((holder) => {
    const address = getAddress(holder.address);
    const nftBalance = BigInt(holder.nftBalance);
    if (
      same(address, ZERO) ||
      seen.has(address.toLowerCase()) ||
      nftBalance <= 0n
    )
      throw new Error("Snapshot contains invalid or duplicate holders.");
    seen.add(address.toLowerCase());
    return { address, nftBalance };
  });
  if (holders.reduce((sum, h) => sum + h.nftBalance, 0n) !== 10000n)
    throw new Error("Snapshot must account for all 10,000 source NFTs.");
  const rowAddresses = new Set();
  const rows = value.rows.map((row) => {
    const address = getAddress(row.address);
    if (
      !seen.has(address.toLowerCase()) ||
      rowAddresses.has(address.toLowerCase())
    )
      throw new Error("Snapshot balance rows do not match the holders.");
    rowAddresses.add(address.toLowerCase());
    const eth = BigInt(row.eth),
      memberships = BigInt(row.memberships);
    if (eth < 0n || memberships < 0n)
      throw new Error("Invalid snapshot balances.");
    return { address, eth, memberships };
  });
  return {
    ...value,
    holders,
    rows,
    sourceBlock: BigInt(value.sourceBlock),
    targetBlock: BigInt(value.targetBlock),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      execute: { type: "boolean" },
      snapshot: { type: "string" },
      "check-wallet": { type: "boolean" },
      "first-airdrop": { type: "boolean", default: false },
      "discover-only": { type: "boolean" },
      "gas-reserve": { type: "string", default: "0.1" },
      "max-fee-gwei": { type: "string", default: "1" },
      output: {
        type: "string",
        default: join(ROOT, "cache", "holder-airdrops"),
      },
    },
  });
  if (values.help) {
    console.log(`Usage: node scripts/airdrop-nft-holders.mjs [--first-airdrop] [--execute]
  Default: refresh holders and report ETH and funded membership requirements; no signing.
  --snapshot FILE       Reuse a complete report: skip holder discovery and bulk balance reads.
  --check-wallet        Check keystore password/address only; no RPC or transactions.
  --discover-only       Save current holders without reading the membership tier.
  --execute             Send eligible ETH and gift one funded membership period per eligible wallet.
  --first-airdrop       ETH below 0.01 qualifies; send a full 0.01 ETH. Otherwise zero ETH only.
  --gas-reserve ETH     Additional deployer ETH required (default 0.1).
  --max-fee-gwei GWEI   Maximum fee per gas (default 1).
  --output DIRECTORY   Reports and receipts (default cache/holder-airdrops).
Tier: ${TIER}. Price must be exactly 1,000 payment tokens for one period.
Payment token is read from the tier; --execute approves the planned funding when allowance is insufficient.
One-time membership journal stays in cache/holder-airdrops regardless of --output.
Environment: ROBINHOOD_MAINNET_RPC_URL, ROBINHOOD_TESTNET_RPC_URL,
  ACCOUNT (default backed-by-fans-testnet). Execution prompts once for the hidden keystore password.
Deployer: ${DEPLOYER}. Transactions restricted to chain 46630.`);
    return;
  }
  try {
    const configured = parseEnv(
      await readFile(join(ROOT, "contracts", ".env"), "utf8"),
    );
    for (const key of [
      "ROBINHOOD_MAINNET_RPC_URL",
      "ROBINHOOD_TESTNET_RPC_URL",
      "ACCOUNT",
    ])
      if (!process.env[key] && configured[key])
        process.env[key] = configured[key];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (values["check-wallet"]) {
    const account = process.env.ACCOUNT || "backed-by-fans-testnet";
    const password = await promptPassword(account);
    try {
      if (
        !same(
          await cast(["wallet", "address", "--account", account], password),
          DEPLOYER,
        )
      )
        throw new Error(
          "Foundry account does not match the approved deployer.",
        );
      console.log(
        `Keystore unlocked successfully: ${DEPLOYER}. Nothing signed or sent.`,
      );
    } finally {
      password.fill(0);
    }
    return;
  }
  if (values.snapshot && values["discover-only"])
    throw new Error(
      "Choose snapshot execution/preview or fresh discovery, not both.",
    );
  const snapshot = values.snapshot
    ? loadSnapshot(JSON.parse(await readFile(resolve(values.snapshot), "utf8")))
    : null;
  if (values.execute && values["discover-only"])
    throw new Error("Discovery cannot execute transfers.");
  let token;
  const gasReserve = parseEther(values["gas-reserve"]);
  const feeCeiling = parseUnits(values["max-fee-gwei"], 9);
  if (gasReserve < 0n || feeCeiling <= 0n)
    throw new Error(
      "Gas reserve must be nonnegative and fee ceiling positive.",
    );
  const source = createPublicClient({
    chain: robinhood,
    transport: http(
      process.env.ROBINHOOD_MAINNET_RPC_URL ||
        robinhood.rpcUrls.default.http[0],
      { batch: { batchSize: 50 }, retryCount: 2 },
    ),
  });
  const targetRpc =
    process.env.ROBINHOOD_TESTNET_RPC_URL ||
    robinhoodTestnet.rpcUrls.default.http[0];
  const target = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(targetRpc, { batch: { batchSize: 50 }, retryCount: 2 }),
  });
  const [sourceId, targetId] = await Promise.all([
    source.getChainId(),
    target.getChainId(),
  ]);
  assertChains(sourceId, targetId);
  if (
    !(await source.readContract({
      address: NFT,
      abi: parseAbi(["function supportsInterface(bytes4) view returns (bool)"]),
      functionName: "supportsInterface",
      args: ["0x80ac58cd"],
    }))
  )
    throw new Error("Source contract does not report ERC721 support.");
  let periodDuration;
  let supplyCap;
  let occupiedSupply;
  const checkTier = async () => {
    const [asset, price, duration, paused, cap, occupied] = await Promise.all(
      [
        "paymentToken",
        "pricePerPeriod",
        "periodDuration",
        "paused",
        "supplyCap",
        "occupiedSupply",
      ].map((functionName) =>
        target.readContract({ address: TIER, abi: tierAbi, functionName }),
      ),
    );
    const decimals = await target.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "decimals",
    });
    if (
      decimals !== 6 ||
      price !== GIFT_AMOUNT ||
      paused ||
      duration === 0n ||
      (token && !same(token, asset))
    )
      throw new Error(
        "Tier must be unpaused, use the same 6-decimal payment token, and cost exactly 1,000 per period.",
      );
    token = getAddress(asset);
    periodDuration = duration;
    supplyCap = cap;
    occupiedSupply = occupied;
  };
  if (!values["discover-only"]) await checkTier();
  const stateDir = join(ROOT, "cache", "holder-airdrops");
  await mkdir(stateDir, { recursive: true });
  const stateFile = join(stateDir, `membership-${TIER.toLowerCase()}.json`);
  const readState = async () => {
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      if (
        state.tier !== TIER ||
        !Array.isArray(state.confirmed) ||
        state.confirmed.some((a) => !/^0x[0-9a-fA-F]{40}$/.test(a))
      )
        throw new Error("Invalid membership distribution journal.");
      if (state.pending)
        throw new Error(
          `Unresolved membership attempt for ${state.pending.recipient}. Reconcile its transaction before clearing pending in ${stateFile}.`,
        );
      return state;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { tier: TIER, confirmed: [], pending: null };
    }
  };
  let state = values["discover-only"]
    ? { tier: TIER, confirmed: [], pending: null }
    : await readState();
  const saveState = async () => {
    await writeFile(stateFile + ".tmp", json(state));
    await rename(stateFile + ".tmp", stateFile);
  };
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(values.output, { recursive: true });
  const reportFile = join(values.output, `${runId}.json`);
  const logFile = join(values.output, `${runId}.transactions.jsonl`);
  const sourceSnapshot = snapshot
    ? { number: snapshot.sourceBlock, hash: snapshot.sourceBlockHash }
    : await source.getBlock();
  const sourceBlock = sourceSnapshot.number;
  const supplyAbi = parseAbi([
    "function totalSupply() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
  ]);
  let holders;
  if (snapshot) {
    holders = snapshot.holders;
    console.log(
      `Reusing ${holders.length} holders and balance rows from ${resolve(values.snapshot)}.`,
    );
  } else {
    const [supply, maxSupply] = await source.multicall({
      blockNumber: sourceBlock,
      allowFailure: false,
      contracts: [
        { address: NFT, abi: supplyAbi, functionName: "totalSupply" },
        { address: NFT, abi: supplyAbi, functionName: "MAX_SUPPLY" },
      ],
    });
    holders = await collectHolders(
      supply,
      maxSupply,
      (ids) =>
        source.multicall({
          blockNumber: sourceBlock,
          allowFailure: false,
          batchSize: 32_768,
          contracts: ids.map((id) => ({
            address: NFT,
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [id],
          })),
        }),
      ({ tokens, holders: count }) => {
        if (tokens % 1000 === 0)
          console.log(`Read ${tokens}/10000 NFTs: ${count} unique holders.`);
      },
    );
  }
  if (
    (await source.getBlock({ blockNumber: sourceBlock })).hash !==
    sourceSnapshot.hash
  )
    throw new Error("Source snapshot was reorganized; rerun discovery.");

  const report = {
    runId,
    snapshotFile: values.snapshot ? resolve(values.snapshot) : undefined,
    sourceChainId: 4663,
    targetChainId: 46630,
    nft: NFT,
    paymentToken: token,
    tier: TIER,
    periods: 1,
    periodDuration,
    deployer: DEPLOYER,
    sourceBlock,
    sourceBlockHash: sourceSnapshot.hash,
    holders,
  };
  await writeFile(reportFile, json(report));
  console.log(`Discovered ${holders.length} holders. Saved ${reportFile}`);
  if (values["discover-only"]) return;

  // Pin the plan's reads so balances and eligibility are internally consistent.
  const targetBlock = await target.getBlockNumber();
  const balances = async (address, blockNumber) => {
    const [eth, funding, memberships] = await Promise.all([
      target.getBalance({ address, blockNumber }),
      target.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
      target.readContract({
        address: TIER,
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    ]);
    return {
      eth,
      funding,
      memberships,
      gifted: state.confirmed.some((a) => same(a, address)),
    };
  };
  const owns = async (address, blockNumber) =>
    (await source.readContract({
      address: NFT,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    })) > 0n;
  const rows = snapshot
    ? snapshot.rows.map((row) => ({
        ...row,
        gifted: state.confirmed.some((a) => same(a, row.address)),
      }))
    : [];
  if (snapshot && !same(snapshot.paymentToken, token))
    throw new Error("Snapshot payment token does not match the tier.");
  if (!snapshot)
    for (let offset = 0; offset < holders.length; offset += 20) {
      const chunk = await Promise.all(
        holders.slice(offset, offset + 20).map(async (holder) => {
          return {
            ...holder,
            ...(await balances(holder.address, targetBlock)),
          };
        }),
      );
      rows.push(...chunk.filter(Boolean));
      if (offset % 200 === 0)
        console.log(
          `Checked ${Math.min(offset + 20, holders.length)}/${holders.length} holders.`,
        );
    }
  const firstAirdrop = values["first-airdrop"];
  const summary = summarize(rows, firstAirdrop);
  const sender = await balances(DEPLOYER, targetBlock);
  const shortfall = fundingShortfalls(summary, sender, gasReserve);
  const allowance = await target.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [DEPLOYER, TIER],
    blockNumber: targetBlock,
  });
  const capacityShortfall =
    supplyCap > 0n &&
    occupiedSupply + BigInt(summary.membershipRecipients) > supplyCap;
  console.log(
    json({
      tier: TIER,
      paymentToken: token,
      periods: 1,
      periodDurationSeconds: periodDuration,
      allowance: formatUnits(allowance, 6),
      approvalRequired: allowance < summary.fundingRequired,
      capacityShortfall,
    }),
  );
  Object.assign(report, {
    sourceBlock,
    targetBlock,
    balanceSnapshotBlock: snapshot
      ? (snapshot.balanceSnapshotBlock ?? snapshot.targetBlock)
      : targetBlock,
    rows,
    summary,
    sender,
    shortfall,
    gasReserve,
    allowance,
    approvalRequired: allowance < summary.fundingRequired,
    capacityShortfall,
    firstAirdrop,
  });
  await writeFile(reportFile, json(report));
  console.log(
    json({
      holders: summary.holders,
      firstAirdrop,
      ethEligibility: firstAirdrop ? "below 0.01 ETH" : "zero ETH",
      eligibleETH: summary.ethRecipients,
      eligibleMemberships: summary.membershipRecipients,
      ETHRequired: formatEther(summary.ethRequired),
      paymentTokensRequired: formatUnits(summary.fundingRequired, 6),
      gasReserveETH: formatEther(gasReserve),
      deployerETH: formatEther(sender.eth),
      deployerPaymentTokens: formatUnits(sender.funding, 6),
      additionalETHNeeded: formatEther(shortfall.eth),
      additionalPaymentTokensNeeded: formatUnits(shortfall.funding, 6),
    }),
  );
  if (!values.execute) {
    console.log("Dry run complete. Nothing signed or sent.");
    return;
  }
  if (capacityShortfall)
    throw new Error("Tier capacity is insufficient for all planned gifts.");
  if (shortfall.eth || shortfall.funding)
    throw new Error(
      "Deployer is underfunded; see the shortfalls above. No transactions sent.",
    );
  if (summary.ethRecipients + summary.membershipRecipients === 0) {
    console.log("No balances qualify for this airdrop; nothing to send.");
    return;
  }
  const account = process.env.ACCOUNT || "backed-by-fans-testnet";
  const signerArgs = ["--account", account];
  const lock = join(
    tmpdir(),
    `bbf-airdrop-46630-${DEPLOYER.toLowerCase()}.lock`,
  );
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(
      `Another run or interrupted run holds ${lock}. Check for a running process and pending transactions before removing this lock.`,
    );
  }
  let password;
  let stopped = false;
  const stop = () => {
    stopped = true;
    console.log("Stopping after the current transfer finishes.");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await writeFile(join(lock, "pid"), String(process.pid));
    state = await readState();
    password = await promptPassword(account);
    if (
      !same(
        await cast(["wallet", "address", ...signerArgs], password),
        DEPLOYER,
      )
    )
      throw new Error("Foundry account does not match the approved deployer.");
    const journal = async (entry) =>
      appendFile(logFile, `${JSON.stringify(entry)}\n`);
    const send = async (recipient, asset, approvalAmount) => {
      if (stopped)
        throw new Error("Stopped before signing the next transaction.");
      assertChains(await source.getChainId(), await target.getChainId());
      const [latestNonce, pendingNonce] = await Promise.all([
        target.getTransactionCount({
          address: DEPLOYER,
          blockTag: "latest",
        }),
        target.getTransactionCount({
          address: DEPLOYER,
          blockTag: "pending",
        }),
      ]);
      if (latestNonce !== pendingNonce)
        throw new Error(
          "Deployer has pending transactions. Wait for resolution before rerunning.",
        );
      const fees = await target.estimateFeesPerGas();
      if (fees.maxFeePerGas > feeCeiling)
        throw new Error(
          "Current fee exceeds --max-fee-gwei; stopped before signing.",
        );
      const native = asset === "eth";
      const approval = asset === "approval";
      const membership = asset === "membership";
      if (!native) await checkTier();
      const self = same(recipient, DEPLOYER);
      const request = native
        ? { account: DEPLOYER, to: recipient, value: ETH_AMOUNT }
        : approval
          ? {
              account: DEPLOYER,
              address: token,
              abi: erc20Abi,
              functionName: "approve",
              args: [TIER, approvalAmount],
            }
          : {
              account: DEPLOYER,
              address: TIER,
              abi: tierAbi,
              functionName: self ? "createMembership" : "giftMembership",
              args: self
                ? [1n, ZERO, ACCOUNTING_STEPS]
                : [recipient, 1n, ACCOUNTING_STEPS],
            };
      const estimate = native
        ? await target.estimateGas(request)
        : await target.estimateContractGas(request);
      const gas = (estimate * 120n + 99n) / 100n;
      const currentSender = await balances(DEPLOYER);
      if (
        currentSender.eth <
          (native ? ETH_AMOUNT : 0n) + gas * fees.maxFeePerGas ||
        (membership && currentSender.funding < GIFT_AMOUNT)
      )
        throw new Error(
          "Deployer funding exhausted. Confirmed transfers are retained; fund and rerun.",
        );
      const args = native
        ? ["send", recipient, "--value", ETH_AMOUNT.toString()]
        : approval
          ? [
              "send",
              token,
              "approve(address,uint256)(bool)",
              TIER,
              approvalAmount.toString(),
            ]
          : [
              "send",
              TIER,
              self
                ? "createMembership(uint64,address,uint256)(uint256)"
                : "giftMembership(address,uint64,uint256)(uint256)",
              ...(self ? ["1", ZERO] : [recipient, "1"]),
              ACCOUNTING_STEPS.toString(),
            ];
      args.push(
        "--rpc-url",
        targetRpc,
        "--chain",
        "46630",
        ...signerArgs,
        "--async",
        "--gas-limit",
        gas.toString(),
        "--gas-price",
        fees.maxFeePerGas.toString(),
        "--priority-gas-price",
        fees.maxPriorityFeePerGas.toString(),
      );
      if (membership) {
        state.pending = {
          recipient,
          nonce: latestNonce,
          startedAt: new Date().toISOString(),
        };
        await saveState();
      }
      const hash = await cast(args, password);
      if (membership) {
        state.pending.hash = hash;
        await saveState();
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
        throw new Error(
          "No unambiguous transaction hash returned. Check the deployer before rerunning.",
        );
      await journal({ status: "submitted", recipient, asset, hash });
      console.log(`${asset} -> ${recipient}: ${hash}`);
      const receipt = await target.waitForTransactionReceipt({
        hash,
        confirmations: 2,
        timeout: 180_000,
      });
      const transaction = await target.getTransaction({
        hash: receipt.transactionHash,
      });
      if (approval) {
        const approvals = parseEventLogs({
          abi: erc20Abi,
          eventName: "Approval",
          logs: receipt.logs,
        });
        const confirmedAllowance = await target.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [DEPLOYER, TIER],
        });
        if (
          receipt.status !== "success" ||
          !transaction.to ||
          !same(transaction.from, DEPLOYER) ||
          !same(transaction.to, token) ||
          transaction.value !== 0n ||
          confirmedAllowance !== approvalAmount ||
          !approvals.some(
            (event) =>
              same(event.address, token) &&
              same(event.args.owner, DEPLOYER) &&
              same(event.args.spender, TIER) &&
              event.args.value === approvalAmount,
          )
        )
          throw new Error(
            `Approval was not confirmed for the expected tier and amount: ${receipt.transactionHash}`,
          );
      } else {
        validatePayout(receipt, transaction, recipient, asset, token);
      }
      if (membership) {
        state.confirmed.push(recipient);
        state.pending = null;
        await saveState();
      }
      await journal({
        status: "confirmed",
        recipient,
        asset,
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber.toString(),
      });
    };
    // Approval is a separate confirmed transaction before any distribution.
    // Reuse sufficient allowance; never grant unlimited approval.
    const currentAllowance = await target.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [DEPLOYER, TIER],
    });
    if (currentAllowance < summary.fundingRequired) {
      console.log(
        `Approving ${formatUnits(summary.fundingRequired, 6)} payment tokens for tier ${TIER}.`,
      );
      await send(TIER, "approval", summary.fundingRequired);
    }
    const sent = await distribute(
      rows,
      { stopped: () => stopped, owns, balances, send },
      firstAirdrop,
    );
    console.log(
      `Completed: ${sent.eth} ETH transfers, ${sent.membership} funded one-period memberships. Receipts: ${logFile}`,
    );
  } finally {
    password?.fill(0);
    password = undefined;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await rm(lock, { recursive: true });
  }
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // viem details may contain a credential-bearing RPC URL; print only its concise message.
    console.error(error.shortMessage || error.message);
    process.exitCode = 1;
  });
}
