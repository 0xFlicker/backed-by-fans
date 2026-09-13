import { parseSupportedChainId } from "../src/lib/chains";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseRehearsalInput, rehearseBuybacks } from "./buyback-rehearsal";
import { validateAdminRpc } from "./protocol-admin";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "app-url": { type: "string", default: "http://127.0.0.1:3110" },
    "chain-id": { type: "string" },
    input: { type: "string" },
    output: { type: "string" },
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Usage: buyback-tools.sh review --chain-id <id> | rehearse --input /absolute/settings.json --output /absolute/report.json",
  );
if (positionals[0] === "review") {
  const chainId = parseSupportedChainId(values["chain-id"] ?? "");
  if (!chainId)
    throw new Error("Review requires --chain-id with a supported network ID.");
  const url = new URL(`/chains/${chainId}/tools/buybacks`, values["app-url"]);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Use the local development website");
  console.log(
    `Live buyback settings: ${url}. Balances load automatically; no policy JSON needed.`,
  );
  const open = spawn(
    process.platform === "darwin" ? "open" : "xdg-open",
    [url.toString()],
    { stdio: "inherit" },
  );
  open.on("error", () => {
    console.error(`Open ${url} in your browser.`);
    process.exitCode = 1;
  });
} else if (positionals[0] === "rehearse") {
  if (!values.input || !values.output)
    throw new Error(
      "Rehearse needs --input and --output absolute paths; the website does not require files",
    );
  const rpc = process.env.BBF_ADMIN_RPC_URL ?? "";
  validateAdminRpc("forknet", rpc);
  const input = parseRehearsalInput(
    JSON.parse(await readFile(values.input, "utf8")),
  );
  const result = await rehearseBuybacks(
    rpc,
    input,
    AbortSignal.timeout(120_000),
  );
  await writeFile(values.output, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(result.summary);
} else
  throw new Error(
    "Supported commands: review, rehearse. Use run-buybacks.ts for one execution sweep.",
  );
