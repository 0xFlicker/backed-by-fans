import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { erc721AirdropAbi, ierc721Abi } from "../src/contracts";

const endpoint = process.env.BBF_ANVIL_RPC_URL;
if (!endpoint)
  throw new Error("Set BBF_ANVIL_RPC_URL to your disposable local Anvil.");
const url = new URL(endpoint);
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error("Local seed requires an uncredentialed loopback RPC.");
const client = createPublicClient({
  chain: foundry,
  transport: http(endpoint),
});
if ((await client.getChainId()) !== foundry.id)
  throw new Error("Local seed requires execution chain 31337.");
const wallet = createWalletClient({
  chain: foundry,
  transport: http(endpoint),
});
const accounts = await wallet.getAddresses();
const sender = accounts[0];
if (!sender || !accounts[1])
  throw new Error("Anvil needs at least two unlocked test accounts.");
const helperArtifact = JSON.parse(
  readFileSync(
    new URL(
      "../../contracts/out/ERC721Airdrop.sol/ERC721Airdrop.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const nftArtifact = JSON.parse(
  readFileSync(
    new URL(
      "../../contracts/out/ERC721Airdrop.t.sol/AirdropTestNFT.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
async function deployed(hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error("Local deployment failed.");
  return getAddress(receipt.contractAddress);
}
const helper = await deployed(
  await wallet.deployContract({
    account: sender,
    abi: erc721AirdropAbi,
    bytecode: helperArtifact.bytecode.object,
    gasPrice: 100_000_000n,
  }),
);
const nft = await deployed(
  await wallet.deployContract({
    account: sender,
    abi: nftArtifact.abi,
    bytecode: nftArtifact.bytecode.object,
    gasPrice: 100_000_000n,
  }),
);
for (const id of [1n, 2n]) {
  const hash = await wallet.writeContract({
    account: sender,
    address: nft,
    abi: nftArtifact.abi,
    functionName: "mint",
    args: [sender, id],
    gasPrice: 100_000_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Local mint failed.");
  if (
    (await client.readContract({
      address: nft,
      abi: ierc721Abi,
      functionName: "ownerOf",
      args: [id],
    })) !== sender
  )
    throw new Error("Local mint ownership was not confirmed.");
}
const output = {
  executionChainId: foundry.id,
  rpcUrl: endpoint,
  helper,
  nft,
  sender,
  recipient: accounts[1],
  tokenIds: ["1", "2"],
};
const path = process.argv[2];
if (path) writeFileSync(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output));
