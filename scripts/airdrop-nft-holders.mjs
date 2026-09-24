#!/usr/bin/env node
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { spawn } from "node:child_process";

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
export const BUSD_AMOUNT = parseUnits("1000", 6);
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

export function summarize(rows) {
  for (const row of rows) {
    if (
      typeof row.eth !== "bigint" ||
      typeof row.busd !== "bigint" ||
      row.eth < 0n ||
      row.busd < 0n
    )
      throw new Error(
        "Missing or invalid balance; never interpret failed reads as zero.",
      );
  }
  const ethRecipients = rows.filter((r) => r.eth === 0n).length;
  const busdRecipients = rows.filter((r) => r.busd === 0n).length;
  return {
    holders: rows.length,
    ethRecipients,
    busdRecipients,
    ethRequired: BigInt(ethRecipients) * ETH_AMOUNT,
    busdRequired: BigInt(busdRecipients) * BUSD_AMOUNT,
  };
}

export function fundingShortfalls(summary, sender, gasReserve) {
  const gas =
    summary.ethRecipients + summary.busdRecipients > 0 ? gasReserve : 0n;
  const eth = summary.ethRequired + gas - sender.eth;
  const busd = summary.busdRequired - sender.busd;
  return { eth: eth > 0n ? eth : 0n, busd: busd > 0n ? busd : 0n };
}

export async function distribute(rows, io) {
  const sent = { eth: 0, busd: 0 };
  for (const row of rows) {
    if (io.stopped())
      throw new Error(
        "Stopped between transfers. Run again to recheck balances.",
      );
    if (!(await io.owns(row.address))) continue;
    // Eligibility comes from fresh chain reads, not the saved dry-run or transaction log.
    if ((await io.balances(row.address)).eth === 0n) {
      await io.send(row.address, "eth");
      sent.eth++;
    }
    if (io.stopped())
      throw new Error(
        "Stopped between transfers. Run again to recheck balances.",
      );
    if (
      (await io.owns(row.address)) &&
      (await io.balances(row.address)).busd === 0n
    ) {
      await io.send(row.address, "busd");
      sent.busd++;
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
  const destination = asset === "eth" ? recipient : token;
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
    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    });
    if (
      !transfers.some(
        (event) =>
          same(event.address, token) &&
          same(event.args.from, DEPLOYER) &&
          same(event.args.to, recipient) &&
          event.args.value === BUSD_AMOUNT,
      )
    )
      throw new Error(
        `Receipt did not confirm the full bUSD transfer: ${receipt.transactionHash}`,
      );
  }
}

