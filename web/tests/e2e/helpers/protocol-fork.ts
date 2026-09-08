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
  iPonsBondingCurveAbi,
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
      signerKeys: [testKey(40961), testKey(40962)],
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
  const authorizePolicy = async (
    asset: Address,
    batch: bigint,
    budget = batch * 100n,
  ) => {
    const compiled = JSON.parse(
      await readFile(
        resolve(process.cwd(), "../contracts/out/IV4Quoter.sol/IV4Quoter.json"),
        "utf8",
      ),
    );
    const route = await client.readContract({
      address: bootstrap.buybackVault,
      abi: protocolBuybackVaultAbi,
      functionName: "route",
      args: [asset],
    });
    const block = await client.getBlock();
    let amount = batch,
      input = asset;
    const rates = [];
    const observations = [];
    for (const poolKey of route.pools) {
      const zeroForOne =
        poolKey.currency0.toLowerCase() === input.toLowerCase();
      const quote = await client.simulateContract({
        address: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
        abi: compiled.abi,
        functionName: "quoteExactInputSingle",
        args: [{ poolKey, zeroForOne, exactAmount: amount, hookData: "0x" }],
        account: requiredAnvilAddress("creator"),
        gasPrice: 2000000000n,
      });
      const output = (quote.result as readonly bigint[])[0];
      if (output === 0n)
        throw new Error("No positive authentic conversion reference");
      rates.push({
        numeratorRaw: String(output),
        denominatorRaw: String(amount),
        toleranceBps: 100,
      });
      observations.push({ poolKey, zeroForOne, input: amount, output });
      input = zeroForOne ? poolKey.currency1 : poolKey.currency0;
      amount = output;
    }
    const [quoteReserve, tokenReserve, feeBps] = await Promise.all(
      ["quoteReserve", "tokenReserve", "feeBps"].map((functionName) =>
        client.readContract({
          address: bootstrap.curve,
          abi: iPonsBondingCurveAbi,
          functionName: functionName as
            "quoteReserve" | "tokenReserve" | "feeBps",
        }),
      ),
    );
    const net = amount - (amount * feeBps) / 10000n,
      output = (net * tokenReserve) / (quoteReserve + net);
    rates.push({
      numeratorRaw: String(output),
      denominatorRaw: String(amount),
      toleranceBps: 100,
    });
    const policy = {
      validAfterRaw: String(block.timestamp),
      validUntilRaw: String(block.timestamp + 86400n),
      batchCapRaw: String(batch),
      totalBudgetRaw: String(budget),
      rates,
    };
    receipts.push({
      kind: "safe-price-reference",
      asset,
      blockNumber: block.number,
      observations,
      quoteReserve,
      tokenReserve,
      feeBps,
      batch,
      output,
      policy,
    });
    await safe("policy", {
      asset,
      expectedRevisionRaw: String(
        await client.readContract({
          address: bootstrap.buybackVault,
          abi: protocolBuybackVaultAbi,
          functionName: "revision",
          args: [asset],
        }),
      ),
      policy,
      evidence: {
        reference: "retained safe-price-reference in this scenario",
        rationale:
          "Disposable Safe authorizes finite one-day exposure from retained per-leg pool observations and independently calculated curve output with one-percent tolerance. The ordinary runner never creates this policy.",
      },
    });
  };
  const policyForUSDG = () =>
    authorizePolicy(requiredAnvilAddress("paymentToken"), 1000000n);
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
    policyForUSDG,
    authorizePolicy,
    retain,
    giveProtocolTokens,
    receipts,
  };
}
