// @vitest-environment node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { foundry } from "@wagmi/cli/plugins";
import { afterEach, describe, expect, it } from "vitest";

import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";

const temporaryProjects: string[] = [];
const temporaryLocks: string[] = [];
const testnetFactory = "0x1111111111111111111111111111111111111111";
const mainnetFactory = "0x2222222222222222222222222222222222222222";

type DeploymentFixture = {
  address: string;
  addressField: "address" | "contractAddress";
  chainId: number;
};

const deploymentCases: {
  name: string;
  deployments: DeploymentFixture[];
  expected: Record<number, string> | undefined;
}[] = [
  { name: "zero deployments", deployments: [], expected: undefined },
  {
    name: "testnet-only deployments using Foundry's address field",
    deployments: [
      { chainId: 46630, address: testnetFactory, addressField: "address" },
    ],
    expected: { 46630: testnetFactory },
  },
  {
    name: "mainnet-only deployments using the legacy contractAddress field",
    deployments: [
      {
        chainId: 4663,
        address: mainnetFactory,
        addressField: "contractAddress",
      },
    ],
    expected: { 4663: mainnetFactory },
  },
  {
    name: "dual-network deployments",
    deployments: [
      { chainId: 46630, address: testnetFactory, addressField: "address" },
      {
        chainId: 4663,
        address: mainnetFactory,
        addressField: "contractAddress",
      },
    ],
    expected: { 4663: mainnetFactory, 46630: testnetFactory },
  },
];

afterEach(async () => {
  await Promise.all([
    ...temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
    ...temporaryLocks
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  ]);
});

describe("generated MembershipFactory ABI", () => {
  it("contains the multi-token constructor, registry, tier tuple, and token withdrawal", () => {
    const constructor = membershipFactoryAbi.find(
      (item) => item.type === "constructor",
    );
    expect(constructor?.inputs[0]).toMatchObject({ type: "address[]" });

    const createTier = membershipFactoryAbi.find(
      (item) => item.type === "function" && item.name === "createTier",
    );
    expect(createTier?.inputs[0]).toMatchObject({
      type: "tuple",
      components: expect.arrayContaining([
        expect.objectContaining({ name: "paymentToken", type: "address" }),
      ]),
    });

    for (const functionName of [
      "paymentTokenCount",
      "paymentTokens",
      "isPaymentTokenListed",
      "isPaymentTokenEnabled",
      "setPaymentTokenEnabled",
      "withdrawProtocolFees",
    ]) {
      expect(
        membershipFactoryAbi.some(
          (item) => item.type === "function" && item.name === functionName,
        ),
      ).toBe(true);
    }
    const withdrawal = membershipFactoryAbi.find(
      (item) =>
        item.type === "function" && item.name === "withdrawProtocolFees",
    );
    expect(withdrawal?.inputs).toEqual([
      expect.objectContaining({ name: "token", type: "address" }),
    ]);
  });
});

describe("generated MembershipTier ABI", () => {
  it("contains atomic presentation writes and metadata refresh events", () => {
    const setPresentation = membershipTierAbi.find(
      (item) => item.type === "function" && item.name === "setPresentation",
    );
    expect(setPresentation?.inputs).toEqual([
      expect.objectContaining({ name: "newRenderer", type: "address" }),
      expect.objectContaining({ name: "newArt", type: "tuple" }),
      expect.objectContaining({ name: "newMedia", type: "tuple" }),
    ]);
    expect(
      membershipTierAbi.some(
        (item) => item.type === "event" && item.name === "PresentationUpdated",
      ),
    ).toBe(true);
    expect(
      membershipTierAbi.some(
        (item) => item.type === "event" && item.name === "BatchMetadataUpdate",
      ),
    ).toBe(true);
  });
});