async function cast(args) {
  return new Promise((resolvePromise, reject) => {
    // No shell interpolation. Foundry retains custody of the encrypted keystore.
    const child = spawn("cast", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    // Do not echo RPC URLs or process environment from provider errors.
    child.stderr.on("data", () => {});
    child.on("error", () =>
      reject(new Error("Could not start cast; install Foundry.")),
    );
    child.on("close", (code) =>
      code === 0
        ? resolvePromise(output.trim())
        : reject(
            new Error(
              "Foundry command failed. Stop and check the deployer account, funding and pending transactions before rerunning.",
            ),
          ),
    );
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      execute: { type: "boolean" },
      "discover-only": { type: "boolean" },
      busd: { type: "string" },
      "gas-reserve": { type: "string", default: "0.1" },
      "max-fee-gwei": { type: "string", default: "1" },
      output: {
        type: "string",
        default: join(ROOT, "cache", "holder-airdrops"),
      },
    },
  });
  if (values.help) {
    console.log(`Usage: node scripts/airdrop-nft-holders.mjs [--busd ADDRESS] [--execute]
  Default: discover all current holders and report empty testnet balances; no signing.
  --discover-only       Save current holders without needing a deployed bUSD token.
  --busd ADDRESS        Deployed bUSD on Robinhood testnet (6 decimals, symbol bUSD).
  --execute             Send 0.01 test ETH / 1,000 bUSD independently when balance is zero.
  --gas-reserve ETH     Additional deployer ETH required before sending (default 0.1).
  --max-fee-gwei GWEI   Maximum permitted fee per gas (default 1).
  --output DIRECTORY   Reports and receipt log (default cache/holder-airdrops).
Environment: ROBINHOOD_MAINNET_RPC_URL, ROBINHOOD_TESTNET_RPC_URL,
  BUSD_ADDRESS, ACCOUNT (default backed-by-fans-testnet), ETH_PASSWORD (password FILE),
  Holder discovery uses the source RPC; no explorer API key is required.
Deployer: ${DEPLOYER}. Payouts are restricted to chain 46630.`);
    return;
  }
  try {
    const configured = parseEnv(
      await readFile(join(ROOT, "contracts", ".env"), "utf8"),
    );
    for (const key of [
      "ROBINHOOD_MAINNET_RPC_URL",
      "ROBINHOOD_TESTNET_RPC_URL",
      "BUSD_ADDRESS",
      "ACCOUNT",
      "ETH_PASSWORD",
    ])
      if (!process.env[key] && configured[key])
        process.env[key] = configured[key];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (values.execute && values["discover-only"])
    throw new Error("Discovery cannot execute transfers.");
  const busd = values.busd || process.env.BUSD_ADDRESS;
  if (!values["discover-only"] && !busd)
    throw new Error(
      "Set --busd ADDRESS after bUSD is deployed, or use --discover-only.",
    );
  const token = busd ? getAddress(busd) : undefined;
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
  if (token) {
    const [symbol, decimals] = await Promise.all([
      target.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      target.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    if (symbol !== "bUSD" || decimals !== 6)
      throw new Error("Expected the test bUSD token with 6 decimals.");
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(values.output, { recursive: true });
  const reportFile = join(values.output, `${runId}.json`);
  const logFile = join(values.output, `${runId}.transactions.jsonl`);
  const sourceSnapshot = await source.getBlock();
  const sourceBlock = sourceSnapshot.number;
  const supplyAbi = parseAbi([
    "function totalSupply() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
  ]);
  const [supply, maxSupply] = await source.multicall({
    blockNumber: sourceBlock,
    allowFailure: false,
    contracts: [
      { address: NFT, abi: supplyAbi, functionName: "totalSupply" },
      { address: NFT, abi: supplyAbi, functionName: "MAX_SUPPLY" },
    ],
  });
  const holders = await collectHolders(
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
  if (
    (await source.getBlock({ blockNumber: sourceBlock })).hash !==
    sourceSnapshot.hash
  )
    throw new Error("Source snapshot was reorganized; rerun discovery.");

  const report = {
    runId,
    sourceChainId: 4663,
    targetChainId: 46630,
    nft: NFT,
    busd: token,
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
    const [eth, busd] = await Promise.all([
      target.getBalance({ address, blockNumber }),
      target.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    ]);
    return { eth, busd };
  };
  const owns = async (address, blockNumber) =>
    (await source.readContract({
      address: NFT,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    })) > 0n;
  const rows = [];
  for (let offset = 0; offset < holders.length; offset += 20) {
    const chunk = await Promise.all(
      holders.slice(offset, offset + 20).map(async (holder) => {
        return { ...holder, ...(await balances(holder.address, targetBlock)) };
      }),
    );
    rows.push(...chunk.filter(Boolean));
    if (offset % 200 === 0)
      console.log(
        `Checked ${Math.min(offset + 20, holders.length)}/${holders.length} holders.`,
      );
  }
  const summary = summarize(rows);
  const sender = await balances(DEPLOYER, targetBlock);
  const shortfall = fundingShortfalls(summary, sender, gasReserve);
  Object.assign(report, {
    sourceBlock,
    targetBlock,
    rows,
    summary,
    sender,
    shortfall,
    gasReserve,
  });
  await writeFile(reportFile, json(report));
  console.log(
    json({
      holders: summary.holders,
      emptyETH: summary.ethRecipients,
      emptyBUSD: summary.busdRecipients,
      ETHRequired: formatEther(summary.ethRequired),
      bUSDRequired: formatUnits(summary.busdRequired, 6),
      gasReserveETH: formatEther(gasReserve),
      deployerETH: formatEther(sender.eth),
      deployerBUSD: formatUnits(sender.busd, 6),
      additionalETHNeeded: formatEther(shortfall.eth),
      additionalBUSDNeeded: formatUnits(shortfall.busd, 6),
    }),
  );
  if (!values.execute) {
    console.log("Dry run complete. Nothing signed or sent.");
    return;
  }
  if (shortfall.eth || shortfall.busd)
    throw new Error(
      "Deployer is underfunded; see the shortfalls above. No transactions sent.",
    );
  if (summary.ethRecipients + summary.busdRecipients === 0) {
    console.log("All balances are nonzero; nothing to send.");
    return;
  }
  if (!process.env.ETH_PASSWORD)
    throw new Error(
      "Set ETH_PASSWORD to the encrypted keystore password FILE for noninteractive airdrop signing.",
    );
  const account = process.env.ACCOUNT || "backed-by-fans-testnet";
  const signerArgs = ["--account", account];
  if (process.env.ETH_PASSWORD)
    signerArgs.push("--password-file", process.env.ETH_PASSWORD);
  if (!same(await cast(["wallet", "address", ...signerArgs]), DEPLOYER))
    throw new Error("Foundry account does not match the approved deployer.");
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
  let stopped = false;
  const stop = () => {
    stopped = true;
    console.log("Stopping after the current transfer finishes.");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await writeFile(join(lock, "pid"), String(process.pid));
    const journal = async (entry) =>
      appendFile(logFile, `${JSON.stringify(entry)}\n`);
    const sent = await distribute(rows, {
      stopped: () => stopped,
      owns,
      balances,
      send: async (recipient, asset) => {
        assertChains(await source.getChainId(), await target.getChainId());
        const [latestNonce, pendingNonce] = await Promise.all([
          target.getTransactionCount({ address: DEPLOYER, blockTag: "latest" }),
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
        const request = native
          ? { account: DEPLOYER, to: recipient, value: ETH_AMOUNT }
          : {
              account: DEPLOYER,
              address: token,
              abi: erc20Abi,
              functionName: "transfer",
              args: [recipient, BUSD_AMOUNT],
            };
        const estimate = native
          ? await target.estimateGas(request)
          : await target.estimateContractGas(request);
        const gas = (estimate * 120n + 99n) / 100n;
        const currentSender = await balances(DEPLOYER);
        if (
          currentSender.eth <
            (native ? ETH_AMOUNT : 0n) + gas * fees.maxFeePerGas ||
          (!native && currentSender.busd < BUSD_AMOUNT)
        )
          throw new Error(
            "Deployer funding exhausted. Confirmed transfers are retained; fund and rerun.",
          );
        const args = native
          ? ["send", recipient, "--value", ETH_AMOUNT.toString()]
          : [
              "send",
              token,
              "transfer(address,uint256)(bool)",
              recipient,
              BUSD_AMOUNT.toString(),
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
        const hash = await cast(args);
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
        validatePayout(receipt, transaction, recipient, asset, token);
        await journal({
          status: "confirmed",
          recipient,
          asset,
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
        });
      },
    });
    console.log(
      `Completed: ${sent.eth} ETH transfers, ${sent.busd} bUSD transfers. Receipts: ${logFile}`,
    );
  } finally {
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
