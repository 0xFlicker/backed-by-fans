"""Author independent token-position histories and replay the public Solidity API.

The unchanged vesting_reference interval/cohort integrators calculate earned
credit; this module authors ownership, time, claims and irreversible retirement.
No heap, index accumulator, production import, RPC or deployment is used.
"""

import argparse
from collections import Counter
from dataclasses import dataclass, replace
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile

from vesting_reference import (
    Cohort, Funding, SCALE, curve_value, entitlements, rational_error_bound,
    scaled_entitlements, vector_change_count,
)

SCHEMA = 2
INITIAL_CASH = 10**18
OPS = ("create", "renew", "free_create", "free_renew", "grant_create", "grant_add",
       "revoke", "refund", "transfer", "member_claim", "retired_claim", "referral_claim",
       "creator_claim", "release", "owner", "gift_create", "gift_renew", "pause", "maintain")
REFERRERS = ("r0", "r1")


@dataclass
class Position:
    token_id: int
    owner: int
    paid: int = 0
    grant: int = 0
    shares: int = 0
    alive: bool = True
    referrer: int | None = None
    generation: int = 0
    claimed: int = 0

    @property
    def key(self):
        return str(self.token_id)


class History:
    def __init__(self, seed: int):
        self.seed = seed
        self.rng = random.Random(seed)
        self.price = 1000 if (seed // 4) % 2 else 0
        self.boost = (10000, 15000, 30000, 23700)[seed % 4]
        self.horizon = 0 if self.boost == 10000 else 10000
        self.now = 1000
        self.positions: list[Position] = []
        self.gross = 0
        self.owner = 0
        self.lots: list[Funding] = []
        self.cohorts: list[Cohort] = []
        self.rows: list[list[int]] = []
        self.states: list[list[int]] = []
        self.claimed = [0] * 4
        self.retired = [0] * 3
        self.cash = [INITIAL_CASH] * 3
        self.creator_cash = [0] * 2
        self.referrer_cash = [0] * 2
        self.sponsor_cash = INITIAL_CASH
        self.coverage: Counter = Counter()

    def economic_state(self):
        return scaled_entitlements(tuple(self.lots), tuple(self.cohorts), self.now)

    def cohort(self):
        weights = tuple((p.key, p.shares) for p in self.positions if p.alive and p.shares)
        if self.cohorts and self.cohorts[-1].at == self.now:
            self.cohorts[-1] = Cohort(self.now, weights)
        elif not self.cohorts or self.cohorts[-1].weights != weights:
            self.cohorts.append(Cohort(self.now, weights))

    def retire(self, p: Position):
        earned = self.economic_state().members.get(p.key, 0) - p.claimed * SCALE
        self.retired[p.owner] += earned
        self.coverage["fractional_retirement"] += int(earned % SCALE != 0)
        p.alive = False
        p.paid = p.grant = p.shares = 0
        self.cohort()
        self.coverage["retirement"] += 1

    def advance(self, through: int):
        while True:
            live = [p for p in self.positions if p.alive]
            next_expiration = min((self.now + p.paid + p.grant for p in live), default=through + 1)
            until = min(through, next_expiration)
            dt = until - self.now
            for p in live:
                consumed = min(dt, p.paid)
                p.paid -= consumed
                p.grant = max(0, p.grant - (dt - consumed))
            self.now = until
            expiring = [p for p in live if p.paid + p.grant == 0]
            if len(expiring) > 1:
                self.coverage["same_time_expirations"] += 1
            for p in expiring:
                self.retire(p)
            if until == through:
                return

    def create(self, wallet: int):
        p = Position(len(self.positions) + 1, wallet)
        self.positions.append(p)
        if any(old.owner == wallet for old in self.positions[:-1]):
            self.coverage["independent_same_wallet_positions"] += 1
        return p

    def pay(self, p: Position, arg: int, sponsored: bool):
        gross = self.price * arg if self.price else arg
        duration = 10 * arg if self.price else 10
        if gross:
            if not sponsored and p.referrer is None:
                p.referrer = p.owner % 2
            referral = gross * 500 // 10000 if p.referrer is not None else 0
            rewards, protocol = gross * 1000 // 10000, gross * 500 // 10000
            start = self.now + p.paid
            self.lots.append(Funding(p.key, start, start + duration,
                gross - rewards - referral - protocol, rewards, referral, protocol,
                REFERRERS[p.referrer] if referral else None, generation=p.generation))
            p.shares += curve_value(self.gross + gross, self.boost, self.horizon) - curve_value(self.gross, self.boost, self.horizon)
            self.gross += gross
            if sponsored:
                self.sponsor_cash -= gross
            else:
                self.cash[p.owner] -= gross
        p.paid += duration
        self.cohort()

    def step(self, op: int, target: int | None = None, arg: int = 0, elapsed: int | None = None):
        self.advance(self.now + (self.rng.randint(1, 4) if elapsed is None else elapsed))
        if op in (2, 3) and self.price:
            op = 4 if op == 2 else 5
        if op in (15, 16) and not self.price:
            op = 0 if op == 15 else 1
        token_ops = (1, 3, 5, 6, 7, 8, 9, 16)
        live = [p for p in self.positions if p.alive and (op != 6 or p.grant)]
        if op in token_ops:
            choices = [p for p in live if target is None or p.token_id == target]
            if not choices:
                op, target = 0, self.rng.randrange(3)
            else:
                p = self.rng.choice(choices)
                target = p.token_id
        if target is None:
            target = self.rng.randrange(3)
        if op in (0, 1, 15, 16):
            arg = arg or (self.rng.randint(1, 3) if self.price else self.rng.choice((1, 2, 19, 120, 1000, 11003)))
            if op in (0, 15):
                p = self.create(target)
            self.pay(p, arg, op in (15, 16))
        elif op in (2, 3):
            if op == 2:
                p = self.create(target)
            self.pay(p, 0, False)
        elif op in (4, 5):
            arg = arg or self.rng.randint(1, 3)
            if op == 4:
                p = self.create(target)
            p.grant += arg * 10
        elif op == 6:
            p.grant = 0
            if p.paid == 0:
                self.retire(p)
        elif op == 7:
            before = self.economic_state().refunded
            self.lots = [replace(lot, canceled_at=self.now)
                         if lot.member == p.key else lot for lot in self.lots]
            self.cash[p.owner] += self.economic_state().refunded - before
            p.generation += 1
            self.retire(p)
        elif op == 8:
            arg = (p.owner + 1 + self.rng.randrange(2)) % 3
            p.owner = arg
            self.coverage["transfer_with_unclaimed_credit"] += int(self.economic_state().members.get(p.key, 0) > p.claimed * SCALE)
        elif op == 9:
            amount = (self.economic_state().members.get(p.key, 0) - p.claimed * SCALE) // SCALE
            p.claimed += amount
            self.claimed[1] += amount
            self.cash[p.owner] += amount
        elif op == 10:
            amount = self.retired[target] // SCALE
            self.retired[target] -= amount * SCALE
            self.cash[target] += amount
            self.claimed[1] += amount
        elif op == 11:
            target %= 2
            amount = self.economic_state().referrers.get(REFERRERS[target], 0) // SCALE - self.referrer_cash[target]
            self.referrer_cash[target] += amount
            self.claimed[2] += amount
        elif op in (12, 13, 17):
            purpose = 3 if op == 13 else 0
            state = self.economic_state()
            amount = (state.protocol if purpose == 3 else state.creator) // SCALE - self.claimed[purpose]
            self.claimed[purpose] += amount
            if purpose == 0:
                self.creator_cash[self.owner] += amount
        elif op == 14:
            self.owner = 1 - self.owner
        elif op != 18:
            raise AssertionError(op)
        self.coverage[OPS[op]] += 1
        expected = self.expected()
        digest = int.from_bytes(hashlib.sha256(words(expected)).digest(), "big")
        self.rows.append([self.now, op, target, arg, digest])
        self.states.append(expected)

    def expected(self) -> list[int]:
        result = self.economic_state()
        cash = self.gross - result.refunded - sum(self.claimed)
        vector = [self.gross, result.creator - self.claimed[0] * SCALE,
                  result.protocol - self.claimed[3] * SCALE]
        vector += list(result.unearned) + list(result.cancellation)
        vector += [result.dust, result.carry, result.unassigned, result.refunded, cash,
                   self.owner, len(self.positions), sum(p.shares for p in self.positions),
                   sum(p.alive for p in self.positions)] + self.claimed
        vector += self.retired + self.cash
        vector += [result.referrers.get(r, 0) - self.referrer_cash[i] * SCALE for i, r in enumerate(REFERRERS)]
        vector += self.referrer_cash + self.creator_cash + [self.sponsor_cash]
        vector += [sum(p.alive and p.owner == i for p in self.positions) for i in range(3)]
        assert len(vector) == 40
        for p in self.positions:
            lots = sum(lot.member == p.key and lot.generation == p.generation for lot in self.lots)
            vector += [p.owner + 1 if p.alive else 0, p.paid, p.grant, p.shares,
                       result.members.get(p.key, 0) - p.claimed * SCALE if p.alive else 0,
                       p.claimed, 2 if p.alive and p.referrer is not None else 0,
                       p.referrer + 1 if p.alive and p.referrer is not None else 0,
                       p.generation, lots]
        if min(vector) < 0:
            raise AssertionError(f"negative state: {self.seed} {self.now}")
        return vector

    def validate_oracle(self):
        result = self.economic_state()
        ideal = entitlements(tuple(self.lots), tuple(self.cohorts), self.now)
        bound = rational_error_bound(len(self.lots), vector_change_count(tuple(self.cohorts)))
        for p in self.positions:
            error = abs(Fraction(result.members.get(p.key, 0), SCALE) - ideal.members.get(p.key, 0))
            if error > bound:
                raise AssertionError(f"rational recipient bound: {self.seed} {p.key} {error} > {bound}")
        frequent = scaled_entitlements(tuple(self.lots), tuple(self.cohorts), self.now,
                                       tuple(row[0] for row in self.rows))
        if result != frequent:
            raise AssertionError(f"oracle frequency mismatch: {self.seed}")
        live = sum(result.members.get(p.key, 0) - p.claimed * SCALE for p in self.positions if p.alive)
        liabilities = (result.creator - self.claimed[0] * SCALE + result.protocol - self.claimed[3] * SCALE
                       + live + sum(self.retired) + sum(result.referrers.values()) - self.claimed[2] * SCALE
                       + sum(result.unearned) + sum(result.cancellation) + result.dust + result.carry + result.unassigned)
        if liabilities != (self.gross - result.refunded - sum(self.claimed)) * SCALE:
            raise AssertionError(f"owner-credit conservation: {self.seed}")


def generate(seed: int, actions: int) -> History:
    h = History(seed)
    # Two positions at one wallet share an exact funding/expiry boundary. Transfer
    # a live position with earned fractional credit before the retirement cohort.
    for op, target, arg, elapsed in (
        (0, 0, 1 if h.price else 120, 0), (0, 0, 1 if h.price else 19, 0),
        (4, 2, 1, 0), (8, 1, 0, 3), (9, 1, 0, 1), (18, 0, 0, 6),
        (10, 0, 0, 0), (10, 1, 0, 0), (10, 2, 0, 0),
        (0, 0, 1 if h.price else 1000, 1), (1, 4, 1 if h.price else 120, 1),
        (5, 4, 2, 1), (6, 4, 0, 1), (7, 4, 0, 1),
        (2, 0, 0, 1), (3, 5, 0, 1), (5, 5, 1, 1),
        (14, 0, 0, 1), (17, 0, 0, 1), (11, 0, 0, 1), (12, 0, 0, 1), (13, 0, 0, 1),
        (15, 1, 2, 1), (16, 6, 1, 1),
    ):
        h.step(op, target, arg, elapsed)
    while len(h.rows) < actions:
        h.step(h.rng.randrange(len(OPS)), elapsed=35 if len(h.rows) % 17 == 0 else None)
    h.validate_oracle()
    return h


def words(values: list[int]) -> bytes:
    return b"".join(value.to_bytes(32, "big") for value in values)


def encode_histories(histories: list[History]) -> bytes:
    payload = [SCHEMA, len(histories)]
    for h in histories:
        expected = h.expected()
        payload += [h.seed, len(h.rows), h.price, h.boost, h.horizon]
        payload += [value for row in h.rows for value in row] + [len(expected)] + expected
    return words([32, len(payload)] + payload)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-seed", type=int, default=0)
    parser.add_argument("--histories", type=int, default=8)
    parser.add_argument("--actions", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--all-budgets", action="store_true")
    parser.add_argument("--fixture-only", type=Path)
    args = parser.parse_args()
    if args.histories < 1 or args.actions < 100 or args.batch_size < 1 or args.start_seed < 0:
        parser.error("positive history/batch counts, nonnegative seed and >=100 actions required")
    if args.fixture_only:
        args.fixture_only.write_bytes(encode_histories([generate(s, args.actions) for s in range(args.start_seed, args.start_seed + args.histories)]))
        return 0
    contracts = Path(__file__).resolve().parents[2]
    output = contracts / "deployments/vesting-histories"
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((contracts / "out/vesting-leaf/link-manifest.json").read_text())
    coverage: Counter = Counter()
    hashes = []
    # Keep corpus compilation out of shared build artifacts used by other agents.
    with tempfile.TemporaryDirectory(prefix="bbf-history-") as temporary:
        for start in range(args.start_seed, args.start_seed + args.histories, args.batch_size):
            seeds = list(range(start, min(start + args.batch_size, args.start_seed + args.histories)))
            histories = [generate(seed, args.actions) for seed in seeds]
            authored = [{"seed": h.seed, "price": h.price, "boost": h.boost, "horizon": h.horizon,
                         "actions": h.rows, "states": h.states, "expected": h.expected()} for h in histories]
            for h in histories:
                coverage.update(h.coverage)
            encoded = encode_histories(histories)
            (output / "batch.bin").write_bytes(encoded)
            (output / "batch.json").write_text(json.dumps(authored, indent=2) + "\n")
            hashes.append(hashlib.sha256(encoded).hexdigest())
            command = ["forge", "test", "--libraries", manifest["mapping"], "--match-contract",
                       "VestingHistoryReplayTest", "--code-size-limit", "1000000", "--gas-limit", "100000000000", "-vv"]
            env = dict(os.environ, FOUNDRY_PROFILE="robinhood", FOUNDRY_SRC="src/libraries/VestingLedger.sol",
                       FOUNDRY_TEST="test/VestingHistoryReplay.t.sol", FOUNDRY_SCRIPT=temporary + "/no-scripts",
                       FOUNDRY_OUT=temporary + "/out", FOUNDRY_CACHE_PATH=temporary + "/cache",
                       BBF_VESTING_HISTORY_INPUT="deployments/vesting-histories/batch.bin",
                       BBF_VESTING_HISTORY_ALL_BUDGETS=str(args.all_budgets).lower())
            process = subprocess.run(command, cwd=contracts, env=env, capture_output=True, text=True)
            log = process.stdout + process.stderr
            (output / f"batch-{start}.log").write_text(log)
            if process.returncode:
                (output / f"failed-{start}.json").write_text(json.dumps(authored, indent=2) + "\n")
                print(log, file=sys.stderr)
                return process.returncode
            print(f"Independent Solidity/rational histories passed seeds {seeds[0]}..{seeds[-1]}", flush=True)
    missing = [op for op in OPS if not coverage[op]]
    if missing:
        raise AssertionError(f"missing transition coverage: {missing}; include fixed and contribution seeds")
    summary = {"histories": args.histories, "actionsPerHistory": args.actions,
               "processingSchedules": ["sparse", "dense", "irregular"] + (["each budget 2..25"] if args.all_budgets else []),
               "claimSchedule": "identical explicitly authored claims; ownership-sensitive payouts compared exactly",
               "startSeed": args.start_seed, "coverage": dict(coverage), "batchHashes": hashes,
               "libraryRuntimeHash": manifest["runtimeCodeHash"], "command": sys.argv}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
