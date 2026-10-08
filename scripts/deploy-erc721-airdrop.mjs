#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

// Foundry owns simulation, signing, receipts, and public broadcast records.
// This wrapper only loads the existing private RPC and passes explicit options.
const contracts = fileURLToPath(new URL("../contracts/", import.meta.url));
const args = process.argv.slice(2);
let broadcast = false;
let authorize = false;
let sender;
let account;
let helper;
for (let i = 0; i < args.length; ++i) {
  const flag = args[i];
  if (flag === "--broadcast") broadcast = true;
  else if (flag === "--authorize") authorize = true;
  else if (["--sender", "--account", "--helper"].includes(flag)) {
    const value = args[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`${flag} needs a value`);
    if (flag === "--sender") sender = value;
    if (flag === "--account") account = value;
    if (flag === "--helper") helper = value;
  } else throw new Error(`Unknown argument ${flag}`);
}
if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender))
  throw new Error(
    "Provide --sender with the deployment wallet (or collection owner for --authorize).",
  );
if (broadcast && !account)
  throw new Error(
    "Broadcast requires --account naming your imported Foundry keystore. Foundry prompts privately for its password.",
  );
if (helper && !authorize)
  throw new Error("--helper is only used with --authorize.");
if (authorize && (!helper || !/^0x[0-9a-fA-F]{40}$/.test(helper)))
  throw new Error(
    "--authorize requires --helper with the deployed helper address.",
  );
const values = parseEnv(
  readFileSync(new URL("../contracts/.env", import.meta.url), "utf8"),
);
const rpc = values.ROBINHOOD_MAINNET_RPC_URL;
if (!rpc)
  throw new Error("Missing ROBINHOOD_MAINNET_RPC_URL in contracts/.env");
const script = authorize
  ? "script/AuthorizeERC721Airdrop.s.sol:AuthorizeERC721Airdrop"
  : "script/DeployERC721Airdrop.s.sol:DeployERC721Airdrop";
const command = [
  "script",
  script,
  "--rpc-url",
  rpc,
  "--sender",
  sender,
  "--slow",
];
if (account) command.push("--account", account);
if (broadcast) command.push("--broadcast");
process.stdout.write(
  `${broadcast ? "Broadcasting" : "Simulating only"}: ${authorize ? "creator registry setup" : "ERC721 helper deployment"} on Robinhood mainnet.\n`,
);
const result = spawnSync("forge", command, {
  cwd: contracts,
  env: {
    ...process.env,
    FOUNDRY_PROFILE: "robinhood",
    ...(helper ? { AIRDROP_HELPER: helper, AIRDROP_CREATOR: sender } : {}),
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
