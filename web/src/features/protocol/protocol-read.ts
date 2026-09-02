import {
  erc20Abi,
  getAddress,
  keccak256,
  type Address,
  type PublicClient,
} from "viem";

import { onchainMetadataRendererAbi, membershipFactoryAbi } from "@/contracts";
import type { ProtocolDependencySnapshot } from "@/contracts/types";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export type ProtocolSnapshot = ProtocolDependencySnapshot & {
  owner: Address;
  pendingOwner: Address;
  feeRecipient: Address;
  protocolFeeBps: number;
  protocolBalances: readonly { token: Address; raw: bigint }[];
  tierCount: bigint;
};

export const membershipRendererSchema =
  "0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4" as const;

const maxRendererManifestEngines = 64;
const paymentTokenPageSize = 100n;

async function readPaymentTokenAddresses(
  client: PublicClient,
  factory: Address,
  blockNumber: bigint,
) {
  const count = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "paymentTokenCount",
    blockNumber,
  });
  const paymentTokens: Address[] = [];
  for (let offset = 0n; offset < count; offset += paymentTokenPageSize) {
    const page = await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "paymentTokens",
      args: [offset, paymentTokenPageSize],
      blockNumber,
    });
    paymentTokens.push(...page.map((address) => getAddress(address)));
  }
  if (paymentTokens.length !== Number(count) || paymentTokens.length === 0) {
    throw new Error("The accepted payment-token registry is incomplete.");
  }
  if (
    new Set(paymentTokens.map((token) => token.toLowerCase())).size !==
    paymentTokens.length
  ) {
    throw new Error("The accepted payment-token registry contains duplicates.");
  }
  const listed = await Promise.all(
    paymentTokens.map((token) =>
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenListed",
        args: [token],
        blockNumber,
      }),
    ),
  );
  if (listed.some((value) => !value)) {
    throw new Error("An enumerated payment token is not listed.");
  }
  return paymentTokens;
}

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
      paymentTokens,
      rendererSchema,
      mediaStoreFactory,
      mediaStoreFactoryRuntimeCodehash,
    ] = await Promise.all([
      readPaymentTokenAddresses(
        client,
        deployment.factoryAddress,
        capturedBlock,
      ),
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
        paymentTokens,
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
    const [owner, pendingOwner, feeRecipient, feeBps, tierCount, balances] =
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
        Promise.all(
          dependencies.data.paymentTokens.map(async (token) => ({
            token,
            raw: await client.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [dependencies.data.factory],
              blockNumber,
            }),
          })),
        ),
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
        protocolBalances: balances,
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
