#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    broadcast: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

async function main() {
  if (values.help) {
    console.log(
      "Usage: node scripts/deploy-holder-airdrop.mjs [--broadcast]\nLoads the testnet RPC from contracts/.env. Uses the imported Foundry account backed-by-fans-testnet.\nDefault: simulate only. --broadcast: deploy, with Foundry's native hidden password prompt.",
    );
    return;
  }
  const configured = parseEnv(await readFile(`${root}contracts/.env`, "utf8"));
  const rpc =
    process.env.ROBINHOOD_TESTNET_RPC_URL ||
    configured.ROBINHOOD_TESTNET_RPC_URL;
  if (!rpc)
    throw new Error(
      "ROBINHOOD_TESTNET_RPC_URL is missing from the environment and contracts/.env.",
    );
  const url = new URL(rpc);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Testnet RPC must be an HTTP or HTTPS URL.");
  const args = [
    "script",
    "script/HolderAirdrop.s.sol:DeployHolderAirdrop",
    "--rpc-url",
    rpc,
    "--sender",
    "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027",
    "--gas-limit",
    "10000000000",
    "--slow",
  ];
  if (values.broadcast)
    args.push("--account", "backed-by-fans-testnet", "--broadcast");
  console.log(
    values.broadcast
      ? "Deploying HolderAirdrop on Robinhood testnet with your imported Foundry wallet."
      : "Simulating HolderAirdrop deployment on Robinhood testnet; no signing or broadcast.",
  );
  const child = spawn("forge", args, {
    cwd: `${root}contracts`,
    // Do not load signing keys or password overrides from dotenv or the shell.
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      FOUNDRY_PROFILE: "robinhood",
    },
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Foundry exited ${signal || code}. Check its output before retrying.`,
          ),
        );
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
