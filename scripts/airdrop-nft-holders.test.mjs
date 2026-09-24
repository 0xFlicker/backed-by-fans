import test from "node:test";
import assert from "node:assert/strict";
import {
  collectHolders,
  validatePayout,
  DEPLOYER,
  summarize,
  fundingShortfalls,
  distribute,
  assertChains,
  ETH_AMOUNT,
  BUSD_AMOUNT,
} from "./airdrop-nft-holders.mjs";
const A = "0x0000000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";
const C = "0x0000000000000000000000000000000000000003";
test("every token ID is read once and multiple NFTs pay each wallet once", async () => {
  const seen = [];
  const result = await collectHolders(10_000n, 10_000n, async (ids) => {
    seen.push(...ids);
    return ids.map((id) => (id <= 9750n ? A : B));
  });
  assert.deepEqual(result, [
    { address: A, nftBalance: 9750n },
    { address: B, nftBalance: 250n },
  ]);
  assert.equal(seen.length, 10000);
  assert.equal(new Set(seen).size, 10000);
  assert.equal(seen[0], 1n);
  assert.equal(seen.at(-1), 10000n);
});

test("supply changes, incomplete owner results and RPC failures abort discovery", async () => {
  await assert.rejects(
    collectHolders(9999n, 10_000n, async () => []),
    /Unexpected/,
  );
  await assert.rejects(
    collectHolders(10_000n, 10_000n, async () => []),
    /Incomplete/,
  );
  await assert.rejects(
    collectHolders(10_000n, 10_000n, async (ids) =>
      ids.map(() => "0x0000000000000000000000000000000000000000"),
    ),
    /zero owner/,
  );
  await assert.rejects(
    collectHolders(10_000n, 10_000n, async () => {
      throw new Error("RPC down");
    }),
    /RPC down/,
  );
});

test("ETH and bUSD eligibility are independent, exact zero only, and use 18/6 decimals", () => {
  const summary = summarize([
    { address: A, eth: 0n, busd: 1n },
    { address: B, eth: 1n, busd: 0n },
    { address: C, eth: 0n, busd: 0n },
  ]);
  assert.equal(summary.ethRecipients, 2);
  assert.equal(summary.busdRecipients, 2);
  assert.equal(summary.ethRequired, 20_000_000_000_000_000n);
  assert.equal(summary.busdRequired, 2_000_000_000n);
  assert.throws(() => summarize([{ eth: 0n }]), /invalid balance/);
  assert.throws(() => summarize([{ eth: -1n, busd: 0n }]), /invalid balance/);
});

test("preflight reports token, native payout, and gas shortfalls without truncating units", () => {
  const summary = summarize([{ address: A, eth: 0n, busd: 0n }]);
  assert.deepEqual(
    fundingShortfalls(summary, { eth: ETH_AMOUNT, busd: BUSD_AMOUNT - 1n }, 3n),
    { eth: 3n, busd: 1n },
  );
  assert.deepEqual(
    fundingShortfalls(summary, { eth: ETH_AMOUNT + 3n, busd: BUSD_AMOUNT }, 3n),
    { eth: 0n, busd: 0n },
  );
  assert.deepEqual(
    fundingShortfalls(summarize([]), { eth: 0n, busd: 0n }, 3n),
    { eth: 0n, busd: 0n },
  );
});

test("mainnet or Ethereum Sepolia can never be a payout target", () => {
  assert.doesNotThrow(() => assertChains(4663, 46630));
  for (const target of [4663, 1, 11155111, 31337])
    assert.throws(() => assertChains(4663, target), /Wrong chains/);
  assert.throws(() => assertChains(46630, 46630), /Wrong chains/);
});

