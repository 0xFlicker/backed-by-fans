/** Disposable loopback-only deployment rehearsal. Uses Anvil unlocked accounts,
 * a mock payment asset and an unbound protocol token; never an authentic fork. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  getCreate2Address,
  keccak256,
  stringToHex,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "../../web/node_modules/viem";
import { anvil } from "../../web/node_modules/viem/chains";
import { verifyProtocolGraph } from "../../scripts/protocol-fork/verify-protocol-graph";
import { verifyRetainedProtocolSources } from "../../scripts/protocol-fork/verify-sources";
import { type ImmutableReferences } from "../../scripts/protocol-fork/verify-runtime";
import { captureSourceSnapshot } from "../../scripts/protocol-fork/preflight";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifact = async (target: string) =>
  JSON.parse(await readFile(resolve(root, "out", target), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
    deployedBytecode: {
      object: Hex;
      immutableReferences?: ImmutableReferences;
    };
  };
const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n";
const CREATE2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;

async function main() {
  const url = new URL(process.argv[2] ?? "http://127.0.0.1:19847");
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search
  )
    throw new Error("Anvil loopback URL required");
  const client = createPublicClient({
    chain: anvil,
    transport: http(url.href, { retryCount: 0 }),
  });
  const wallet = createWalletClient({
    chain: anvil,
    transport: http(url.href, { retryCount: 0 }),
  });
  if ((await client.getChainId()) !== 31337)
    throw new Error("Disposable chain 31337 required");
  const canonicalCode = await client.getCode({ address: CREATE2 });
  if (
    !canonicalCode ||
    keccak256(canonicalCode) !==
      "0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989"
  )
    throw new Error("Fresh Anvil canonical CREATE2 deployer required");
  const [account] = await wallet.getAddresses();
  if (!account) throw new Error("Anvil unlocked account required");
  const output = resolve(root, "deployments/clone-rehearsal");
  await mkdir(output, { recursive: true });
  const source = await captureSourceSnapshot();
  await writeFile(
    resolve(output, "status.json"),
    json({ status: "running", source }),
  );
  const transactions = [];
  const send = async (
    role: string,
    data: Hex,
    to?: Address,
    gasLimit = 100_000_000n,
  ) => {
    const bytes = (data.length - 2) / 2;
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      gas: gasLimit,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      await writeFile(
        resolve(output, "status.json"),
        json({ status: "failed", role, source, receipt }),
      );
      throw new Error(`${role}: local transaction reverted`);
    }
    if (receipt.gasUsed > gasLimit)
      throw new Error(`${role}: gas limit exceeded`);
    const tx = await client.getTransaction({ hash });
    if (tx.input !== data) throw new Error(`${role}: mined payload differs`);
    transactions.push({
      role,
      hash,
      data,
      dataBytes: bytes,
      gasUsed: receipt.gasUsed,
      receipt,
    });
    console.log(`${role}: ${bytes} data bytes, ${receipt.gasUsed} gas`);
    return receipt;
  };
  const deploy2 = async (role: string, initCode: Hex, salt: Hex) => {
    if ((initCode.length - 2) / 2 > 196608)
      throw new Error(`${role}: initcode limit exceeded`);
    const address = getCreate2Address({
      from: CREATE2,
      salt,
      bytecodeHash: keccak256(initCode),
    });
    if (await client.getCode({ address }))
      throw new Error(`${role}: use a fresh disposable Anvil instance`);
    await send(role, `${salt}${initCode.slice(2)}`, CREATE2);
    const code = await client.getCode({ address });
    if (!code || (code.length - 2) / 2 > 98304)
      throw new Error(`${role}: runtime size failure`);
    return address;
  };
  const tokenArtifact = await artifact("MockUSDG.sol/MockUSDG.json");
  const tokenReceipt = await send(
    "fixture payment token",
    tokenArtifact.bytecode.object,
  );
  const paymentToken = tokenReceipt.contractAddress!;
  const link = JSON.parse(
    await readFile(
      resolve(root, "out/vesting-leaf/link-manifest.json"),
      "utf8",
    ),
  );
  const vestingLedger = await deploy2(
    "vesting ledger",
    link.initCode,
    link.salt,
  );
  const mediaArtifact = await artifact(
    "OnchainMediaStoreFactory.sol/OnchainMediaStoreFactory.json",
  );
  const mediaStoreFactory = await deploy2(
    "media store factory",
    mediaArtifact.bytecode.object,
    keccak256(stringToHex("Backed By Fans media store factory v4")),
  );
  const rendererArtifact = await artifact(
    "OnchainMetadataRenderer.sol/OnchainMetadataRenderer.json",
  );
  const renderer = await deploy2(
    "renderer",
    rendererArtifact.bytecode.object,
    keccak256(stringToHex("Backed By Fans renderer v4")),
  );
  const previewArtifact = await artifact(
    "RendererPreviewHarness.sol/RendererPreviewHarness.json",
  );
  const previewHarness = await deploy2(
    "preview harness",
    previewArtifact.bytecode.object,
    keccak256(stringToHex("Backed By Fans renderer preview harness v1")),
  );
  const tierArtifact = await artifact("MembershipTier.sol/MembershipTier.json");
  const tierImplementation = await deploy2(
    "tier implementation",
    tierArtifact.bytecode.object,
    keccak256(stringToHex("Backed By Fans tier implementation v1")),
  );
  const factoryArtifact = await artifact(
    "MembershipFactory.sol/MembershipFactory.json",
  );
  const factory = await deploy2(
    "factory",
    encodeDeployData({
      abi: factoryArtifact.abi,
      bytecode: factoryArtifact.bytecode.object,
      args: [
        [paymentToken],
        mediaStoreFactory,
        account,
        zeroAddress,
        tierImplementation,
        [1_000_000n],
      ],
    }),
    keccak256(stringToHex("Backed By Fans factory v6")),
  );
  const readFactory = async (functionName: string) =>
    (await client.readContract({
      address: factory,
      abi: factoryArtifact.abi,
      functionName,
    })) as Address;
  const bootstrap = {
    factory,
    mediaStoreFactory,
    renderer,
    previewHarness,
    vestingLedger,
    vestingLedgerRuntimeCodehash: link.runtimeCodeHash,
    tierImplementation,
    tierImplementationRuntimeCodehash: keccak256(
      tierArtifact.deployedBytecode.object,
    ),
    burnRouter: await readFactory("burnRouter"),
    buybackVault: await readFactory("buybackVault"),
    executor: zeroAddress,
    protocolToken: zeroAddress,
    safe: account,
    executorCodeStore: zeroAddress as Address,
  };
  const vaultArtifact = await artifact(
    "ProtocolBuybackVault.sol/ProtocolBuybackVault.json",
  );
  bootstrap.executorCodeStore = (await client.readContract({
    address: bootstrap.buybackVault,
    abi: vaultArtifact.abi,
    functionName: "executorCreationCodeStore",
  })) as Address;
  const graph = await verifyProtocolGraph(
    client,
    bootstrap,
    resolve(root, "out"),
  );
  verifyRetainedProtocolSources(graph);
  const config = {
    creator: account,
    tierSalt: keccak256(stringToHex("split-local-tier")),
    renderer,
    paymentToken,
    name: "Split deployment rehearsal",
    symbol: "SPLIT",
    pricePerPeriod: 1_000_000n,
    minimumPayment: 1_000_000n,
    periodDuration: 10n,
    protocolFeeBps: 500,
    rewardBps: 1000,
    referralBps: 500,
    startingBoostBps: 30000,
    earlySupportGross: 10_000_000n,
    supplyCap: 0n,
    maxPrepaidPeriods: 128n,
    metadata: { description: "Local verification", externalURI: "" },
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
      mediaMix: 55,
      primary: 52,
      secondary: 48,
      tertiary: 44,
    },
    media: {
      mime: 0,
      store: zeroAddress,
      length: 0,
      digest: `0x${"00".repeat(32)}`,
      runtimeCodehash: `0x${"00".repeat(32)}`,
    },
  };
  const receipt = await send(
    "creator tier creation",
    encodeFunctionData({
      abi: factoryArtifact.abi,
      functionName: "createTier",
      args: [config],
    }),
    factory,
    10_000_000n,
  );
  const events = parseEventLogs({
    abi: factoryArtifact.abi,
    logs: receipt.logs,
    eventName: "TierCreated",
  });
  if (events.length !== 1)
    throw new Error("Expected exactly one creator tier creation");
  const tierAddress = (events[0].args as { tier: Address }).tier;
  const tierFactory = await client.readContract({
    address: tierAddress,
    abi: tierArtifact.abi,
    functionName: "factory",
  });
  if (String(tierFactory).toLowerCase() !== factory.toLowerCase())
    throw new Error("Created tier factory binding differs");
  const tierRuntime = await client.getCode({ address: tierAddress });
  if (!tierRuntime || (tierRuntime.length - 2) / 2 > 98304)
    throw new Error("Created tier runtime size failure");
  const expectedClone = `0x363d3d373d3d3d363d73${tierImplementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  if (tierRuntime.toLowerCase() !== expectedClone)
    throw new Error(
      "Created tier does not match the fixed ERC-1167 implementation",
    );
  for (const [name, expected] of Object.entries({
    buybackVault: bootstrap.buybackVault,
    owner: account,
    paymentToken,
    renderer,
    minimumPayment: 1_000_000n,
    pricePerPeriod: config.pricePerPeriod,
    periodDuration: config.periodDuration,
    protocolFeeBps: config.protocolFeeBps,
    rewardBps: config.rewardBps,
    referralBps: config.referralBps,
    startingBoostBps: config.startingBoostBps,
    earlySupportGross: config.earlySupportGross,
  })) {
    const actual = await client.readContract({
      address: tierAddress,
      abi: tierArtifact.abi,
      functionName: name,
    });
    if (String(actual).toLowerCase() !== String(expected).toLowerCase())
      throw new Error(`Created tier ${name} differs`);
  }
  await writeFile(
    resolve(output, "created-tier.json"),
    json({
      address: tierAddress,
      factory,
      config,
      code: tierRuntime,
      compiled: tierArtifact.deployedBytecode,
      comparison: {
        exact: true,
        standard: "ERC-1167",
        implementation: tierImplementation,
      },
      transactionHash: receipt.transactionHash,
    }),
  );
  await writeFile(resolve(output, "protocol-graph.json"), json(graph));
  await writeFile(
    resolve(output, "transactions.json"),
    json({
      source,
      evidenceClass: "local-mock-token-unbound-protocol",
      chainId: 31337,
      bootstrap,
      tierAddress,
      tierRuntimeBytes: (tierRuntime.length - 2) / 2,
      transactions,
    }),
  );
  console.log(`Complete clone graph verified; evidence at ${output}`);
  await writeFile(
    resolve(output, "status.json"),
    json({ status: "passed", source }),
  );
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
