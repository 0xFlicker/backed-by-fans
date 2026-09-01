import { keccak256, type Address, type PublicClient } from "viem";

import {
  onchainMetadataRendererAbi,
  membershipFactoryAbi,
  usdgAbi,
} from "@/contracts";
import type { ProtocolDependencySnapshot } from "@/contracts/types";
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
      mediaStoreFactory,
      mediaStoreFactoryRuntimeCodehash,
    ] = await Promise.all([
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "paymentToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "rendererSchema",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "mediaStoreFactory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
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

    const [rendererCode, previewHarnessCode, mediaStoreFactoryCode] =
      await Promise.all([
        client.getBytecode({
          address: deployment.rendererAddress,
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: deployment.previewHarnessAddress,
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: mediaStoreFactory,
          blockNumber: capturedBlock,
        }),
      ]);
    if (!rendererCode || rendererCode === "0x") {
      failedChecks.push("renderer code");
    }
    if (!previewHarnessCode || previewHarnessCode === "0x") {
      failedChecks.push("renderer preview harness code");
    }
    if (!mediaStoreFactoryCode || mediaStoreFactoryCode === "0x") {
      failedChecks.push("media registry code");
    } else if (
      keccak256(mediaStoreFactoryCode) !== mediaStoreFactoryRuntimeCodehash
    ) {
      failedChecks.push("media registry runtime identity");
    }

    let rendererManifest:
      | {
          name: string;
          engineCount: number;
          engineNames: readonly string[];
        }
      | undefined;
    if (rendererCode && rendererCode !== "0x" && failedChecks.length === 0) {
      try {
        const [implementationSchema, name, rawEngineCount] = await Promise.all([
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "rendererSchema",
            blockNumber: capturedBlock,
          }),
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "rendererName",
            blockNumber: capturedBlock,
          }),
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "engineCount",
            blockNumber: capturedBlock,
          }),
        ]);
        const engineCount = Number(rawEngineCount);
        const engineNames =
          Number.isSafeInteger(engineCount) &&
          engineCount > 0 &&
          engineCount <= maxRendererManifestEngines
            ? await Promise.all(
                Array.from({ length: engineCount }, (_, engine) =>
                  client.readContract({
                    address: deployment.rendererAddress,
                    abi: onchainMetadataRendererAbi,
                    functionName: "engineName",
                    args: [engine],
                    blockNumber: capturedBlock,
                  }),
                ),
              )
            : undefined;
        if (implementationSchema !== rendererSchema) {
          failedChecks.push("renderer schema");
        }
        if (!name || name.trim().length === 0 || engineNames === undefined) {
          failedChecks.push("renderer manifest");
        } else {
          rendererManifest = { name, engineCount, engineNames };
        }
      } catch {
        failedChecks.push("renderer manifest");
      }
    }

    if (rendererManifest === undefined && failedChecks.length === 0) {
      failedChecks.push("renderer manifest");
    }

    if (failedChecks.length > 0 || rendererManifest === undefined) {
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
        renderer: deployment.rendererAddress,
        rendererName: rendererManifest.name,
        rendererEngineCount: rendererManifest.engineCount,
        rendererEngineNames: rendererManifest.engineNames,
        previewHarness: deployment.previewHarnessAddress,
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
          abi: membershipFactoryAbi,
          functionName: "owner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "pendingOwner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "feeRecipient",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "protocolFeeBps",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
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
