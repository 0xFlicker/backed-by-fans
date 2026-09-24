import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  concat,
  pad,
  zeroAddress,
  encodeFunctionData,
} from "viem";
import { anvil } from "viem/chains";
import { testUsdgAbi, iSafeAbi, membershipFactoryAbi } from "../src/contracts";
const transport = http("http://127.0.0.1:18557");
const client = createPublicClient({ chain: anvil, transport });
const test = createTestClient({ chain: anvil, mode: "anvil", transport });
const owner = "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027";
const { factory, safe } = JSON.parse(await readFile(process.argv[2], "utf8"));
if ((await client.getChainId()) !== 31337)
  throw new Error("Disposable local chain required");
if (
  (
    await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "owner",
    })
  ).toLowerCase() !== safe.toLowerCase()
)
  throw new Error("Unexpected authority");
const artifact = JSON.parse(
  await readFile("../contracts/out/TestUSDG.sol/TestUSDG.json", "utf8"),
);
const wallet = createWalletClient({ account: owner, chain: anvil, transport });
const hashes: string[] = [];
async function confirmed(hash: `0x${string}`) {
  hashes.push(hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Reverted: ${hash}`);
  return receipt;
}
await test.impersonateAccount({ address: owner });
try {
  const deployment = await confirmed(
    await wallet.deployContract({
      abi: testUsdgAbi,
      bytecode: artifact.bytecode.object,
      gasPrice: 2_000_000_000n,
    }),
  );
  const address = deployment.contractAddress;
  if (!address) throw new Error("Missing deployed address");
  const signature = concat([
    pad(owner, { size: 32 }),
    pad("0x00", { size: 32 }),
    "0x01",
  ]);
  for (const data of [
    encodeFunctionData({
      abi: membershipFactoryAbi,
      functionName: "setMinimumPayment",
      args: [address, 1_000_000n],
    }),
    encodeFunctionData({
      abi: membershipFactoryAbi,
      functionName: "setPaymentTokenEnabled",
      args: [address, true],
    }),
  ]) {
    const simulation = await client.simulateContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "execTransaction",
      args: [
        factory,
        0n,
        data,
        0,
        0n,
        0n,
        0n,
        zeroAddress,
        zeroAddress,
        signature,
      ],
      account: owner,
      gasPrice: 2_000_000_000n,
    });
    if (!simulation.result) throw new Error("Safe simulation failed");
    await confirmed(await wallet.writeContract(simulation.request));
  }
  const claim = await client.simulateContract({
    address,
    abi: testUsdgAbi,
    functionName: "claim",
    account: owner,
    gasPrice: 2_000_000_000n,
  });
  await confirmed(await wallet.writeContract(claim.request));
  const [balance, nextClaimAt, enabled] = await Promise.all([
    client.readContract({
      address,
      abi: testUsdgAbi,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({
      address,
      abi: testUsdgAbi,
      functionName: "nextClaimAt",
      args: [owner],
    }),
    client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "isPaymentTokenEnabled",
      args: [address],
    }),
  ]);
  if (balance !== 100_000_000n || !enabled)
    throw new Error("Postcondition failed");
  const report = {
    chainId: 31337,
    address,
    owner,
    factory,
    balance: balance.toString(),
    nextClaimAt: nextClaimAt.toString(),
    enabled,
    hashes,
  };
  await writeFile(
    "../artifacts/test-usdg/local.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await test.stopImpersonatingAccount({ address: owner });
}
