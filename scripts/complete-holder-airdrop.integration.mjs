// Local-only integration: disposable Anvil, tier mock, and encrypted Foundry wallet.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../web/package.json", import.meta.url));
const {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseEther,
} = require("viem");
const { robinhoodTestnet } = require("viem/chains");
const { multicall3Bytecode } = require(
  join(root, "web/node_modules/viem/_cjs/constants/contracts.js"),
);
const directory = await mkdtemp(join(tmpdir(), "bbf-completion-integration-"));
const password = "disposable-local-fixture-only";
let anvil;
try {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  const rpc = `http://127.0.0.1:${port}`;
  anvil = spawn(
    "anvil",
    [
      "--quiet",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "46630",
      "--block-time",
      "0.2",
    ],
    { stdio: "ignore" },
  );
  const client = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(rpc),
  });
  for (let i = 0; ; ++i) {
    try {
      await client.getChainId();
      break;
    } catch {
      if (i === 30) throw new Error("Disposable Anvil did not start.");
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  const keys = join(directory, "keys");
  await mkdir(keys);
  const made = spawnSync(
    "cast",
    ["wallet", "new", keys, "fixture", "--unsafe-password", password, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(made.status, 0, "create disposable encrypted wallet");
  const keystore = join(keys, "fixture");
  const publicAddress = spawnSync(
    "cast",
    ["wallet", "address", "--account", keystore, "--password", password],
    { encoding: "utf8" },
  );
  assert.equal(
    publicAddress.status,
    0,
    `read disposable wallet address: ${publicAddress.stderr}`,
  );
  const operator = getAddress(publicAddress.stdout.trim());
  await client.request({
    method: "anvil_setBalance",
    params: [operator, `0x${parseEther("100").toString(16)}`],
  });
  const accounts = await client.request({ method: "eth_accounts" });
  const wallet = createWalletClient({
    account: accounts[0],
    chain: robinhoodTestnet,
    transport: http(rpc),
  });
  const artifact = async (name) =>
    JSON.parse(
      await readFile(
        join(root, `contracts/out/${name}.sol/${name}.json`),
        "utf8",
      ),
    );
  const deploy = async (name, args) => {
    const data = await artifact(name);
    const hash = await wallet.deployContract({
      abi: data.abi,
      bytecode: data.bytecode.object,
      args,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    return { address: receipt.contractAddress, abi: data.abi };
  };
  const multicallHash = await wallet.sendTransaction({
    data: multicall3Bytecode,
  });
  const multicallReceipt = await client.waitForTransactionReceipt({
    hash: multicallHash,
  });
  const runtime = await client.getCode({
    address: multicallReceipt.contractAddress,
  });
  await client.request({
    method: "anvil_setCode",
    params: [robinhoodTestnet.contracts.multicall3.address, runtime],
  });
  const token = await deploy("MockUSDG", []);
  const tier = await deploy("HolderAirdropTierMock", [token.address]);
  const helper = await deploy("HolderAirdrop", [
    operator,
    tier.address,
    1_000_000_000n,
    2592000n,
    parseEther("0.01"),
  ]);
  const recipients = Array.from({ length: 28 }, (_, i) =>
    getAddress(`0x${(0x10000 + i).toString(16).padStart(40, "0")}`),
  );
  const write = async (contract, functionName, args) => {
    const hash = await wallet.writeContract({
      address: contract.address,
      abi: contract.abi,
      functionName,
      args,
    });
    await client.waitForTransactionReceipt({ hash });
  };
  await write(token, "mint", [operator, 100_000_000_000n]);
  await write(token, "mint", [helper.address, 2_000_000_000n]);
  await client.request({
    method: "anvil_setBalance",
    params: [helper.address, `0x${parseEther("0.03").toString(16)}`],
  });
  await client.request({
    method: "anvil_impersonateAccount",
    params: [operator],
  });
  const operatorWallet = createWalletClient({
    account: operator,
    chain: robinhoodTestnet,
    transport: http(rpc),
  });
  const imported = await operatorWallet.writeContract({
    address: helper.address,
    abi: helper.abi,
    functionName: "recordCompleted",
    args: [[recipients[0]], true, true],
  });
  await client.waitForTransactionReceipt({ hash: imported });
  await client.request({
    method: "anvil_stopImpersonatingAccount",
    params: [operator],
  });
  await write(token, "mint", [accounts[0], 1_000_000_000n]);
  await write(token, "approve", [tier.address, 1_000_000_000n]);
  await write(tier, "giftMembership", [recipients[1], 1, 256n]);
  const plan = join(directory, "plan.json"),
    deployment = join(directory, "deployment.json");
  await writeFile(
    plan,
    JSON.stringify({
      chainId: 46630,
      tier: tier.address,
      operator,
      paymentToken: token.address,
      recipients,
      ethCompleted: [recipients[0]],
      membershipCompleted: [recipients[0]],
    }),
  );
  await writeFile(
    deployment,
    JSON.stringify({
      chainId: 46630,
      address: helper.address,
      operator,
      tier: tier.address,
      paymentToken: token.address,
      pricePerPeriod: "1000000000",
      periodDuration: "2592000",
      ethAmount: String(parseEther("0.01")),
      maxBatch: 25,
    }),
  );
  const drive = async () => {
    const args = [
      process.execPath,
      join(root, "scripts/complete-holder-airdrop.mjs"),
      "--execute",
      "--plan",
      plan,
      "--deployment",
      deployment,
      "--account",
      keystore,
      "--max-fee-gwei",
      "10",
    ];
    const python = `
import os,pty,subprocess,select,time,json,sys
master,slave=pty.openpty()
child=subprocess.Popen(json.loads(os.environ['FIXTURE_ARGS']),stdin=slave,stdout=slave,stderr=slave,close_fds=True)
os.close(slave)
output=b''; prompted=False; deadline=time.time()+120
while time.time()<deadline:
    ready,_,_=select.select([master],[],[],0.1)
    if ready:
        try: chunk=os.read(master,65536)
        except OSError: break
        if not chunk: break
        output+=chunk
        if not prompted and b'(password hidden):' in output:
            os.write(master,os.environ['FIXTURE_PASSWORD'].encode()+b'\\n'); prompted=True
    if child.poll() is not None and not ready: break
else:
    child.terminate()
    raise RuntimeError('Fixture runner timed out')
child.wait();os.close(master)
sys.stdout.write(output.decode(errors='replace'))
sys.exit(child.returncode)
`;
    return await new Promise((done, reject) => {
      const child = spawn("python3", ["-c", python], {
        env: {
          ...process.env,
          ROBINHOOD_TESTNET_RPC_URL: rpc,
          FIXTURE_ARGS: JSON.stringify(args),
          FIXTURE_PASSWORD: password,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "",
        error = "";
      child.stdout.on("data", (d) => {
        output += d;
      });
      child.stderr.on("data", (d) => {
        error += d;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) done(output);
        else reject(new Error(`Local fixture failed: ${output}\n${error}`));
      });
    });
  };
  const first = await drive();
  assert.equal(first.includes(password), false, "password never echoed");
  assert.equal((first.match(/Unlock Foundry account/g) || []).length, 1);
  assert.match(first, /sent 27 ETH deliveries and 26 memberships in 2 batches/);
  const tokenBalance = () =>
    client.readContract({
      address: token.address,
      abi: token.abi,
      functionName: "balanceOf",
      args: [helper.address],
    });
  assert.equal(
    await tokenBalance(),
    1_000_000_000n,
    "only the calculated deposit was added; unused buffer retained",
  );
  assert.equal(await client.getBalance({ address: helper.address }), 0n);
  const firstGiftId = 2n;
  assert.equal(
    await client.readContract({
      address: tier.address,
      abi: tier.abi,
      functionName: "ownerOf",
      args: [firstGiftId],
    }),
    recipients[2],
  );
  await client.request({
    method: "anvil_impersonateAccount",
    params: [recipients[2]],
  });
  await client.request({
    method: "anvil_setBalance",
    params: [recipients[2], `0x${parseEther("1").toString(16)}`],
  });
  const memberWallet = createWalletClient({
    account: recipients[2],
    chain: robinhoodTestnet,
    transport: http(rpc),
  });
  const transfer = await memberWallet.writeContract({
    address: tier.address,
    abi: tier.abi,
    functionName: "transferFrom",
    args: [recipients[2], recipients[0], firstGiftId],
  });
  await client.waitForTransactionReceipt({ hash: transfer });
  await client.request({
    method: "anvil_setBalance",
    params: [recipients[2], "0x0"],
  });
  await client.request({
    method: "anvil_stopImpersonatingAccount",
    params: [recipients[2]],
  });
  const nonce = await client.getTransactionCount({ address: operator });
  const second = await drive();
  assert.match(second, /no eligible holders remain/);
  assert.equal(
    await client.getTransactionCount({ address: operator }),
    nonce,
    "retry signs no extra transactions",
  );
  assert.equal(await tokenBalance(), 1_000_000_000n);
  console.log(
    "Local encrypted-wallet integration passed: one password prompt, exact top-up, two atomic batches, and retry after ETH spending/NFT transfer without additional signing.",
  );
} finally {
  if (anvil) {
    anvil.kill("SIGTERM");
    await new Promise((done) => {
      if (anvil.exitCode !== null) done();
      else anvil.once("exit", done);
    });
  }
  await rm(directory, { recursive: true, force: true });
}