test("an interrupted run resumes independently and later zeroing replenishes that asset", async () => {
  const rows = [{ address: A }];
  const state = { eth: 0n, busd: 0n };
  const sends = [];
  let failBusd = true;
  const io = {
    stopped: () => false,
    owns: async () => true,
    balances: async () => ({ ...state }),
    send: async (address, asset) => {
      if (asset === "busd" && failBusd) throw new Error("token send failed");
      sends.push([address, asset]);
      state[asset] += asset === "eth" ? ETH_AMOUNT : BUSD_AMOUNT;
    },
  };
  await assert.rejects(distribute(rows, io), /token send failed/);
  failBusd = false;
  assert.deepEqual(await distribute(rows, io), { eth: 0, busd: 1 });
  assert.deepEqual(await distribute(rows, io), { eth: 0, busd: 0 });
  state.busd = 0n;
  assert.deepEqual(await distribute(rows, io), { eth: 0, busd: 1 });
  assert.deepEqual(sends, [
    [A, "eth"],
    [A, "busd"],
    [A, "busd"],
  ]);
});

test("fresh reads skip independently funded assets and former holders", async () => {
  const sent = [];
  const state = new Map([
    [A, { eth: 1n, busd: 0n }],
    [B, { eth: 0n, busd: 1n }],
  ]);
  await distribute([{ address: A }, { address: B }, { address: C }], {
    stopped: () => false,
    owns: async (address) => address !== C,
    balances: async (address) => state.get(address),
    send: async (address, asset) => {
      sent.push([address, asset]);
    },
  });
  assert.deepEqual(sent, [
    [A, "busd"],
    [B, "eth"],
  ]);
});

test("balance errors and cancellation stop execution before sending", async () => {
  let sends = 0;
  const io = {
    stopped: () => false,
    owns: async () => true,
    balances: async () => {
      throw new Error("RPC unavailable");
    },
    send: async () => {
      sends++;
    },
  };
  await assert.rejects(distribute([{ address: A }], io), /RPC unavailable/);
  await assert.rejects(
    distribute([{ address: A }], { ...io, stopped: () => true }),
    /Stopped/,
  );
  assert.equal(sends, 0);
});

test("native receipt validation rejects reverted or replaced payments to the wrong recipient/amount", () => {
  const receipt = { status: "success", transactionHash: "0xhash", logs: [] };
  const transaction = { from: DEPLOYER, to: A, value: ETH_AMOUNT };
  assert.doesNotThrow(() => validatePayout(receipt, transaction, A, "eth", B));
  assert.throws(
    () =>
      validatePayout(
        { ...receipt, status: "reverted" },
        transaction,
        A,
        "eth",
        B,
      ),
    /reverted/,
  );
  assert.throws(
    () => validatePayout(receipt, { ...transaction, to: B }, A, "eth", B),
    /different payout/,
  );
  assert.throws(
    () => validatePayout(receipt, { ...transaction, value: 0n }, A, "eth", B),
    /0.01 ETH/,
  );
  assert.throws(
    () => validatePayout(receipt, { ...transaction, from: C }, A, "eth", B),
    /different payout/,
  );
});

test("ERC20 no-op success does not count as a confirmed airdrop", () => {
  const receipt = { status: "success", transactionHash: "0xhash", logs: [] };
  assert.throws(
    () =>
      validatePayout(
        receipt,
        { from: DEPLOYER, to: B, value: 0n },
        A,
        "busd",
        B,
      ),
    /full bUSD transfer/,
  );
});

test("ERC20 receipt requires the exact token, recipient and 1,000 bUSD amount", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../web/package.json", import.meta.url),
  );
  const { erc20Abi, encodeEventTopics, encodeAbiParameters } = require("viem");
  const log = {
    address: B,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: DEPLOYER, to: A },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [BUSD_AMOUNT]),
  };
  const receipt = { status: "success", transactionHash: "0xhash", logs: [log] };
  const transaction = { from: DEPLOYER, to: B, value: 0n };
  assert.doesNotThrow(() => validatePayout(receipt, transaction, A, "busd", B));
  assert.throws(
    () =>
      validatePayout(
        { ...receipt, logs: [{ ...log, address: C }] },
        transaction,
        A,
        "busd",
        B,
      ),
    /full bUSD transfer/,
  );
  assert.throws(
    () =>
      validatePayout(
        {
          ...receipt,
          logs: [
            { ...log, data: encodeAbiParameters([{ type: "uint256" }], [1n]) },
          ],
        },
        transaction,
        A,
        "busd",
        B,
      ),
    /full bUSD transfer/,
  );
});
