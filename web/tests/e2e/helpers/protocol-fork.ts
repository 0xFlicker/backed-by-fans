import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createWalletClient,
  createTestClient,
  http,
  erc20Abi,
  zeroAddress,
  zeroHash,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
} from "../../../src/contracts";
import {
  readAdminContext,
  prepareBuybackPayload,
} from "../../../scripts/protocol-admin";
import { executeForkSafePayload } from "../../../scripts/protocol-safe-transactions";
import {
  anvilPublicClient,
  requiredAnvilRpc,
  requiredAnvilAddress,
} from "./anvil";

export const testKey = (value: number) =>
  `0x${value.toString(16).padStart(64, "0")}` as Hex;
export const forkJson = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
export async function forkContext() {
  const path = process.env.BBF_FORK_BOOTSTRAP;
  if (!path || process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1")
    throw new Error("Authentic shared fork bootstrap required");
  const bootstrap = JSON.parse(await readFile(path, "utf8")) as {
    runId: string;
    factory: Address;
    protocolToken: Address;
    buybackVault: Address;
    safe: Address;
    curve: Address;
    ponsFactory: Address;
    renderer: Address;
    safeOwners: Address[];
    safeThreshold: number;
  };
  const rpc = requiredAnvilRpc(),
    client = anvilPublicClient();
  if ((await client.getChainId()) !== 31337)
    throw new Error("Local fork required");
  const testClient = createTestClient({
    chain: anvil,
    mode: "anvil",
    transport: http(rpc, { retryCount: 0 }),
  });
  const receipts: unknown[] = [];
  const write = async (
    account: Address | ReturnType<typeof privateKeyToAccount>,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    value = 0n,
  ) => {
    const wallet = createWalletClient({
      chain: anvil,
      account,
      transport: http(rpc, { retryCount: 0 }),
    });
    const simulation = await client.simulateContract({
      address,
      abi,
      functionName,
      args,
      value,
      account,
      gasPrice: 2_000_000_000n,
    });
    const hash = await wallet.writeContract(simulation.request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error(`${functionName} reverted`);
    receipts.push({ address, functionName, args, value, receipt });
    return receipt;
  };
  const signerKeys = [testKey(40961), testKey(40962), testKey(40963)]
    .filter((key) =>
      bootstrap.safeOwners.some(
        (owner) =>
          owner.toLowerCase() ===
          privateKeyToAccount(key).address.toLowerCase(),
      ),
    )
    .slice(0, bootstrap.safeThreshold);
  if (signerKeys.length !== bootstrap.safeThreshold)
    throw new Error(
      "This acceptance fixture requires its test Safe keys; personal-wallet review is separate",
    );
  const safe = async (action: string, input: Record<string, unknown>) => {
    const context = await readAdminContext(client, 31337, bootstrap.factory);
    const payload = await prepareBuybackPayload(client, context, action, {
      ...input,
      expectedSafeNonceRaw: context.safeNonce.toString(),
    });
    const result = await executeForkSafePayload({
      rpcUrl: rpc,
      factory: bootstrap.factory,
      payload,
      signerKeys,
      relayerKey: testKey(49153),
    });
    receipts.push({ action, payload, ...result });
    return result;
  };
  const tier = async (
    name: string,
    asset: Address,
    fee = 1000,
    price = 10_000_000n,
  ) => {
    const creator = requiredAnvilAddress("creator");
    const config = {
      creator,
      tierSalt: keccak256(
        new TextEncoder().encode(`${bootstrap.runId}:${name}`),
      ),
      renderer: bootstrap.renderer,
      paymentToken: asset,
      name,
      symbol: "TEST",
      pricePerPeriod: price,
      periodDuration: 100n,
      protocolFeeBps: fee,
      rewardBps: 0,
      referralBps: 0,
      supplyCap: 0n,
      maxPrepaidPeriods: 12n,
      metadata: {
        description: "Authentic fork acceptance scenario",
        externalURI: "",
      },
      art: {
        engine: 0,
        collectionSeed: 1n,
        palette: 0,
        intensity: 64,
        density: 56,
        symmetry: 2,
        typographyScale: 52,
        typographyStyle: 0,
        textVisibility: 1,
        imageFit: 0,
        focalX: 50,
        focalY: 50,
        grain: 36,
        mediaMix: 0,
        primary: 52,
        secondary: 48,
        tertiary: 44,
      },
      media: {
        mime: 0,
        store: zeroAddress,
        length: 0,
        digest: zeroHash,
        runtimeCodehash: zeroHash,
      },
    };
    const count = await client.readContract({
      address: bootstrap.factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
    });
    await write(
      creator,
      bootstrap.factory,
      membershipFactoryAbi,
      "createTier",
      [config],
    );
    return (
      await client.readContract({
        address: bootstrap.factory,
        abi: membershipFactoryAbi,
        functionName: "tiers",
        args: [count, 1n],
      })
    )[0];
  };
  const configureLimits = async (
    asset: Address,
    batch: bigint,
    minInput = 1n,
    minInterval = 0n,
  ) => {
    await safe("limits", {
      asset,
      expectedRevisionRaw: String(
        await client.readContract({
          address: bootstrap.buybackVault,
          abi: protocolBuybackVaultAbi,
          functionName: "revision",
          args: [asset],
        }),
      ),
      limits: {
        minInput: String(minInput),
        maxInput: String(batch),
        minInterval: String(minInterval),
      },
    });
  };
  const limitsForUSDG = () =>
    configureLimits(requiredAnvilAddress("paymentToken"), 10_000_000n);
  const retain = async (name: string, data: Record<string, unknown>) => {
    const directory = process.env.BBF_FORK_BROWSER_EVIDENCE;
    if (!directory) throw new Error("Retained evidence required");
    await mkdir(resolve(directory, "scenarios"), { recursive: true });
    await writeFile(
      resolve(directory, "scenarios", `${name}.json`),
      forkJson({
        name,
        evidenceClass: "authentic-fork",
        status: "passed",
        executionChainId: 31337,
        branch:
          "Receipts and postconditions verified before reverting the isolated scenario snapshot",
        bootstrap,
        receipts,
        ...data,
      }),
    );
  };
  const giveProtocolTokens = async (recipient: Address, amount: bigint) =>
    write(
      privateKeyToAccount(testKey(20817)),
      bootstrap.protocolToken,
      erc20Abi,
      "transfer",
      [recipient, amount],
    );
  return {
    bootstrap,
    rpc,
    client,
    testClient,
    write,
    safe,
    tier,
    limitsForUSDG,
    configureLimits,
    signerKeys,
    retain,
    giveProtocolTokens,
    receipts,
  };
}
