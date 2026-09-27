import { test } from "node:test";
import assert from "node:assert/strict";
import { preparePlan } from "./prepare-holder-airdrop.mjs";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const tier = "0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B";
const hash = `0x${"ab".repeat(32)}`;
const snapshot = () => ({
  sourceChainId: 4663,
  targetChainId: 46630,
  tier,
  nft: "0x505a22ffed8d37ebe580ffd98d2cdb0021189146",
  deployer: "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027",
  paymentToken: "0x68cdeB4985317B7dad73F9C47A7226879721Cb86",
  sourceBlock: "100",
  sourceBlockHash: hash,
  holders: [{ address: alice, nftBalance: "10000" }],
});
const state = () => ({ tier, confirmed: [], pending: null });
const entry = (status, asset = "eth", recipient = alice) => ({
  status,
  asset,
  recipient,
  hash,
});

test("merges old membership state and confirmed receipts without losing former holders", () => {
  const progress = state();
  progress.confirmed = [alice, bob, alice];
  const plan = preparePlan(snapshot(), progress, [
    entry("submitted"),
    entry("confirmed"),
    entry("confirmed"),
  ]);
  assert.deepEqual(plan.ethCompleted, [alice]);
  assert.deepEqual(plan.membershipCompleted, [alice, bob]);
  assert.deepEqual(plan.recipients, [alice]);
});

test("refuses unresolved ETH receipts and membership intent", () => {
  assert.throws(
    () => preparePlan(snapshot(), state(), [entry("submitted")]),
    /Unconfirmed/,
  );
  const progress = state();
  progress.pending = { recipient: alice, hash };
  assert.throws(
    () => preparePlan(snapshot(), progress, []),
    /pending membership/,
  );
});

test("rejects conflicting receipt identity across journal files", () => {
  assert.throws(
    () =>
      preparePlan(snapshot(), state(), [
        entry("submitted"),
        entry("confirmed", "membership"),
      ]),
    /Conflicting/,
  );
});

test("rejects wrong campaign and incomplete or duplicate holder snapshots", () => {
  const wrong = snapshot();
  wrong.targetChainId = 4663;
  assert.throws(() => preparePlan(wrong, state(), []), /snapshot/);
  const incomplete = snapshot();
  incomplete.holders[0].nftBalance = "9999";
  assert.throws(() => preparePlan(incomplete, state(), []), /10,000/);
  const duplicates = snapshot();
  duplicates.holders.push(duplicates.holders[0]);
  assert.throws(() => preparePlan(duplicates, state(), []), /holder list/);
});
