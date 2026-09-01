import type { Address, PublicClient } from "viem";

import { rendererRegistryAbi } from "@/contracts";

const rendererRegistryPageSize = 100n;

export async function readCreatedRendererAddresses(
  client: PublicClient,
  registry: Address,
  creator: Address,
): Promise<readonly Address[]> {
  const count = await client.readContract({
    address: registry,
    abi: rendererRegistryAbi,
    functionName: "createdRendererCount",
    args: [creator],
  });
  if (count === 0n) return [];

  const pages = await Promise.all(
    Array.from(
      {
        length: Number(
          (count + rendererRegistryPageSize - 1n) / rendererRegistryPageSize,
        ),
      },
      (_, page) =>
        client.readContract({
          address: registry,
          abi: rendererRegistryAbi,
          functionName: "createdRenderers",
          args: [
            creator,
            BigInt(page) * rendererRegistryPageSize,
            rendererRegistryPageSize,
          ],
        }),
    ),
  );
  return pages.flat();
}
