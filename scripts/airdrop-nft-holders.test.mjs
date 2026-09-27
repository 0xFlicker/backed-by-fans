import test from "node:test";
import assert from "node:assert/strict";
import {
  collectHolders,
  validatePayout,
  DEPLOYER,
  TIER,
  tierAbi,
  summarize,
  fundingShortfalls,
  distribute,
  assertChains,
  ETH_AMOUNT,
  GIFT_AMOUNT,
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

test("ETH and membership eligibility are independent, zero memberships only, and use 18/6 decimals", () => {
  const summary = summarize([
    { address: A, eth: 0n, memberships: 1n },
    { address: B, eth: 1n, memberships: 0n },
    { address: C, eth: 0n, memberships: 0n },
  ]);
  assert.equal(summary.ethRecipients, 2);
  assert.equal(summary.membershipRecipients, 2);
  assert.equal(summary.ethRequired, 20_000_000_000_000_000n);
  assert.equal(summary.fundingRequired, 2_000_000_000n);
  assert.throws(() => summarize([{ eth: 0n }]), /invalid balance/);
  assert.throws(
    () => summarize([{ eth: -1n, memberships: 0n }]),
    /invalid balance/,
  );
});

test("preflight reports token, native payout, and gas shortfalls without truncating units", () => {
  const summary = summarize([{ address: A, eth: 0n, memberships: 0n }]);
  assert.deepEqual(
    fundingShortfalls(
      summary,
      { eth: ETH_AMOUNT, funding: GIFT_AMOUNT - 1n },
      3n,
    ),
    { eth: 3n, funding: 1n },
  );
  assert.deepEqual(
    fundingShortfalls(
      summary,
      { eth: ETH_AMOUNT + 3n, funding: GIFT_AMOUNT },
      3n,
    ),
    { eth: 0n, funding: 0n },
  );
  assert.deepEqual(
    fundingShortfalls(summarize([]), { eth: 0n, funding: 0n }, 3n),
    { eth: 0n, funding: 0n },
  );
});

test("mainnet or Ethereum Sepolia can never be a payout target", () => {
  assert.doesNotThrow(() => assertChains(4663, 46630));
  for (const target of [4663, 1, 11155111, 31337])
    assert.throws(() => assertChains(4663, target), /Wrong chains/);
  assert.throws(() => assertChains(46630, 46630), /Wrong chains/);
});

test("an interrupted run resumes and a transferred membership does not earn a second gift", async () => {
  const rows = [{ address: A }];
  const state = { eth: 0n, memberships: 0n };
  const sends = [];
  let failGift = true;
  const io = {
    stopped: () => false,
    owns: async () => true,
    balances: async () => ({ ...state }),
    send: async (address, asset) => {
      if (asset === "membership" && failGift)
        throw new Error("token send failed");
      sends.push([address, asset]);
      if (asset === "eth") state.eth += ETH_AMOUNT;
      else {
        state.memberships++;
        state.gifted = true;
      }
    },
  };
  await assert.rejects(distribute(rows, io), /token send failed/);
  failGift = false;
  assert.deepEqual(await distribute(rows, io), { eth: 0, membership: 1 });
  assert.deepEqual(await distribute(rows, io), { eth: 0, membership: 0 });
  state.memberships = 0n;
  assert.deepEqual(await distribute(rows, io), { eth: 0, membership: 0 });
  assert.deepEqual(sends, [
    [A, "eth"],
    [A, "membership"],
  ]);
});

test("fresh reads skip independently funded assets and former holders", async () => {
  const sent = [];
  const state = new Map([
    [A, { eth: 1n, memberships: 0n }],
    [B, { eth: 0n, memberships: 1n }],
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
    [A, "membership"],
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

test("a successful call without membership mint and payment events is not a gift", () => {
  const receipt = { status: "success", transactionHash: "0xhash", logs: [] };
  assert.throws(
    () =>
      validatePayout(
        receipt,
        { from: DEPLOYER, to: TIER, value: 0n },
        A,
        "membership",
        B,
      ),
    /funded one-period/,
  );
});

test("membership receipt requires the exact recipient, mint, amount and period", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../web/package.json", import.meta.url),
  );
  const { erc721Abi, encodeEventTopics, encodeAbiParameters } = require("viem");
  const payment = {
    address: TIER,
    topics: encodeEventTopics({
      abi: tierAbi,
      eventName: "PaymentProcessed",
      args: { payer: DEPLOYER, recipient: A, tokenId: 7n },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint64" }],
      [GIFT_AMOUNT, 1n],
    ),
  };
  const mint = {
    address: TIER,
    topics: encodeEventTopics({
      abi: erc721Abi,
      eventName: "Transfer",
      args: {
        from: "0x0000000000000000000000000000000000000000",
        to: A,
        tokenId: 7n,
      },
    }),
    data: "0x",
  };
  const receipt = {
    status: "success",
    transactionHash: "0xhash",
    logs: [payment, mint],
  };
  const tx = { from: DEPLOYER, to: TIER, value: 0n };
  assert.doesNotThrow(() => validatePayout(receipt, tx, A, "membership", B));
  assert.throws(
    () =>
      validatePayout({ ...receipt, logs: [payment] }, tx, A, "membership", B),
    /funded one-period/,
  );
  assert.throws(
    () =>
      validatePayout(
        {
          ...receipt,
          logs: [
            {
              ...payment,
              data: encodeAbiParameters(
                [{ type: "uint256" }, { type: "uint64" }],
                [GIFT_AMOUNT, 2n],
              ),
            },
            mint,
          ],
        },
        tx,
        A,
        "membership",
        B,
      ),
    /funded one-period/,
  );
});

test("first airdrop includes dust and sub-threshold ETH, but excludes the exact boundary", async () => {
  const rows = [
    0n,
    1n,
    ETH_AMOUNT / 2n,
    ETH_AMOUNT - 1n,
    ETH_AMOUNT,
    ETH_AMOUNT + 1n,
  ].map((eth, index) => ({
    address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    eth,
    memberships: index === 4 ? 0n : 1n,
  }));
  const preview = summarize(rows, true);
  assert.equal(preview.ethRecipients, 4);
  assert.equal(preview.ethRequired, 4n * ETH_AMOUNT);
  assert.equal(preview.membershipRecipients, 1);
  assert.equal(summarize(rows).ethRecipients, 1);
  const balances = new Map(
    rows.map((row) => [
      row.address,
      { eth: row.eth, memberships: row.memberships },
    ]),
  );
  const payments = [];
  const io = {
    stopped: () => false,
    owns: async () => true,
    balances: async (address) => balances.get(address),
    send: async (address, asset) => {
      payments.push([address, asset]);
      if (asset === "eth") balances.get(address).eth += ETH_AMOUNT;
      else balances.get(address).memberships++;
    },
  };
  assert.deepEqual(await distribute(rows, io, true), { eth: 4, membership: 1 });
  assert.equal(balances.get(rows[2].address).eth, (ETH_AMOUNT * 3n) / 2n);
  assert.deepEqual(await distribute(rows, io, true), { eth: 0, membership: 0 });
  assert.equal(payments.length, 5);
});

test("first airdrop rechecks a sub-threshold wallet funded after the preview", async () => {
  const rows = [{ address: A, eth: 1n, memberships: 1n }];
  assert.equal(summarize(rows, true).ethRecipients, 1);
  const result = await distribute(
    rows,
    {
      stopped: () => false,
      owns: async () => true,
      balances: async () => ({ eth: ETH_AMOUNT, memberships: 1n }),
      send: async () => {
        assert.fail("Already funded wallet must be skipped");
      },
    },
    true,
  );
  assert.deepEqual(result, { eth: 0, membership: 0 });
});
