import { getAddress, keccak256, type Address, type PublicClient } from "viem";

import {
  onchainMetadataRendererAbi,
  robinhoodMembershipFactoryAbi,
  usdgAbi,
} from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  RendererRegistryEntry,
} from "@/contracts/types";
import { isSameAddress } from "@/lib/address";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export type ProtocolSnapshot = ProtocolDependencySnapshot & {
  owner: Address;
  pendingOwner: Address;
  feeRecipient: Address;
  protocolFeeBps: number;
  protocolBalance: bigint;
  tierCount: bigint;
};

export const membershipRendererSchema =
  "0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4" as const;

const maxRendererManifestEngines = 64;

export type ProtocolDependencyReadState =
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "valid" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "wrong-chain" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "unavailable" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "rate-limited" }>
  | Extract<
      ReadState<ProtocolDependencySnapshot>,
      { status: "interface-mismatch" }
    >;

export async function readProtocolDependencies(
  client: PublicClient,
  deployment: DeploymentAvailability,
  blockNumber?: bigint,
): Promise<ProtocolDependencyReadState> {
  if (deployment.status !== "ready") {
    return {
      status: "unavailable",
      reason: "not-deployed",
      label: deployment.detail,
    };
  }

  try {
    const [capturedBlock, rpcChainId] = await Promise.all([
      blockNumber === undefined
        ? client.getBlockNumber({ cacheTime: 0 })
        : Promise.resolve(blockNumber),
      client.getChainId(),
    ]);
    if (rpcChainId !== deployment.chainId) {
      return {
        status: "wrong-chain",
        expectedChainId: deployment.chainId,
        actualChainId: rpcChainId,
        label: "The RPC does not match the selected membership network.",
      };
    }

    const [
      boundToken,
      rendererSchema,
      rendererCount,
      mediaStoreFactory,
      mediaStoreFactoryRuntimeCodehash,
    ] = await Promise.all([
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "paymentToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "rendererSchema",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "rendererCount",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "mediaStoreFactory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "mediaStoreFactoryRuntimeCodehash",
        blockNumber: capturedBlock,
      }),
    ]);

    const failedChecks: string[] = [];
    if (!isSameAddress(boundToken, deployment.usdgAddress)) {
      failedChecks.push("factory USDG binding");
    }
    if (rendererSchema !== membershipRendererSchema) {
      failedChecks.push("renderer schema");
    }
    if (rendererCount < 1) {
      failedChecks.push("renderer registry");
    }

    const rendererRecords = await Promise.all(
      Array.from({ length: rendererCount }, (_, index) => {
        const version = index + 1;
        return client
          .readContract({
            address: deployment.factoryAddress,
            abi: robinhoodMembershipFactoryAbi,
            functionName: "rendererRecord",
            args: [version],
            blockNumber: capturedBlock,
          })
          .then((record): RendererRegistryEntry => ({
            version,
            implementation: getAddress(record.implementation),
            runtimeCodehash: record.runtimeCodehash,
            enabled: record.enabled,
            name: undefined,
          }));
      }),
    );

    const [rendererCodes, mediaStoreFactoryCode] = await Promise.all([
      Promise.all(
        rendererRecords.map((record) =>
          client.getBytecode({
            address: record.implementation,
            blockNumber: capturedBlock,
          }),
        ),
      ),
      client.getBytecode({
        address: mediaStoreFactory,
        blockNumber: capturedBlock,
      }),
    ]);
    rendererRecords.forEach((record, index) => {
      const code = rendererCodes[index];
      if (!code || code === "0x") {
        failedChecks.push(`renderer ${record.version} code`);
      } else if (keccak256(code) !== record.runtimeCodehash) {
        failedChecks.push(`renderer ${record.version} runtime identity`);
      }
    });
    if (!mediaStoreFactoryCode || mediaStoreFactoryCode === "0x") {
      failedChecks.push("media registry code");
    } else if (
      keccak256(mediaStoreFactoryCode) !== mediaStoreFactoryRuntimeCodehash
    ) {
      failedChecks.push("media registry runtime identity");
    }

    if (failedChecks.length === 0) {
      const manifestReads = await Promise.allSettled(
        rendererRecords.map(async (record) => {
          const [implementationSchema, reverseVersion, manifest] =
            await Promise.all([
              client.readContract({
                address: record.implementation,
                abi: onchainMetadataRendererAbi,
                functionName: "rendererSchema",
                blockNumber: capturedBlock,
              }),
              client.readContract({
                address: deployment.factoryAddress,
                abi: robinhoodMembershipFactoryAbi,
                functionName: "rendererVersionOf",
                args: [record.implementation],
                blockNumber: capturedBlock,
              }),
              record.enabled
                ? Promise.all([
                    client.readContract({
                      address: record.implementation,
                      abi: onchainMetadataRendererAbi,
                      functionName: "rendererName",
                      blockNumber: capturedBlock,
                    }),
                    client.readContract({
                      address: record.implementation,
                      abi: onchainMetadataRendererAbi,
                      functionName: "engineCount",
                      blockNumber: capturedBlock,
                    }),
                  ]).then(async ([name, rawEngineCount]) => {
                    const engineCount = Number(rawEngineCount);
                    const engineNames =
                      Number.isSafeInteger(engineCount) &&
                      engineCount > 0 &&
                      engineCount <= maxRendererManifestEngines
                        ? await Promise.all(
                            Array.from({ length: engineCount }, (_, engine) =>
                              client.readContract({
                                address: record.implementation,
                                abi: onchainMetadataRendererAbi,
                                functionName: "engineName",
                                args: [engine],
                                blockNumber: capturedBlock,
                              }),
                            ),
                          )
                        : undefined;
                    return { name, engineCount, engineNames };
                  })
                : Promise.resolve({
                    name: undefined,
                    engineCount: undefined,
                    engineNames: undefined,
                  }),
            ]);
          return { implementationSchema, reverseVersion, ...manifest };
        }),
      );
      manifestReads.forEach((result, index) => {
        const record = rendererRecords[index];
        if (result.status === "rejected") {
          failedChecks.push(`renderer ${record.version} manifest`);
          return;
        }
        if (result.value.implementationSchema !== rendererSchema) {
          failedChecks.push(`renderer ${record.version} schema`);
        }
        if (result.value.reverseVersion !== record.version) {
          failedChecks.push(`renderer ${record.version} reverse index`);
        }
        if (
          record.enabled &&
          (!result.value.name ||
            result.value.name.trim().length === 0 ||
            !Number.isSafeInteger(result.value.engineCount) ||
            (result.value.engineCount ?? 0) < 1)
        ) {
          failedChecks.push(`renderer ${record.version} manifest`);
        } else {
          record.name = result.value.name;
          record.engineCount = result.value.engineCount;
          record.engineNames = result.value.engineNames;
        }
      });
    }

    if (failedChecks.length > 0) {
      return {
        status: "interface-mismatch",
        address: deployment.factoryAddress,
        failedChecks,
        label:
          "The canonical factory dependencies do not match their snapshotted runtime identities.",
      };
    }

    return {
      status: "valid",
      capturedBlock,
      data: {
        chainId: deployment.chainId,
        factory: deployment.factoryAddress,
        paymentToken: deployment.usdgAddress,
        rendererSchema,
        rendererCount,
        renderers: rendererRecords,
        defaultRendererVersion:
          rendererRecords.filter((record) => record.enabled).length === 1
            ? rendererRecords.find((record) => record.enabled)?.version
            : undefined,
        mediaStoreFactory,
        mediaStoreFactoryRuntimeCodehash,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}

export async function readProtocolState(
  client: PublicClient,
  deployment: DeploymentAvailability,
): Promise<ReadState<ProtocolSnapshot>> {
  const dependencies = await readProtocolDependencies(client, deployment);
  if (dependencies.status !== "valid") return dependencies;

  try {
    const blockNumber = dependencies.capturedBlock;
    const [owner, pendingOwner, feeRecipient, feeBps, tierCount, balance] =
      await Promise.all([
        client.readContract({
          address: dependencies.data.factory,
          abi: robinhoodMembershipFactoryAbi,
          functionName: "owner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: robinhoodMembershipFactoryAbi,
          functionName: "pendingOwner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: robinhoodMembershipFactoryAbi,
          functionName: "feeRecipient",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: robinhoodMembershipFactoryAbi,
          functionName: "protocolFeeBps",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: robinhoodMembershipFactoryAbi,
          functionName: "tierCount",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.paymentToken,
          abi: usdgAbi,
          functionName: "balanceOf",
          args: [dependencies.data.factory],
          blockNumber,
        }),
      ]);

    return {
      status: "valid",
      capturedBlock: blockNumber,
      data: {
        ...dependencies.data,
        owner,
        pendingOwner,
        feeRecipient,
        protocolFeeBps: feeBps,
        protocolBalance: balance,
        tierCount,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}
