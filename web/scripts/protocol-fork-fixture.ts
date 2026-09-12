import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { verifyProtocolGraph } from "../../scripts/protocol-fork/verify-protocol-graph";
import {
  encodeFunctionData,
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  zeroAddress,
  erc20Abi,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
  iSafeAbi,
  membershipFactoryAbi,
  onchainMediaStoreFactoryAbi,
} from "../src/contracts";
import { readAdminContext, validateAdminRpc } from "./protocol-admin";

const usdg = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
  amd = getAddress("0x86923f96303D656E4aa86D9d42D1e57ad2023fdC"),
  weth = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const router = getAddress("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
  permit2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  quoter = getAddress("0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94");
const usdPool = {
  currency0: zeroAddress,
  currency1: usdg,
  fee: 100,
  tickSpacing: 1,
  hooks: zeroAddress,
};
const stockPool = {
  currency0: usdg,
  currency1: amd,
  fee: 10000,
  tickSpacing: 200,
  hooks: zeroAddress,
};
// Disposable fixture signers must not inherit 7702 delegations or deployed code
// from the origin chain's widely reused default Anvil addresses.
const accounts = Array.from(
  { length: 6 },
  (_, index) =>
    privateKeyToAccount(
      `0x${BigInt(0xbbf50001 + index)
        .toString(16)
        .padStart(64, "0")}`,
    ).address,
);
const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
const artifact = async (name: string) =>
  JSON.parse(
    await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../contracts/out",
        name,
      ),
      "utf8",
    ),
  ) as { abi: Abi; bytecode: { object: Hex } };