type ProcessResult = {
  code: number | null;
  stderr: string;
  stdout: string;
};

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createGenerationFixture() {
  const project = await mkdtemp(join(tmpdir(), "bbf-generation-lock-"));
  temporaryProjects.push(project);
  const webDirectory = join(project, "web");
  const scriptDirectory = join(webDirectory, "scripts");
  const binaryDirectory = join(project, "bin");
  const generationLog = join(project, "generation.log");
  await Promise.all([
    mkdir(scriptDirectory, { recursive: true }),
    mkdir(join(webDirectory, "src"), { recursive: true }),
    mkdir(binaryDirectory, { recursive: true }),
  ]);

  const sourceScript = fileURLToPath(
    new URL("../scripts/generate-contracts.sh", import.meta.url),
  );
  const generationScript = join(scriptDirectory, "generate-contracts.sh");
  await copyFile(sourceScript, generationScript);
  await chmod(generationScript, 0o755);

  const fakeBun = join(binaryDirectory, "bun");
  await writeFile(
    fakeBun,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$BBF_TEST_GENERATION_LOG"
if [[ ! -d "$BBF_TEST_LOCK_DIRECTORY" ]]; then
  exit 43
fi
if [[ -n "\${BBF_TEST_BUN_REPLACE_OWNER_ON:-}" && "$*" == *"$BBF_TEST_BUN_REPLACE_OWNER_ON"* ]]; then
  printf '%s\\n' 'pid=999 action=broadcast network=testnet started=foreign token=foreign' >"$BBF_TEST_LOCK_DIRECTORY/owner"
fi
if [[ -n "\${BBF_TEST_BUN_FAIL_ON:-}" && "$*" == *"$BBF_TEST_BUN_FAIL_ON"* ]]; then
  exit 42
fi
`,
  );
  await chmod(fakeBun, 0o755);

  const initialized = await runProcess("git", ["init", "--quiet"], {
    cwd: project,
  });
  expect(initialized.code).toBe(0);
  const canonicalProject = await realpath(project);
  const lockKey = createHash("sha256").update(canonicalProject).digest("hex");
  const lockDirectory = join("/tmp", `bbf-protocol-deployment-${lockKey}.lock`);
  temporaryLocks.push(lockDirectory);

  return {
    generationLog,
    generationScript,
    lockDirectory,
    run: (environment: Record<string, string> = {}) =>
      runProcess("bash", [generationScript], {
        cwd: webDirectory,
        env: {
          ...process.env,
          ...environment,
          BBF_TEST_GENERATION_LOG: generationLog,
          BBF_TEST_LOCK_DIRECTORY: lockDirectory,
          PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        },
      }),
  };
}

describe("ordinary contract generation lock", () => {
  it("does not run while a deployment operation owns the repo-wide lock", async () => {
    const fixture = await createGenerationFixture();
    const packageJson = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };
    const deploymentOwner =
      "pid=123 action=broadcast network=testnet started=2026-08-30T00:00:00Z";
    await mkdir(fixture.lockDirectory);
    await writeFile(join(fixture.lockDirectory, "owner"), deploymentOwner);

    const result = await fixture.run();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "another protocol deployment operation holds the repo-wide lock",
    );
    expect(result.stderr).toContain(deploymentOwner);
    expect(result.stderr).toContain(fixture.lockDirectory);
    expect(packageJson.scripts?.generate).toBe(
      "bash scripts/generate-contracts.sh",
    );
    await expect(
      readFile(join(fixture.lockDirectory, "owner"), "utf8"),
    ).resolves.toBe(deploymentOwner);
    await expect(pathExists(fixture.generationLog)).resolves.toBe(false);
  });

  it("holds the lock across Wagmi and Prettier, then releases it", async () => {
    const fixture = await createGenerationFixture();

    const result = await fixture.run();

    expect(result).toMatchObject({ code: 0, stderr: "" });
    await expect(readFile(fixture.generationLog, "utf8")).resolves.toBe(
      "x wagmi generate\nx prettier --write src/contracts.ts\n",
    );
    await expect(pathExists(fixture.lockDirectory)).resolves.toBe(false);
  });

  it("releases its lock when generation fails", async () => {
    const fixture = await createGenerationFixture();

    const result = await fixture.run({ BBF_TEST_BUN_FAIL_ON: "prettier" });

    expect(result.code).toBe(42);
    await expect(pathExists(fixture.lockDirectory)).resolves.toBe(false);
  });

  it("does not release a lock whose owner changed", async () => {
    const fixture = await createGenerationFixture();

    const result = await fixture.run({
      BBF_TEST_BUN_FAIL_ON: "prettier",
      BBF_TEST_BUN_REPLACE_OWNER_ON: "prettier",
    });

    expect(result.code).toBe(42);
    await expect(
      readFile(join(fixture.lockDirectory, "owner"), "utf8"),
    ).resolves.toContain("token=foreign");
    await expect(pathExists(fixture.lockDirectory)).resolves.toBe(true);
  });
});

async function generateFactoryAddress(deployments: DeploymentFixture[]) {
  const project = await mkdtemp(join(tmpdir(), "bbf-wagmi-foundry-"));
  temporaryProjects.push(project);

  const artifactDirectory = join(project, "out", "MembershipFactory.sol");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    join(project, "foundry.toml"),
    "[profile.default]\nout = 'out'\n",
  );
  await writeFile(
    join(artifactDirectory, "MembershipFactory.json"),
    JSON.stringify({
      abi: [
        {
          type: "function",
          name: "owner",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
    }),
  );

  for (const deployment of deployments) {
    const broadcastDirectory = join(
      project,
      "broadcast",
      "DeployDirectProtocol.s.sol",
      String(deployment.chainId),
    );
    await mkdir(broadcastDirectory, { recursive: true });
    await writeFile(
      join(broadcastDirectory, "run-latest.json"),
      JSON.stringify({
        transactions: [
          {
            hash: `0x${"ab".repeat(32)}`,
            transactionType: "CALL",
            contractName: null,
            contractAddress: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
            additionalContracts: [
              {
                transactionType: "CREATE2",
                contractName: "MembershipFactory",
                [deployment.addressField]: deployment.address,
              },
            ],
          },
        ],
      }),
    );
  }

  const plugin = foundry({
    project,
    includeBroadcasts: true,
    include: ["MembershipFactory.sol/MembershipFactory.json"],
    forge: { build: false, clean: false, rebuild: false },
  });
  const contracts = await plugin.contracts();
  return contracts.find(({ name }) => name === "MembershipFactory")?.address;
}

describe("Wagmi Foundry broadcast generation", () => {
  it.each(deploymentCases)(
    "reads $name from CALL additionalContracts",
    async ({ deployments, expected }) => {
      await expect(generateFactoryAddress(deployments)).resolves.toEqual(
        expected,
      );
    },
  );

  it("preserves both protocol networks without an internal payment-token deployment", async () => {
    const project = await mkdtemp(join(tmpdir(), "bbf-wagmi-staged-"));
    temporaryProjects.push(project);
    await writeFile(
      join(project, "foundry.toml"),
      "[profile.default]\nout = 'out'\n",
    );

    for (const contractName of ["MembershipFactory"]) {
      const artifactDirectory = join(project, "out", `${contractName}.sol`);
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        join(artifactDirectory, `${contractName}.json`),
        JSON.stringify({
          abi: [
            {
              type: "function",
              name: "identity",
              stateMutability: "view",
              inputs: [],
              outputs: [{ type: "address" }],
            },
          ],
        }),
      );
    }

    async function writeBroadcast(
      script: string,
      chainId: number,
      transaction: Record<string, unknown>,
    ) {
      const directory = join(project, "broadcast", script, String(chainId));
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "run-latest.json"),
        JSON.stringify({ transactions: [transaction] }),
      );
    }

    for (const [chainId, address] of [
      [46_630, testnetFactory],
      [4_663, mainnetFactory],
    ] as const) {
      await writeBroadcast("DeployDirectProtocol.s.sol", chainId, {
        transactionType: "CALL",
        contractAddress: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
        additionalContracts: [
          {
            transactionType: "CREATE2",
            contractName: "MembershipFactory",
            address,
          },
        ],
      });
    }

    const plugin = foundry({
      project,
      includeBroadcasts: true,
      include: ["MembershipFactory.sol/MembershipFactory.json"],
      forge: { build: false, clean: false, rebuild: false },
    });
    const contracts = await plugin.contracts();
    expect(
      contracts.find(({ name }) => name === "MembershipFactory")?.address,
    ).toEqual({ 4_663: mainnetFactory, 46_630: testnetFactory });
    expect(contracts.some(({ name }) => name === "TestnetUSDG")).toBe(false);
  });
});
