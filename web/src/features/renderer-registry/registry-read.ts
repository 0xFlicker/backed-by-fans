import type { Address, PublicClient } from "viem";

import { rendererRegistryAbi } from "@/contracts";

const rendererRegistryPageSize = 100n;

type RendererListFunction = "createdRenderers" | "savedRenderers";
type RendererCountFunction = "createdRendererCount" | "savedRendererCount";

async function readRendererAddresses(
  client: PublicClient,
  registry: Address,
  owner: Address,
  countFunction: RendererCountFunction,
  listFunction: RendererListFunction,
): Promise<readonly Address[]> {
  const count = await client.readContract({
    address: registry,
    abi: rendererRegistryAbi,
    functionName: countFunction,
    args: [owner],
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
          functionName: listFunction,
          args: [
            owner,
            BigInt(page) * rendererRegistryPageSize,
            rendererRegistryPageSize,
          ],
        }),
    ),
  );
  return pages.flat();
}

export async function readCreatedRendererAddresses(
  client: PublicClient,
  registry: Address,
  creator: Address,
): Promise<readonly Address[]> {
  return readRendererAddresses(
    client,
    registry,
    creator,
    "createdRendererCount",
    "createdRenderers",
  );
}

export async function readRendererLibraryAddresses(
  client: PublicClient,
  registry: Address,
  owner: Address,
): Promise<readonly Address[]> {
  const [created, saved] = await Promise.all([
    readCreatedRendererAddresses(client, registry, owner),
    readRendererAddresses(
      client,
      registry,
      owner,
      "savedRendererCount",
      "savedRenderers",
    ),
  ]);
  const seen = new Set<string>();
  return [...created, ...saved].filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