async function main() {
  const evidence = process.argv[2];
  if (!evidence) throw new Error("Evidence directory required");
  const bootstrap = JSON.parse(
    await readFile(resolve(evidence, "bootstrap.json"), "utf8"),
  );
  const rpc = process.env.BBF_ADMIN_RPC_URL ?? "";
  validateAdminRpc("forknet", rpc);
  const client = createPublicClient({
    chain: anvil,
    transport: http(rpc, { retryCount: 0 }),
  });
  if ((await client.getChainId()) !== 31337)
    throw new Error("Local fork required");
  await readAdminContext(client, 31337, bootstrap.factory);
  const vaultArtifact = await artifact(
    "ProtocolBuybackVault.sol/ProtocolBuybackVault.json",
  );
  const executor = (await client.readContract({
    address: bootstrap.buybackVault,
    abi: vaultArtifact.abi,
    functionName: "executor",
  })) as Address;
  await verifyProtocolGraph(
    client,
    { ...bootstrap, executor },
    resolve(dirname(fileURLToPath(import.meta.url)), "../../contracts/out"),
  );
  const test = createTestClient({
    chain: anvil,
    mode: "anvil",
    transport: http(rpc, { retryCount: 0 }),
  });
  const [creator, member, gift, newOwner, renderProbe, fresh] = accounts;
  await mkdir(resolve(evidence, "fixture-transactions"));
  let sequence = 0;
  const retain = async (kind: string, value: unknown) =>
    writeFile(
      resolve(evidence, "fixture-transactions", `${++sequence}-${kind}.json`),
      json(value),
    );
  const transact = async (
    account: Address,
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
      account,
      value,
      gasPrice: 2_000_000_000n,
    });
    const hash = await wallet.writeContract(simulation.request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    await retain(functionName, {
      evidenceClass: "authentic-fork",
      account,
      address,
      functionName,
      args,
      value,
      receipt,
    });
    if (receipt.status !== "success")
      throw new Error(`${functionName} reverted`);
    return simulation.result;
  };
  if (getAddress(bootstrap.protocolToken) === zeroAddress) {
    // Configure payment currencies through the actual one-owner Safe; no token launch.
    const signer = privateKeyToAccount(
      `0x${(40961).toString(16).padStart(64, "0")}`,
    );
    await test.setBalance({ address: signer.address, value: 10n ** 18n });
    const safeWallet = createWalletClient({
      chain: anvil,
      account: signer,
      transport: http(rpc, { retryCount: 0 }),
    });
    for (const token of [weth, amd]) {
      for (const configureMinimum of [true, false]) {
        const nonce = await client.readContract({
          address: bootstrap.safe,
          abi: iSafeAbi,
          functionName: "nonce",
        });
        const minimum =
          token === weth ? 410_000_000_000_000n : 2_000_000_000_000_000n;
        const data = configureMinimum
          ? encodeFunctionData({
              abi: membershipFactoryAbi,
              functionName: "setMinimumPayment",
              args: [token, minimum],
            })
          : encodeFunctionData({
              abi: membershipFactoryAbi,
              functionName: "setPaymentTokenEnabled",
              args: [token, true],
            });
        const fields = [
          bootstrap.factory as Address,
          0n,
          data,
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
        ] as const;
        const hash = await client.readContract({
          address: bootstrap.safe,
          abi: iSafeAbi,
          functionName: "getTransactionHash",
          args: [...fields, nonce],
        });
        const signature = await signer.sign({ hash });
        const simulation = await client.simulateContract({
          address: bootstrap.safe,
          abi: iSafeAbi,
          functionName: "execTransaction",
          args: [...fields, signature],
          account: signer,
        });
        if (!simulation.result)
          throw new Error("Payment currency setup simulation failed");
        const receipt = await client.waitForTransactionReceipt({
          hash: await safeWallet.writeContract(simulation.request),
        });
        await retain(
          configureMinimum ? "set-minimum-payment" : "enable-payment-token",
          { token, minimum, receipt },
        );
        if (
          receipt.status !== "success" ||
          (configureMinimum
            ? (await client.readContract({
                address: bootstrap.factory,
                abi: membershipFactoryAbi,
                functionName: "minimumPayment",
                args: [token],
              })) !== minimum
            : !(await client.readContract({
                address: bootstrap.factory,
                abi: membershipFactoryAbi,
                functionName: "isPaymentTokenEnabled",
                args: [token],
              })))
        )
          throw new Error("Payment currency setup failed");
      }
    }
  }
  const [routerArtifact, quoterArtifact, permitArtifact] = await Promise.all([
    artifact("IUniversalRouter.sol/IUniversalRouter.json"),
    artifact("IV4Quoter.sol/IV4Quoter.json"),
    artifact("IAllowanceTransfer.sol/IAllowanceTransfer.json"),
  ]);
  // Action payload layout from the vendored official IV4Router.ExactInputSingleParams;
  // these are nested Universal Router command bytes, not a parallel contract ABI.
  const swapType = parseAbiParameters(
    "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData) params",
  );
  const trade = async (
    account: Address,
    pool: {
      currency0: Address;
      currency1: Address;
      fee: number;
      tickSpacing: number;
      hooks: Address;
    },
    amount: bigint,
  ) => {
    const input = pool.currency0,
      output = pool.currency1;
    const before = await client.readContract({
      address: output,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    const quote = await client.simulateContract({
      address: quoter,
      abi: quoterArtifact.abi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: pool,
          zeroForOne: true,
          exactAmount: amount,
          hookData: "0x",
        },
      ],
      account,
      gasPrice: 2_000_000_000n,
    });
    const minimum = ((quote.result as readonly bigint[])[0] * 99n) / 100n;
    if (minimum === 0n)
      throw new Error("Authentic acquisition has no liquidity");
    const deadline = (await client.getBlock()).timestamp + 300n;
    if (input !== zeroAddress) {
      await transact(account, input, erc20Abi, "approve", [permit2, amount]);
      await transact(account, permit2, permitArtifact.abi, "approve", [
        input,
        router,
        amount,
        Number(deadline),
      ]);
    }
    const actions = [
      encodeAbiParameters(swapType, [
        {
          poolKey: pool,
          zeroForOne: true,
          amountIn: amount,
          amountOutMinimum: minimum,
          minHopPriceX36: 0n,
          hookData: "0x",
        },
      ]),
      encodeAbiParameters(parseAbiParameters("address,uint256"), [
        input,
        amount,
      ]),
      encodeAbiParameters(parseAbiParameters("address,uint256"), [
        output,
        minimum,
      ]),
    ];
    await transact(
      account,
      router,
      routerArtifact.abi,
      "execute",
      [
        "0x1004",
        [
          encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
            "0x060c0f",
            actions,
          ]),
          encodeAbiParameters(parseAbiParameters("address,address,uint256"), [
            zeroAddress,
            account,
            0n,
          ]),
        ],
        deadline,
      ],
      input === zeroAddress ? amount : 0n,
    );
    if (input !== zeroAddress) {
      await transact(account, input, erc20Abi, "approve", [permit2, 0n]);
      await transact(account, permit2, permitArtifact.abi, "approve", [
        input,
        router,
        0n,
        1,
      ]);
    }
    const after = await client.readContract({
      address: output,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    if (after - before < minimum) throw new Error("Acquisition below minimum");
    return after - before;
  };
  for (const account of accounts) {
    const accountCode = await client.getCode({ address: account });
    if (accountCode && accountCode !== "0x")
      throw new Error(
        "Disposable fixture signer already has origin-chain code",
      );
    await test.impersonateAccount({ address: account });
    await test.setBalance({ address: account, value: 100n * 10n ** 18n });
  }
  const purchasedUSDG = await trade(creator, usdPool, 2n * 10n ** 18n);
  const purchasedAMD = await trade(creator, stockPool, 100_000_000n);
  for (const account of [member, renderProbe]) {
    await transact(creator, usdg, erc20Abi, "transfer", [
      account,
      1_000_000_000n,
    ]);
    await transact(creator, amd, erc20Abi, "transfer", [
      account,
      purchasedAMD / 4n,
    ]);
  }
  const wallet = createWalletClient({
    chain: anvil,
    account: creator,
    transport: http(rpc, { retryCount: 0 }),
  });
  const deploy = async (name: string) => {
    const compiled = await artifact(name);
    const hash = await wallet.deployContract({
      abi: compiled.abi,
      bytecode: compiled.bytecode.object,
      gasPrice: 2_000_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw new Error("Fixture deployment failed");
    await retain("deploy", { name, receipt });
    return receipt.contractAddress;
  };
  const rendererRegistry = await deploy(
      "RendererRegistry.sol/RendererRegistry.json",
    ),
    replacementRenderer = await deploy(
      "OnchainMetadataRenderer.sol/OnchainMetadataRenderer.json",
    );
  const media = await sharp(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../public/brand/backstage-membership-hero-v1.png",
    ),
  )
    .resize(640, 640, { fit: "cover" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  if (media.length <= 24576 || media.length > 90 * 1024)
    throw new Error("Media fixture must span code chunks");
  const payload = `0x${media.toString("hex")}` as Hex,
    digest = keccak256(payload);
  await transact(
    creator,
    bootstrap.mediaStoreFactory,
    onchainMediaStoreFactoryAbi,
    "store",
    [payload, 1],
  );
  const mediaStore = await client.readContract({
    address: bootstrap.mediaStoreFactory,
    abi: onchainMediaStoreFactoryAbi,
    functionName: "mediaStore",
    args: [creator, 1, media.length, digest],
  });
  const code = await client.getCode({ address: mediaStore });
  if (!code) throw new Error("Media code missing");
  const config = {
    creator,
    tierSalt: keccak256(
      new TextEncoder().encode(bootstrap.runId + "-browser-tier"),
    ),
    renderer: bootstrap.renderer,
    paymentToken: usdg,
    name: "Local Creator Circle",
    symbol: "LOCAL",
    pricePerPeriod: 10_000_000n,
    minimumPayment: 1_000_000n,
    periodDuration: 2592000n,
    protocolFeeBps: 100,
    rewardBps: 500,
    referralBps: 100,
    startingBoostBps: 15000,
    earlySupportGross: 10_000_000_000n,
    supplyCap: 0n,
    maxPrepaidPeriods: 12n,
    metadata: {
      description: "A creator membership on the authentic disposable fork.",
      externalURI: "",
    },
    art: {
      engine: 0,
      collectionSeed: 0x0123456789abcdef0123456789abcdefn,
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
      mime: 1,
      store: mediaStore,
      length: media.length,
      digest,
      runtimeCodehash: keccak256(code),
    },
  };
  await transact(
    creator,
    bootstrap.factory,
    membershipFactoryAbi,
    "createTier",
    [config],
  );
  const tier = (
    await client.readContract({
      address: bootstrap.factory,
      abi: membershipFactoryAbi,
      functionName: "tiers",
      args: [0n, 1n],
    })
  )[0];
  await writeFile(
    resolve(evidence, "fixture.json"),
    json({
      evidenceClass: "authentic-fork",
      bootstrap,
      tier,
      mediaStore,
      purchasedUSDG,
      purchasedAMD,
      assets: { usdg, amd, weth },
      accounts,
      notes: [
        "Only ETH balances were assigned. Payment tokens were acquired through real existing pools.",
        "Acquisition quotes are not protocol price authority.",
        bootstrap.protocolToken === zeroAddress
          ? "Protocol token is unbound. Membership fees can accrue and release, but purchases remain unavailable."
          : "Standing buyback settings remain active. Manual serve mode does not advance through the five-year vesting checkpoint.",
      ],
    }),
  );
  await writeFile(
    resolve(evidence, "browser-environment.json"),
    json({
      NEXT_PUBLIC_ANVIL_RPC_URL: rpc,
      NEXT_PUBLIC_ANVIL_FACTORY_ADDRESS: bootstrap.factory,
      NEXT_PUBLIC_ANVIL_RENDERER_ADDRESS: bootstrap.renderer,
      NEXT_PUBLIC_ANVIL_PREVIEW_HARNESS_ADDRESS: bootstrap.previewHarness,
      NEXT_PUBLIC_ANVIL_RENDERER_REGISTRY_ADDRESS: rendererRegistry,
      BBF_ANVIL_RPC_URL: rpc,
      BBF_ANVIL_TIER_ADDRESS: tier,
      BBF_ANVIL_CREATOR_ADDRESS: creator,
      BBF_ANVIL_MEMBER_ADDRESS: member,
      BBF_ANVIL_GIFT_RECIPIENT_ADDRESS: gift,
      BBF_ANVIL_NEW_OWNER_ADDRESS: newOwner,
      BBF_ANVIL_FRESH_WALLET_ADDRESS: fresh,
      BBF_ANVIL_PAYMENT_TOKEN_ADDRESS: usdg,
      BBF_ANVIL_SCALED_PAYMENT_TOKEN_ADDRESS: amd,
      BBF_ANVIL_REPLACEMENT_RENDERER_ADDRESS: replacementRenderer,
      BBF_ANVIL_MEDIA_STORE_ADDRESS: mediaStore,
      BBF_PROTOCOL_FORK_AUTHENTIC: "1",
    }),
  );
  console.log("Authentic assets and media-backed membership fixture retained");
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
