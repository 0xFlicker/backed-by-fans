"""Generate independent interval histories, then replay the public Solidity API.

No RPC or production deployment. Input and failed seeds are retained under
contracts/deployments/vesting-histories. Uses Python's standard library only.
"""

import argparse
from collections import Counter
from dataclasses import replace
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys

from vesting_reference import (
    Cohort, Funding, SCALE, curve_value, entitlements, rational_error_bound,
    scaled_entitlements, vector_change_count,
)

OPS = ("pay", "free", "grant", "revoke", "refund", "sync", "member_claim",
       "referral_claim", "creator_claim", "release", "owner", "gift", "pause")
MEMBERS = ("m0", "m1", "m2")
REFERRERS = ("r0", "r1")


class History:
    def __init__(self, seed: int):
        self.seed = seed
        self.rng = random.Random(seed)
        # Every eight seeds exercise every curve in both fixed and PWYW modes.
        self.price = 1000 if (seed // 4) % 2 else 0
        self.boost = (10000, 15000, 30000, 23700)[seed % 4]
        self.horizon = 0 if self.boost == 10000 else 10000
        self.now = 1000
        self.paid = [0] * 3
        self.grants = [10] * 3  # public creator grants establish durable IDs
        self.shares = [0] * 3
        self.eligible = [False] * 3
        self.minted = [True] * 3
        self.generation = [0] * 3
        self.locked = [False] * 3
        self.gross = 0
        self.owner = 0
        self.lots: list[Funding] = []
        self.cohorts: list[Cohort] = []
        self.rows: list[list[int]] = []
        self.claimed = [0] * 4
        self.member_paid = [0] * 3
        self.referrer_paid = [0] * 2
        self.coverage: Counter = Counter()

    def economic_state(self):
        return scaled_entitlements(tuple(self.lots), tuple(self.cohorts), self.now)

    def step(self, op: int, member: int, arg: int = 0, elapsed: int | None = None):
        dt = self.rng.randint(1, 4) if elapsed is None else elapsed
        self.now += dt
        for i in range(3):
            paid_consumed = min(dt, self.paid[i])
            self.paid[i] -= paid_consumed
            self.grants[i] = max(0, self.grants[i] - (dt - paid_consumed))
        # Select a valid public transition rather than suppressing its revert.
        if op == 1 and self.price:
            op = 11
        if op == 11 and not self.price:
            op = 0
        if op == 3 and (not self.minted[member] or not self.grants[member]):
            op = 2
        if op == 4 and not self.minted[member]:
            op = 0
        if op == 5 and (self.paid[member] or self.grants[member] or not self.minted[member]):
            op = 0
        before = tuple((MEMBERS[i], self.shares[i]) for i in range(3) if self.eligible[i] and self.shares[i])
        if op in (0, 11):
            arg = arg or (self.rng.randint(1, 3) if self.price else self.rng.choice((1, 2, 19, 120, 1000, 11003)))
            gross = self.price * arg if self.price else arg
            duration = 10 * arg if self.price else 10
            if op == 0:
                self.locked[member] = True
            referral = gross * 500 // 10000 if self.locked[member] else 0
            rewards, protocol = gross * 1000 // 10000, gross * 500 // 10000
            start = self.now + self.paid[member]
            self.lots.append(Funding(MEMBERS[member], start, start + duration,
                gross - rewards - referral - protocol, rewards, referral, protocol,
                REFERRERS[member % 2] if referral else None, generation=self.generation[member]))
            self.shares[member] += (curve_value(self.gross + gross, self.boost, self.horizon)
                                    - curve_value(self.gross, self.boost, self.horizon))
            self.gross += gross
            self.paid[member] += duration
            self.coverage["restoration" if not self.eligible[member] and self.shares[member] > gross else "positive"] += 1
            self.eligible[member] = self.minted[member] = True
        elif op == 1:
            self.paid[member] += 10
            self.minted[member] = True
        elif op == 2:
            arg = arg or self.rng.randint(1, 3)
            self.grants[member] += 10 * arg
            self.minted[member] = True
        elif op == 3:
            self.grants[member] = 0
            if not self.paid[member]:
                self.eligible[member] = False
        elif op == 4:
            self.lots = [replace(lot, canceled_at=self.now)
                if lot.member == MEMBERS[member] and lot.generation == self.generation[member]
                else lot for lot in self.lots]
            self.generation[member] += 1
            self.paid[member] = self.grants[member] = 0
            self.eligible[member] = False
        elif op == 5:
            self.eligible[member] = self.minted[member] = False
        elif op in (6, 7, 8, 9, 12):
            state = self.economic_state()
            if op == 6:
                amount = state.members.get(MEMBERS[member], 0) // SCALE - self.member_paid[member]
                self.member_paid[member] += amount
                self.claimed[1] += amount
            elif op == 7:
                who = member % 2
                amount = state.referrers.get(REFERRERS[who], 0) // SCALE - self.referrer_paid[who]
                self.referrer_paid[who] += amount
                self.claimed[2] += amount
            else:
                purpose = 0 if op in (8, 12) else 3
                earned = state.creator if purpose == 0 else state.protocol
                self.claimed[purpose] += earned // SCALE - self.claimed[purpose]
        elif op == 10:
            self.owner = 1 - self.owner
        # Pause toggles twice in one operation; claims are exercised while paused.
        after = tuple((MEMBERS[i], self.shares[i]) for i in range(3) if self.eligible[i] and self.shares[i])
        if before != after:
            self.cohorts.append(Cohort(self.now, after))
        self.rows.append([self.now, op, member, arg])
        self.coverage[OPS[op]] += 1

    def expected(self) -> list[int]:
        result = self.economic_state()
        ideal = entitlements(tuple(self.lots), tuple(self.cohorts), self.now)
        bound = rational_error_bound(len(self.lots), vector_change_count(tuple(self.cohorts)))
        for member in MEMBERS:
            error = abs(Fraction(result.members.get(member, 0), SCALE) - ideal.members.get(member, 0))
            if error > bound:
                raise AssertionError(f"rational recipient bound: {self.seed} {member} {error} > {bound}")
        # Independent cumulative-epoch oracle must be identical with extra checkpoints.
        frequent = scaled_entitlements(tuple(self.lots), tuple(self.cohorts), self.now,
                                       tuple(row[0] for row in self.rows))
        if result != frequent:
            raise AssertionError(f"oracle frequency mismatch: {self.seed}")
        cash = self.gross - result.refunded - sum(self.claimed)
        vector = [self.gross, result.creator - self.claimed[0] * SCALE,
                  result.protocol - self.claimed[3] * SCALE]
        vector += [result.members.get(m, 0) - self.member_paid[i] * SCALE for i, m in enumerate(MEMBERS)]
        vector += [result.referrers.get(r, 0) - self.referrer_paid[i] * SCALE for i, r in enumerate(REFERRERS)]
        vector += list(result.unearned) + list(result.cancellation)
        vector += [result.dust, result.carry, result.unassigned] + self.shares
        vector += [sum(1 << i for i in range(3) if self.eligible[i])]
        vector += self.paid + self.grants + [result.refunded] + self.claimed + [cash, self.owner]
        vector += self.member_paid + self.referrer_paid
        assert len(vector) == 41 and min(vector) >= 0
        return vector


def generate(seed: int, actions: int) -> History:
    history = History(seed)
    # Every history exercises durable suspension/restoration and actual beneficiary claims.
    for op, member, arg, elapsed in (
        (0, 0, 1 if history.price else 120, 1), (11, 1, 2 if history.price else 1000, 1),
        (6, 0, 0, 3), (7, 0, 0, 1), (8, 0, 0, 1), (9, 0, 0, 1),
        (4, 0, 0, 1), (5, 0, 0, 1), (1, 0, 0, 1), (2, 0, 1, 1),
        (0, 0, 1, 1), (10, 0, 0, 1), (12, 0, 0, 1),
        (2, 2, 1, 1), (3, 2, 0, 1),
    ):
        history.step(op, member, arg, elapsed)
    while len(history.rows) < actions:
        history.step(history.rng.randrange(len(OPS)), history.rng.randrange(3),
                     elapsed=35 if len(history.rows) % 17 == 0 else None)
    return history


def words(values: list[int]) -> bytes:
    return b"".join(value.to_bytes(32, "big") for value in values)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-seed", type=int, default=0)
    parser.add_argument("--histories", type=int, default=16)
    parser.add_argument("--actions", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()
    if args.histories < 1 or args.actions < 100 or args.batch_size < 1 or args.start_seed < 0:
        parser.error("positive history/batch counts, nonnegative seed and >=100 actions required")
    contracts = Path(__file__).resolve().parents[2]
    output = contracts / "deployments/vesting-histories"
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((contracts / "out/vesting-leaf/link-manifest.json").read_text())
    coverage: Counter = Counter()
    hashes = []
    for start in range(args.start_seed, args.start_seed + args.histories, args.batch_size):
        seeds = list(range(start, min(start + args.batch_size, args.start_seed + args.histories)))
        histories = [generate(seed, args.actions) for seed in seeds]
        payload = [len(histories)]
        authored = []
        for history in histories:
            expected = history.expected()
            payload += [history.seed, len(history.rows), history.price, history.boost, history.horizon]
            payload += [value for row in history.rows for value in row] + expected
            authored.append({"seed": history.seed, "price": history.price, "boost": history.boost,
                             "horizon": history.horizon, "actions": history.rows, "expected": expected})
            coverage.update(history.coverage)
        encoded = words([32, len(payload)] + payload)
        (output / "batch.bin").write_bytes(encoded)
        (output / "batch.json").write_text(json.dumps(authored, indent=2) + "\n")
        hashes.append(hashlib.sha256(encoded).hexdigest())
        command = ["forge", "test", "--libraries", manifest["mapping"], "--match-contract",
                   "VestingHistoryReplayTest", "--code-size-limit", "1000000", "--gas-limit", "100000000000", "-vv"]
        env = dict(os.environ, FOUNDRY_PROFILE="robinhood", FOUNDRY_TEST="test/vesting",
                   BBF_VESTING_HISTORY_INPUT="deployments/vesting-histories/batch.bin")
        process = subprocess.run(command, cwd=contracts, env=env, capture_output=True, text=True)
        log = process.stdout + process.stderr
        (output / f"batch-{start}.log").write_text(log)
        if process.returncode:
            (output / f"failed-{start}.json").write_text(json.dumps(authored, indent=2) + "\n")
            print(log, file=sys.stderr)
            print(f"Failed seed batch retained: {output / f'failed-{start}.json'}", file=sys.stderr)
            return process.returncode
        print(f"Solidity + rational oracle passed seeds {seeds[0]}..{seeds[-1]} ({args.actions} actions, sparse/dense/irregular processing and claims)", flush=True)
    missing = [op for op in OPS if not coverage[op]]
    if missing:
        raise AssertionError(f"missing transition coverage: {missing}; include fixed and PWYW seeds")
    summary = {"histories": args.histories, "actionsPerHistory": args.actions,
               "processingAndClaimSchedules": ["sparse", "dense", "irregular"],
               "startSeed": args.start_seed, "coverage": dict(coverage), "batchHashes": hashes,
               "libraryRuntimeHash": manifest["runtimeCodeHash"] if "runtimeCodeHash" in manifest else manifest.get("runtimeHash"),
               "command": sys.argv}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
