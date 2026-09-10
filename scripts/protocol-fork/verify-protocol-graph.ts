import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  encodeDeployData,
  getCreate2Address,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "../../web/node_modules/viem";
import {
  compareRuntime,
  exactLibraryRuntime,
  verifyTierCodeStores,
  type ImmutableReferences,
} from "./verify-runtime";

type Artifact = {
  abi: Abi;
  bytecode: { object: Hex; linkReferences?: Record<string, unknown> };
  deployedBytecode: {
    object: Hex;
    immutableReferences?: ImmutableReferences;
    linkReferences?: Record<string, unknown>;
  };
  metadata: { settings: { libraries: Record<string, string> } };
};
type Bootstrap = Record<string, string>;
const CREATE2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;
const targets = {
  factory: "MembershipFactory.sol/MembershipFactory.json",
  tierDeployer: "MembershipTierDeployer.sol/MembershipTierDeployer.json",
  buybackVault: "ProtocolBuybackVault.sol/ProtocolBuybackVault.json",
  burnRouter: "ProtocolBurnRouter.sol/ProtocolBurnRouter.json",
  executor: "PonsBuybackExecutor.sol/PonsBuybackExecutor.json",
  mediaStoreFactory:
    "OnchainMediaStoreFactory.sol/OnchainMediaStoreFactory.json",
  renderer: "OnchainMetadataRenderer.sol/OnchainMetadataRenderer.json",
  previewHarness: "RendererPreviewHarness.sol/RendererPreviewHarness.json",
} as const;
function same(actual: unknown, expected: unknown, label: string) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase())
    throw new Error(`${label} differs`);
}

/** Local-fork proof against the exact current compiler artifacts. This does not
 * substitute for independent compilation of upstream contracts or public verification. */
