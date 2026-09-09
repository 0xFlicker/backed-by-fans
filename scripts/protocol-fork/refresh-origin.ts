import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { originPin } from "./origin";
import { runPreflight } from "./preflight";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "web/package.json"));
const {
  createPublicClient,
  http,
}: typeof import("../../web/node_modules/viem") = require("viem");

/** Read-only chain inspection. --apply updates only the checked-in local pin. */
export async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const filtered = args.filter((value) => value !== "--apply");
  if (
    filtered.length !== 2 ||
    (!["safe", "finalized"].includes(filtered[0]) &&
      !/^[1-9][0-9]*$/.test(filtered[0]))
  )
    throw new Error(
      "Usage: bun scripts/protocol-fork/refresh-origin.ts safe|finalized|BLOCK FRESH_EVIDENCE_DIR [--apply]",
    );
  const rpcUrl = process.env.BBF_FORK_RPC_URL;
  if (!rpcUrl || !["http:", "https:"].includes(new URL(rpcUrl).protocol))
    throw new Error("Configure BBF_FORK_RPC_URL privately in the environment");
  const output = resolve(filtered[1]);
  // Never mix a new candidate with previous verification or overwrite evidence.
  await mkdir(output, { recursive: false });
  const client = createPublicClient({
    transport: http(rpcUrl, { retryCount: 0, timeout: 15000 }),
  });
  const block = await client.getBlock(
    /^[0-9]+$/.test(filtered[0])
      ? { blockNumber: BigInt(filtered[0]) }
      : { blockTag: filtered[0] as "safe" | "finalized" },
  );
  if (!block.hash || !block.number)
    throw new Error("Candidate block has no canonical identity");
  const candidate = {
    ...originPin,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
  };
  const inputs = JSON.parse(
    await readFile(resolve(root, originPin.inputsPath), "utf8"),
  );
  const report = await runPreflight(
    client,
    { blockNumber: block.number, blockHash: block.hash },
    inputs,
  );
  const rechecked = await client.getBlock({ blockNumber: block.number });
  const headerUnchanged = rechecked.hash === block.hash;
  const passed = report.status === "passed" && headerUnchanged;
  await writeFile(
    resolve(output, "origin.json"),
    JSON.stringify(candidate, null, 2) + "\n",
  );
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        ...report,
        status: passed ? "passed" : "failed",
        previousOrigin: originPin,
        headerUnchanged,
        selectedBy: filtered[0],
        timestamp: block.timestamp.toString(),
        scope:
          "read-only-origin-refresh; deployment and graduation require a new fork run",
      },
      null,
      2,
    ) + "\n",
  );
  for (const check of report.checks.filter(
    (value) => value.status === "failed",
  ))
    console.error(`${check.id}: ${check.reason}`);
  if (!passed)
    throw new Error(
      `Candidate verification failed; inspect ${resolve(output, "report.json")}. Existing pin is unchanged.`,
    );
  if (apply) {
    const path = resolve(root, "scripts/protocol-fork/origin.json");
    // The retained source locks are intentionally unchanged. Changed code must be investigated.
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(candidate, null, 2) + "\n");
    await rename(temporary, path);
  }
  console.log(
    `Verified origin ${candidate.blockNumber} (${candidate.blockHash}). ${apply ? "Updated origin.json; running forks are unchanged." : "Candidate only; existing pin unchanged."} Evidence: ${output}`,
  );
}

if (import.meta.main)
  main().catch((error: unknown) => {
    // RPC libraries can include credentials in causes or messages; print no provider text.
    const message =
      error instanceof Error &&
      /^(Usage:|Configure BBF_FORK_RPC_URL|Candidate verification failed;)/.test(
        error.message,
      )
        ? error.message
        : "Origin refresh failed; check the fresh output path, private RPC access and compiled artifacts. Provider details omitted.";
    console.error(message);
    process.exitCode = 1;
  });
