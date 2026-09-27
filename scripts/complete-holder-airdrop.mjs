#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../web/package.json", import.meta.url));
const {
  createPublicClient,
  http,
  getAddress,
  erc20Abi,
  erc721Abi,
  parseAbi,
  formatEther,
  formatUnits,
  parseEther,
  parseGwei,
  parseEventLogs,
} = require("viem");
const { robinhoodTestnet } = require("viem/chains");
const helperAbi = parseAbi([
  "function operator() view returns (address)",
  "function tier() view returns (address)",
  "function paymentToken() view returns (address)",
  "function pricePerPeriod() view returns (uint256)",
  "function periodDuration() view returns (uint64)",
  "function ethAmount() view returns (uint256)",
  "function MAX_BATCH() view returns (uint256)",
  "function ethCompleted(address) view returns (bool)",
  "function membershipCompleted(address) view returns (bool)",
  "event ETHDelivered(address indexed recipient,uint256 amount)",
  "event MembershipDelivered(address indexed recipient,uint256 indexed tokenId,uint256 amount)",
]);
const nativeAbi = parseAbi([
  "function getEthBalance(address) view returns (uint256)",
]);
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const positive = (n) => (n > 0n ? n : 0n);
let activeRPC;
const safeError = (message) =>
  String(message)
    .split(activeRPC || "\u0000")
    .join("[RPC]")
    .replace(/https?:\/\/[^\s"']+/g, "[URL]");

export function selectEligible(rows, ethAmount) {
  return rows.filter(
    (r) =>
      (!r.ethCompleted && r.eth < ethAmount) ||
      (!r.membershipCompleted && r.memberships === 0n),
  );
}

export function fundingFor(rows, price, ethAmount, currentETH, currentTokens) {
  // Cover both assets for selected wallets whose flags remain unset. A wallet may
  // spend ETH or transfer its NFT between the read and the contract's live check.
  const ethBudget =
    BigInt(rows.filter((r) => !r.ethCompleted).length) * ethAmount;
  const tokenBudget =
    BigInt(rows.filter((r) => !r.membershipCompleted).length) * price;
  return {
    ethBudget,
    tokenBudget,
    ethDeposit: positive(ethBudget - currentETH),
    tokenDeposit: positive(tokenBudget - currentTokens),
  };
}

export function validateImports(plan, rows) {
  const map = new Map(rows.map((r) => [r.address.toLowerCase(), r]));
  for (const [list, field] of [
    [plan.ethCompleted, "ethCompleted"],
    [plan.membershipCompleted, "membershipCompleted"],
  ]) {
    for (const address of list) {
      const row = map.get(address.toLowerCase());
      if (row && !row[field])
        throw new Error(
          `Import old progress before continuing: ${address} (${field}).`,
        );
    }
  }
}

async function promptPassword(account) {
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new Error(
      "Run --execute in your terminal for the hidden vault password prompt.",
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
    return Buffer.from(await rl.question("", { signal: abort.signal }), "utf8");
  } finally {
    process.removeListener("SIGTERM", cancel);
    rl.close();
    muted.end();
    process.stderr.write("\n");
  }
}

async function cast(args, rpc) {
  return await new Promise((done, reject) => {
    const child = spawn("cast", args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    child.stdout.on("data", (d) => {
      output += d;
    });
    child.stderr.on("data", (d) => {
      error = (error + d).slice(-4000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) done(output.trim());
      else
        reject(
          new Error(
            `cast failed (${code}): ${error
              .split(rpc)
              .join("[RPC]")
              .replace(/https?:\/\/[^\s"']+/g, "[URL]")}`,
          ),
        );
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      execute: { type: "boolean", default: false },
      plan: {
        type: "string",
        default: join(root, "contracts/deployments/holder-airdrop-plan.json"),
      },
      deployment: {
        type: "string",
        default: join(root, "contracts/deployments/holder-airdrop-helper.json"),
      },
      account: { type: "string", default: "backed-by-fans-testnet" },
      "gas-reserve": { type: "string", default: "0.1" },
      "max-fee-gwei": { type: "string", default: "1" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      "Usage: node scripts/complete-holder-airdrop.mjs [--execute]\nDefault: fast bulk preview. --execute: unlock once, top up only the required helper funding, then complete all eligible holders in batches of 25.\nNo Forge fork simulation. Foundry cast owns signing, gas estimates, sending, and confirmation.\nOptions: --plan FILE --deployment FILE --account NAME --gas-reserve ETH --max-fee-gwei GWEI",
    );
    return;
  }
  const plan = JSON.parse(await readFile(resolve(values.plan), "utf8"));
  const deployment = JSON.parse(
    await readFile(resolve(values.deployment), "utf8"),
  );
  if (
    plan.chainId !== 46630 ||
    deployment.chainId !== 46630 ||
    !same(plan.tier, deployment.tier) ||
    !same(plan.operator, deployment.operator) ||
    !same(plan.paymentToken, deployment.paymentToken) ||
    !Array.isArray(plan.recipients) ||
    !Array.isArray(plan.ethCompleted) ||
    !Array.isArray(plan.membershipCompleted)
  ) {
    throw new Error(
      "Plan and helper deployment must describe the same Robinhood testnet campaign.",
    );
  }
  const recipients = plan.recipients.map((address) => getAddress(address));
  if (
    recipients.length === 0 ||
    new Set(recipients.map((a) => a.toLowerCase())).size !==
      recipients.length ||
    recipients.some((a) => BigInt(a) === 0n)
  )
    throw new Error("Invalid or duplicate plan recipients.");
  const helper = getAddress(deployment.address),
    operator = getAddress(deployment.operator);
  const tier = getAddress(deployment.tier),
    token = getAddress(deployment.paymentToken);
  const price = BigInt(deployment.pricePerPeriod),
    ethAmount = BigInt(deployment.ethAmount);
  if (price <= 0n || ethAmount <= 0n || deployment.maxBatch !== 25)
    throw new Error("Invalid helper terms.");
  const gasReserve = parseEther(values["gas-reserve"]),
    feeCeiling = parseGwei(values["max-fee-gwei"]);
  if (gasReserve <= 0n || feeCeiling <= 0n)
    throw new Error("Gas reserve and fee ceiling must be positive.");
  const config = parseEnv(await readFile(join(root, "contracts/.env"), "utf8"));
  const rpc =
    process.env.ROBINHOOD_TESTNET_RPC_URL || config.ROBINHOOD_TESTNET_RPC_URL;
  if (!rpc)
    throw new Error("Missing ROBINHOOD_TESTNET_RPC_URL in contracts/.env.");
  activeRPC = rpc;
  const client = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(rpc),
  });
  let directory,
    lockHeld = false,
    password,
    passwordFile;
  const lock = join(
    tmpdir(),
    `bbf-complete-airdrop-${helper.toLowerCase()}.lock`,
  );
  let stopped = false;
  const stop = () => {
    stopped = true;
    console.error(
      "Stopping after the current Foundry command. Rerun to resume from onchain completion.",
    );
  };
  const assertRunning = () => {
    if (stopped) throw new Error("Stopped before the next transaction.");
  };
  const checkNonce = async () => {
    const [latest, pending] = await Promise.all([
      client.getTransactionCount({ address: operator, blockTag: "latest" }),
      client.getTransactionCount({ address: operator, blockTag: "pending" }),
    ]);
    if (latest !== pending)
      throw new Error(
        "Operator has pending transactions. Resolve them before rerunning.",
      );
  };
  try {
    if (values.execute) {
      try {
        await mkdir(lock);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        throw new Error(
          `Completion runner lock exists at ${lock}. Check its saved PID and pending transactions before removing a stale lock.`,
        );
      }
      lockHeld = true;
      await writeFile(join(lock, "pid"), String(process.pid));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      password = await promptPassword(values.account);
      directory = await mkdtemp(join(tmpdir(), "bbf-complete-vault-"));
      passwordFile = join(directory, "password");
      await writeFile(passwordFile, password, { mode: 0o600, flag: "wx" });
      password.fill(0);
      password = undefined;
      const address = await cast(
        [
          "wallet",
          "address",
          "--account",
          values.account,
          "--password-file",
          passwordFile,
        ],
        rpc,
      );
      if (!same(address, operator))
        throw new Error(
          "Foundry account does not match the campaign operator.",
        );
      assertRunning();
    }
    if ((await client.getChainId()) !== 46630)
      throw new Error("Wrong RPC chain.");
    const code = await client.getCode({ address: helper });
    if (!code || code === "0x") throw new Error("Helper is not deployed.");
    const fields = [
      "operator",
      "tier",
      "paymentToken",
      "pricePerPeriod",
      "periodDuration",
      "ethAmount",
      "MAX_BATCH",
    ];
    const terms = await client.multicall({
      batchSize: 0,
      allowFailure: false,
      contracts: fields.map((functionName) => ({
        address: helper,
        abi: helperAbi,
        functionName,
      })),
    });
    if (
      !same(terms[0], operator) ||
      !same(terms[1], tier) ||
      !same(terms[2], token) ||
      terms[3] !== price ||
      terms[4] !== BigInt(deployment.periodDuration) ||
      terms[5] !== ethAmount ||
      terms[6] !== 25n
    ) {
      throw new Error("Deployed helper terms differ from the plan.");
    }
    await checkNonce();
    const nativeReader = robinhoodTestnet.contracts.multicall3.address;
    const readRows = async () => {
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const rows = [];
      for (let offset = 0; offset < recipients.length; offset += 400) {
        assertRunning();
        const group = recipients.slice(offset, offset + 400);
        const pages = [];
        for (let start = 0; start < group.length; start += 100)
          pages.push(group.slice(start, start + 100));
        const results = await Promise.all(
          pages.map(async (page) => {
            const data = await client.multicall({
              blockNumber,
              batchSize: 0,
              allowFailure: false,
              contracts: page.flatMap((address) => [
                {
                  address: helper,
                  abi: helperAbi,
                  functionName: "ethCompleted",
                  args: [address],
                },
                {
                  address: helper,
                  abi: helperAbi,
                  functionName: "membershipCompleted",
                  args: [address],
                },
                {
                  address: tier,
                  abi: erc721Abi,
                  functionName: "balanceOf",
                  args: [address],
                },
                {
                  address: nativeReader,
                  abi: nativeAbi,
                  functionName: "getEthBalance",
                  args: [address],
                },
              ]),
            });
            return page.map((address, i) => ({
              address,
              ethCompleted: data[i * 4],
              membershipCompleted: data[i * 4 + 1],
              memberships: data[i * 4 + 2],
              eth: data[i * 4 + 3],
            }));
          }),
        );
        rows.push(...results.flat());
        console.log(
          `Checked ${rows.length}/${recipients.length} holders in bulk.`,
        );
      }
      validateImports(plan, rows);
      return rows;
    };
    const balances = () =>
      Promise.all([
        client.getBalance({ address: helper }),
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [helper],
        }),
        client.getBalance({ address: operator }),
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [operator],
        }),
      ]);
    const send = async (to, signature, args, value = 0n) => {
      assertRunning();
      const fees = await client.estimateFeesPerGas();
      if (fees.maxFeePerGas > feeCeiling)
        throw new Error("Fee exceeds --max-fee-gwei; stopped before signing.");
      const output = await cast(
        [
          "send",
          to,
          signature,
          ...args,
          "--value",
          value.toString(),
          "--rpc-url",
          rpc,
          "--account",
          values.account,
          "--password-file",
          passwordFile,
          "--json",
          "--confirmations",
          "2",
          "--timeout",
          "180",
          "--gas-price",
          fees.maxFeePerGas.toString(),
          "--priority-gas-price",
          fees.maxPriorityFeePerGas.toString(),
        ],
        rpc,
      );
      const receipt = JSON.parse(output);
      if (
        !/^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash) ||
        !["0x1", "success", 1].includes(receipt.status) ||
        !same(receipt.to, to) ||
        !same(receipt.from, operator)
      ) {
        throw new Error(
          "Foundry receipt did not confirm the expected transaction. Check pending transactions before retrying.",
        );
      }
      console.log(`${signature}: ${receipt.transactionHash}`);
      return receipt;
    };
    const totals = { eth: 0, memberships: 0, batches: 0 };
    while (true) {
      const allRows = await readRows();
      const rows = selectEligible(allRows, ethAmount);
      if (rows.length === 0) {
        console.log(
          `Complete: no eligible holders remain in this saved plan. This run sent ${totals.eth} ETH deliveries and ${totals.memberships} memberships in ${totals.batches} batches.`,
        );
        return;
      }
      const [helperETH, helperTokens, operatorETH, operatorTokens] =
        await balances();
      const funding = fundingFor(
        rows,
        price,
        ethAmount,
        helperETH,
        helperTokens,
      );
      console.log(
        JSON.stringify(
          {
            eligibleHolders: rows.length,
            eligibleETH: rows.filter(
              (r) => !r.ethCompleted && r.eth < ethAmount,
            ).length,
            eligibleMemberships: rows.filter(
              (r) => !r.membershipCompleted && r.memberships === 0n,
            ).length,
            batches: Math.ceil(rows.length / 25),
            helperETH: formatEther(helperETH),
            helperTokens: formatUnits(helperTokens, 6),
            depositETH: formatEther(funding.ethDeposit),
            depositTokens: formatUnits(funding.tokenDeposit, 6),
            operatorETH: formatEther(operatorETH),
            operatorTokens: formatUnits(operatorTokens, 6),
            additionalETHNeeded: formatEther(
              positive(funding.ethDeposit + gasReserve - operatorETH),
            ),
            additionalTokensNeeded: formatUnits(
              positive(funding.tokenDeposit - operatorTokens),
              6,
            ),
          },
          null,
          2,
        ),
      );
      if (!values.execute) return;
      if (
        operatorETH < funding.ethDeposit + gasReserve ||
        operatorTokens < funding.tokenDeposit
      ) {
        throw new Error(
          "Operator funding is insufficient for the remaining airdrop and gas reserve. Nothing more sent.",
        );
      }
      if (funding.tokenDeposit > 0n) {
        const allowance = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [operator, helper],
        });
        if (allowance < funding.tokenDeposit)
          await send(token, "approve(address,uint256)", [
            helper,
            funding.tokenDeposit.toString(),
          ]);
      }
      if (funding.ethDeposit > 0n || funding.tokenDeposit > 0n) {
        await send(
          helper,
          "fund(uint256)",
          [funding.tokenDeposit.toString()],
          funding.ethDeposit,
        );
      }
      let delivered = 0;
      for (let offset = 0; offset < rows.length; offset += 25) {
        assertRunning();
        const batch = rows.slice(offset, offset + 25);
        console.log(
          `Sending batch ${Math.floor(offset / 25) + 1}/${Math.ceil(rows.length / 25)} (${batch.length} eligible holders).`,
        );
        const receipt = await send(helper, "distribute(address[])", [
          `[${batch.map((r) => r.address).join(",")}]`,
        ]);
        const events = parseEventLogs({
          abi: helperAbi,
          logs: receipt.logs.filter((l) => same(l.address, helper)),
        });
        const eth = events.filter((l) => l.eventName === "ETHDelivered").length;
        const memberships = events.filter(
          (l) => l.eventName === "MembershipDelivered",
        ).length;
        totals.eth += eth;
        totals.memberships += memberships;
        totals.batches++;
        delivered += eth + memberships;
        console.log(
          `Confirmed: ${eth} ETH deliveries, ${memberships} memberships. Total this run: ${totals.eth} ETH, ${totals.memberships} memberships.`,
        );
      }
      if (delivered === 0)
        throw new Error(
          "No delivery events occurred despite eligible preflight results. Stopped; check chain state before retrying.",
        );
      console.log("Checking the full plan for any remaining eligible holders…");
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    password?.fill(0);
    if (directory) await rm(directory, { recursive: true, force: true });
    if (lockHeld) await rm(lock, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(safeError(error.shortMessage || error.message));
    process.exitCode = 1;
  });
}