export async function verifyProtocolGraph(
  client: PublicClient,
  bootstrap: Bootstrap,
  out: string,
) {
  const artifact = async (path: string): Promise<Artifact> =>
    JSON.parse(await readFile(resolve(out, path), "utf8"));
  const tier = await artifact("MembershipTier.sol/MembershipTier.json");
  const store = await artifact(
    "ImmutableCodeStore.sol/ImmutableCodeStore.json",
  );
  const leaf = await artifact(
    "vesting-leaf/VestingLedger.sol/VestingLedger.json",
  );
  const link = JSON.parse(
    await readFile(resolve(out, "vesting-leaf/link-manifest.json"), "utf8"),
  );
  same(keccak256(leaf.bytecode.object), link.initCodeHash, "leaf initcode");
  const ledgerAddress = getCreate2Address({
    from: CREATE2,
    salt: keccak256(stringToHex("Backed By Fans vesting ledger v1")),
    bytecodeHash: keccak256(leaf.bytecode.object),
  });
  same(ledgerAddress, link.address, "derived library address");
  same(ledgerAddress, bootstrap.vestingLedger, "bootstrap library address");
  same(
    tier.metadata.settings.libraries[
      "src/libraries/VestingLedger.sol:VestingLedger"
    ],
    ledgerAddress,
    "tier compiler library binding",
  );
  const libraryRuntime = exactLibraryRuntime(
    leaf.deployedBytecode.object,
    ledgerAddress,
  ) as Hex;
  const ledgerCode = await client.getCode({ address: ledgerAddress });
  same(ledgerCode, libraryRuntime, "exact library runtime");
  same(
    keccak256(libraryRuntime),
    link.runtimeCodeHash,
    "library manifest runtime",
  );
  same(
    keccak256(libraryRuntime),
    bootstrap.vestingLedgerRuntimeCodehash,
    "bootstrap library runtime",
  );
  // A leftover unresolved link is a build failure, never a region to mask.
  if (
    Object.keys(tier.bytecode.linkReferences ?? {}).length ||
    !/^0x[0-9a-f]+$/i.test(tier.bytecode.object)
  )
    throw new Error("Tier creation artifact is not fully linked");
  const [a, b] = await Promise.all([
    client.getCode({ address: bootstrap.tierCodeStoreA as Address }),
    client.getCode({ address: bootstrap.tierCodeStoreB as Address }),
  ]);
  if (!a || !b) throw new Error("Missing tier code store runtime");
  const sizes = verifyTierCodeStores(tier.bytecode.object, a, b);
  same(
    sizes.creationCodeLength,
    bootstrap.tierCreationCodeLength,
    "bootstrap tier creation length",
  );
  same(
    keccak256(tier.bytecode.object),
    bootstrap.tierCreationCodeHash,
    "bootstrap tier creation hash",
  );
  const stores = [];
  for (const [index, runtime] of [a, b].entries()) {
    const role = index === 0 ? "tierCodeStoreA" : "tierCodeStoreB";
    const salt = keccak256(
      stringToHex(`Backed By Fans tier code ${index === 0 ? "A" : "B"} v1`),
    );
    const initCode = encodeDeployData({
      abi: store.abi,
      bytecode: store.bytecode.object,
      args: [`0x${runtime.slice(4)}`],
    });
    const address = getCreate2Address({
      from: CREATE2,
      salt,
      bytecodeHash: keccak256(initCode),
    });
    same(address, bootstrap[role], `${role} deterministic address`);
    if ((initCode.length - 2) / 2 + 32 > 95000)
      throw new Error("Store CREATE2 payload exceeds limit");
    stores.push({
      role,
      address,
      salt,
      initCode,
      runtime,
      runtimeCodeHash: keccak256(runtime),
    });
  }
  const records = [];
  const artifacts: Partial<Record<keyof typeof targets, Artifact>> = {};
  for (const [role, target] of Object.entries(targets) as [
    keyof typeof targets,
    string,
  ][]) {
    const address = bootstrap[role] as Address;
    if (
      role === "executor" &&
      address === "0x0000000000000000000000000000000000000000"
    )
      continue;
    const compiled = await artifact(target);
    artifacts[role] = compiled;
    const code = await client.getCode({ address });
    if (!code) throw new Error(`Missing ${role} runtime`);
    const comparison = compareRuntime(
      compiled.deployedBytecode.object,
      code,
      compiled.deployedBytecode.immutableReferences ?? {},
    );
    if (!comparison.exact)
      throw new Error(`${role}: exact protocol metadata differs`);
    records.push({
      role,
      address,
      code,
      compiled: compiled.deployedBytecode,
      ...comparison,
    });
  }
  const read = async (role: keyof typeof targets, name: string) => {
    const compiled = artifacts[role];
    if (!compiled) throw new Error(`Missing ${role} artifact`);
    return client.readContract({
      address: bootstrap[role] as Address,
      abi: compiled.abi,
      functionName: name,
    });
  };
  for (const [name, role] of [
    ["deployer", "tierDeployer"],
    ["buybackVault", "buybackVault"],
    ["burnRouter", "burnRouter"],
    ["mediaStoreFactory", "mediaStoreFactory"],
  ])
    same(await read("factory", name), bootstrap[role], `factory ${name}`);
  same(await read("factory", "owner"), bootstrap.safe, "factory authority");
  for (const role of ["tierDeployer", "buybackVault", "burnRouter"] as const)
    same(
      await read(role, "factory"),
      bootstrap.factory,
      `${role} factory binding`,
    );
  same(
    await read("burnRouter", "vault"),
    bootstrap.buybackVault,
    "router vault binding",
  );
  same(
    await read("buybackVault", "executor"),
    bootstrap.executor,
    "vault executor binding",
  );
  same(
    await read("buybackVault", "protocolToken"),
    bootstrap.protocolToken,
    "vault token binding",
  );
  const executorArtifact = await artifact(targets.executor);
  const executorStoreAddress = (await read(
    "buybackVault",
    "executorCreationCodeStore",
  )) as Address;
  const executorStoreRuntime = await client.getCode({
    address: executorStoreAddress,
  });
  same(
    executorStoreAddress,
    bootstrap.executorCodeStore,
    "executor code store identity",
  );
  same(
    executorStoreRuntime,
    `0x00${executorArtifact.bytecode.object.slice(2)}`,
    "exact executor code store",
  );
  same(
    await read("buybackVault", "executorCreationCodeHash"),
    keccak256(executorArtifact.bytecode.object),
    "executor creation hash",
  );
  same(
    await read("buybackVault", "executorCreationCodeLength"),
    (executorArtifact.bytecode.object.length - 2) / 2,
    "executor creation length",
  );
  if (artifacts.executor) {
    same(
      await read("executor", "vault"),
      bootstrap.buybackVault,
      "executor vault binding",
    );
    same(
      await read("executor", "protocolToken"),
      bootstrap.protocolToken,
      "executor token binding",
    );
  }
  for (const side of ["A", "B"] as const) {
    same(
      await read("tierDeployer", `creationCodeStore${side}`),
      bootstrap[`tierCodeStore${side}`],
      `store ${side} immutable reference`,
    );
    same(
      await read("tierDeployer", `creationCodeStore${side}Hash`),
      keccak256(side === "A" ? a : b),
      `store ${side} immutable hash`,
    );
  }
  same(
    await read("tierDeployer", "tierCreationCodeHash"),
    keccak256(tier.bytecode.object),
    "deployer creation hash",
  );
  same(
    await read("tierDeployer", "tierCreationCodeLength"),
    sizes.creationCodeLength,
    "deployer creation length",
  );
  const minimumPayments = [];
  const tokenCount = await read("factory", "paymentTokenCount") as bigint;
  for (let offset = 0n; offset < tokenCount; offset += 100n) {
    const tokens = await client.readContract({address: bootstrap.factory as Address, abi: artifacts.factory!.abi, functionName: "paymentTokens", args: [offset, 100n]}) as Address[];
    if (!tokens.length) throw new Error("Empty payment token page");
    for (const token of tokens) {
      const minimum = await client.readContract({address: bootstrap.factory as Address, abi: artifacts.factory!.abi, functionName: "minimumPayment", args: [token]}) as bigint;
      if (minimum <= 0n || minimum >= 1n << 112n) throw new Error("Invalid currency minimum");
      minimumPayments.push({token, minimum: minimum.toString()});
    }
  }
  return {
    schemaVersion: 2,
    minimumPayments,
    tierCreationCode: tier.bytecode.object,
    creationCodeHash: keccak256(tier.bytecode.object),
    tierLibraries: tier.metadata.settings.libraries,
    storeCreationCode: store.bytecode.object,
    executorCodeStore: {
      address: executorStoreAddress,
      runtime: executorStoreRuntime as Hex,
      creationCode: executorArtifact.bytecode.object,
      runtimeCodeHash: keccak256(executorStoreRuntime as Hex),
    },
    library: {
      address: ledgerAddress,
      salt: link.salt as Hex,
      initCode: leaf.bytecode.object,
      runtimeTemplate: leaf.deployedBytecode.object,
      runtime: ledgerCode,
      runtimeCodeHash: keccak256(libraryRuntime),
    },
    stores,
    records,
  };
}
