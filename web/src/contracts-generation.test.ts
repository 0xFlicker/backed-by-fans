// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { foundry } from "@wagmi/cli/plugins";
import { afterEach, describe, expect, it } from "vitest";

const temporaryProjects: string[] = [];
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
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
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
                transactionType: "CREATE",
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
});
