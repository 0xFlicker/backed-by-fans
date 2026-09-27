import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectEligible,
  fundingFor,
  validateImports,
} from "./complete-holder-airdrop.mjs";

const PRICE = 1_000_000_000n;
const ETH = 10_000_000_000_000_000n;
const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const row = (address, patch = {}) => ({
  address,
  ethCompleted: false,
  membershipCompleted: false,
  eth: 0n,
  memberships: 0n,
  ...patch,
});

test("resume ignores completed recipients even after they spend ETH and transfer NFTs", () => {
  const rows = [
    row(alice, { ethCompleted: true, membershipCompleted: true }),
    row(bob),
  ];
  assert.deepEqual(selectEligible(rows, ETH), [rows[1]]);
});

test("selects the union of ETH and membership eligibility without duplicate sends", () => {
  const rows = [
    row(alice, { memberships: 1n }),
    row(bob, { eth: ETH }),
    row("0x3333333333333333333333333333333333333333"),
    row("0x4444444444444444444444444444444444444444", {
      eth: ETH,
      memberships: 1n,
    }),
  ];
  assert.deepEqual(selectEligible(rows, ETH), rows.slice(0, 3));
});

test("funding subtracts existing helper balances and respects each completion flag", () => {
  const rows = [
    row(alice, { ethCompleted: true }),
    row(bob, { membershipCompleted: true }),
  ];
  assert.deepEqual(fundingFor(rows, PRICE, ETH, ETH / 2n, PRICE / 2n), {
    ethBudget: ETH,
    tokenBudget: PRICE,
    ethDeposit: ETH / 2n,
    tokenDeposit: PRICE / 2n,
  });
});

test("funding covers eligibility changing before execution without repeated deposits", () => {
  const rows = [row(alice, { eth: ETH }), row(bob, { memberships: 1n })];
  const initial = fundingFor(rows, PRICE, ETH, 0n, 0n);
  assert.equal(initial.ethDeposit, 2n * ETH);
  assert.equal(initial.tokenDeposit, 2n * PRICE);
  const repeated = fundingFor(
    rows,
    PRICE,
    ETH,
    initial.ethDeposit,
    initial.tokenDeposit,
  );
  assert.equal(repeated.ethDeposit, 0n);
  assert.equal(repeated.tokenDeposit, 0n);
});

test("legacy import validation checks skipped wallets too, before any signing", () => {
  const plan = { ethCompleted: [alice], membershipCompleted: [bob] };
  const rows = [
    row(alice, { eth: ETH, memberships: 1n }),
    row(bob, { eth: ETH, memberships: 1n }),
  ];
  assert.throws(() => validateImports(plan, rows), /ethCompleted/);
  rows[0].ethCompleted = true;
  assert.throws(() => validateImports(plan, rows), /membershipCompleted/);
  rows[1].membershipCompleted = true;
  assert.doesNotThrow(() => validateImports(plan, rows));
});
