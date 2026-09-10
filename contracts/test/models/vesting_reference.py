"""Independent exact-fraction accounting reference, never an onchain oracle.

Walk authored payment intervals and eligible cohorts directly. There is no heap,
reward accumulator or production import. Allocation amounts are raw token units;
time is integer seconds. The rational answer intentionally precedes the separate
scaled-policy/rounding comparison performed by the Solidity history runner.
"""

from dataclasses import dataclass
from fractions import Fraction
import unittest


MAX_GROSS = 2**112 - 1
BPS = 10_000
SCALE = 2**128
MAX_TIME = 2**64 - 1


def curve_value(gross: int, boost_bps: int, horizon: int) -> int:
    """Evaluate the authored integral with one cumulative floor."""
    if not 0 <= gross <= MAX_GROSS:
        raise ValueError("gross outside supported range")
    if not BPS <= boost_bps <= 10 * BPS or boost_bps % 100:
        raise ValueError("unsupported boost")
    if boost_bps == BPS:
        if horizon:
            raise ValueError("None requires a zero horizon")
        return gross
    if not 1 <= horizon <= MAX_GROSS:
        raise ValueError("bonus requires a supported horizon")
    end = min(gross, horizon)
    bonus = Fraction(boost_bps - BPS, BPS) * (
        end - Fraction(end * end, 2 * horizon)
    )
    return gross + bonus.numerator // bonus.denominator


@dataclass(frozen=True)
class Funding:
    """One purchase's fixed amounts and original beneficiary."""

    member: str
    start: int
    end: int
    creator: int
    rewards: int
    referral: int
    protocol: int
    referrer: str | None = None
    canceled_at: int | None = None
    generation: int = 0

    def __post_init__(self) -> None:
        if not 0 <= self.start < self.end <= 2**64 - 1:
            raise ValueError("invalid service interval")
        if min(self.creator, self.rewards, self.referral, self.protocol) < 0:
            raise ValueError("negative allocation")
        if not 0 < self.gross <= MAX_GROSS:
            raise ValueError("invalid funded gross")
        if self.canceled_at is not None and self.canceled_at < 0:
            raise ValueError("negative cancellation time")
        if self.referral and self.referrer is None:
            raise ValueError("referral allocation has no beneficiary")

    @property
    def gross(self) -> int:
        return self.creator + self.rewards + self.referral + self.protocol


@dataclass(frozen=True)
class Cohort:
    """Complete eligible vector effective at an economic transition."""

    at: int
    weights: tuple[tuple[str, int], ...]

    def __post_init__(self) -> None:
        if self.at < 0 or any(weight <= 0 for _, weight in self.weights):
            raise ValueError("invalid cohort")
        if len(dict(self.weights)) != len(self.weights):
            raise ValueError("duplicate cohort member")


@dataclass(frozen=True)
class Entitlements:
    creator: Fraction
    members: dict[str, Fraction]
    referrers: dict[str, Fraction]
    protocol: Fraction
    unassigned: Fraction
    reserved: Fraction
    refunded: int = 0
    cancellation: Fraction = Fraction()

    @property
    def earned(self) -> Fraction:
        return (
            self.creator + sum(self.members.values(), Fraction())
            + sum(self.referrers.values(), Fraction()) + self.protocol
            + self.unassigned
        )


def entitlements(
    funding: tuple[Funding, ...], cohorts: tuple[Cohort, ...], through: int
) -> Entitlements:
    """Integrate each funding stream against each applicable cohort interval."""
    if through < 0 or any(a.at >= b.at for a, b in zip(cohorts, cohorts[1:])):
        raise ValueError("history must be chronological; combine same-time changes")
    creator = protocol = unassigned = reserved = cancellation = Fraction()
    refunded = 0
    members: dict[str, Fraction] = {}
    referrers: dict[str, Fraction] = {}
    for lot in funding:
        until = min(through, lot.end, lot.canceled_at if lot.canceled_at is not None else lot.end)
        consumed = max(0, until - lot.start)
        elapsed = Fraction(consumed, lot.end - lot.start)
        creator += lot.creator * elapsed
        protocol += lot.protocol * elapsed
        if lot.referrer is not None:
            referrers[lot.referrer] = (
                referrers.get(lot.referrer, Fraction()) + lot.referral * elapsed
            )
        unused = lot.gross * (1 - elapsed)
        if lot.canceled_at is not None and lot.canceled_at <= through:
            refund = unused.numerator // unused.denominator
            refunded += refund
            cancellation += unused - refund
        else:
            reserved += unused
        boundaries = sorted({lot.start, until} | {
            c.at for c in cohorts if lot.start < c.at < until
        }) if consumed else []
        for start, end in zip(boundaries, boundaries[1:]):
            weights = next((c.weights for c in reversed(cohorts) if c.at <= start), ())
            value = Fraction(lot.rewards * (end - start), lot.end - lot.start)
            total = sum(weight for _, weight in weights)
            if not total:
                unassigned += value
            for member, weight in weights:
                members[member] = members.get(member, Fraction()) + value * weight / total
    result = Entitlements(creator, members, referrers, protocol, unassigned, reserved, refunded, cancellation)
    if result.earned + reserved + refunded + cancellation != sum(lot.gross for lot in funding):
        raise AssertionError("rational conservation failed")
    return result


@dataclass(frozen=True)
class ScaledEntitlements:
    creator: int
    members: dict[str, int]
    referrers: dict[str, int]
    protocol: int
    unassigned: int
    unearned: tuple[int, ...]
    cancellation: tuple[int, ...]
    refunded: int
    dust: int
    carry: int


def _scaled_at(lot: Funding, purpose: int, at: int) -> int:
    stop = min(at, lot.canceled_at if lot.canceled_at is not None else lot.end)
    allocation = (lot.creator, lot.rewards, lot.referral, lot.protocol)[purpose] * SCALE
    if stop <= lot.start:
        return 0
    if stop >= lot.end:
        return allocation
    return allocation // (lot.end - lot.start) * (stop - lot.start)


def scaled_entitlements(
    funding: tuple[Funding, ...], cohorts: tuple[Cohort, ...], through: int,
    checkpoints: tuple[int, ...] = (),
) -> ScaledEntitlements:
    """Replay explicit intervals, never the production heap or lazy member index.

    Within each authored cohort, calculate cumulative funding divided by its
    total weight. Additional processing/claim checkpoints must telescope. This
    is the integer policy oracle; entitlements() remains the independent ideal.
    """
    if through < 0 or any(a.at >= b.at for a, b in zip(cohorts, cohorts[1:])):
        raise ValueError("history must be chronological")
    times = {0, through}
    times.update(t for lot in funding for t in (lot.start, lot.end, lot.canceled_at)
                 if t is not None and 0 <= t <= through)
    times.update(c.at for c in cohorts if c.at <= through)
    times.update(t for t in checkpoints if 0 <= t <= through)
    ordered = sorted(times)
    members: dict[str, int] = {}
    referrers: dict[str, int] = {}
    creator = protocol = unassigned = epoch_earned = dust = 0
    weights: tuple[tuple[str, int], ...] = ()
    total = 0
    for start, end in zip(ordered, ordered[1:]):
        current = tuple(sorted(next((c.weights for c in reversed(cohorts) if c.at <= start), ())))
        if current != weights:
            dust += epoch_earned % total if total else 0
            weights, total, epoch_earned = current, sum(w for _, w in current), 0
        rewards = 0
        for lot in funding:
            delta = [_scaled_at(lot, i, end) - _scaled_at(lot, i, start) for i in range(4)]
            creator += delta[0]
            rewards += delta[1]
            protocol += delta[3]
            if lot.referrer is not None:
                referrers[lot.referrer] = referrers.get(lot.referrer, 0) + delta[2]
        if total:
            quotient_delta = (epoch_earned + rewards) // total - epoch_earned // total
            for member, weight in weights:
                members[member] = members.get(member, 0) + quotient_delta * weight
            epoch_earned += rewards
        else:
            unassigned += rewards
    carry = epoch_earned % total if total else 0
    final_weights = tuple(sorted(next((c.weights for c in reversed(cohorts) if c.at <= through), ())))
    if final_weights != weights:
        dust += carry
        carry = 0
    unearned = [0] * 4
    cancellation = [0] * 4
    canceled: dict[tuple[str, int], list[Funding]] = {}
    for lot in funding:
        if lot.canceled_at is not None and lot.canceled_at <= through:
            canceled.setdefault((lot.member, lot.generation), []).append(lot)
        else:
            for i, amount in enumerate((lot.creator, lot.rewards, lot.referral, lot.protocol)):
                unearned[i] += amount * SCALE - _scaled_at(lot, i, through)
    refunded = 0
    for lots in canceled.values():
        unused = [0] * 4
        refund = 0
        for lot in lots:
            remaining = lot.end - max(lot.start, min(lot.end, lot.canceled_at))
            refund += lot.gross * remaining // (lot.end - lot.start)
            for i, amount in enumerate((lot.creator, lot.rewards, lot.referral, lot.protocol)):
                unused[i] += amount * SCALE - _scaled_at(lot, i, through)
        refunded += refund
        needed = refund * SCALE
        for i in range(4):
            taken = min(needed, unused[i])
            needed -= taken
            cancellation[i] += unused[i] - taken
        if needed:
            raise AssertionError("refund needs unrelated funding")
    result = ScaledEntitlements(creator, members, referrers, protocol, unassigned,
                               tuple(unearned), tuple(cancellation), refunded, dust, carry)
    accounted = (creator + sum(members.values()) + sum(referrers.values()) + protocol
                 + unassigned + sum(unearned) + sum(cancellation) + refunded * SCALE + dust + carry)
    if accounted != sum(lot.gross for lot in funding) * SCALE:
        raise AssertionError("scaled conservation failed")
    return result


def rational_error_bound(funded_lots: int, vector_changes: int) -> Fraction:
    if funded_lots < 0 or vector_changes < 0:
        raise ValueError("negative history counts")
    return Fraction(2 * funded_lots * MAX_TIME + vector_changes * 10 * MAX_GROSS, SCALE)


def vector_change_count(cohorts: tuple[Cohort, ...]) -> int:
    previous: tuple[tuple[str, int], ...] = ()
    count = 0
    for cohort in cohorts:
        current = tuple(sorted(cohort.weights))
        count += current != previous
        previous = current
    return count


def creator_claims(
    funding: tuple[Funding, ...], ownership: tuple[tuple[int, str], ...],
    claim_times: tuple[int, ...],
) -> dict[str, int]:
    """Whole-raw claims follow the current owner, including old unclaimed credit."""
    if not ownership or ownership[0][0] != 0:
        raise ValueError("initial owner required")
    if any(a[0] >= b[0] for a, b in zip(ownership, ownership[1:])):
        raise ValueError("ownership must be chronological")
    if any(a > b for a, b in zip(claim_times, claim_times[1:])):
        raise ValueError("claims must be chronological")
    paid = 0
    result: dict[str, int] = {}
    for at in claim_times:
        owner = next(owner for since, owner in reversed(ownership) if since <= at)
        available = sum(_scaled_at(lot, 0, at) for lot in funding) // SCALE - paid
        result[owner] = result.get(owner, 0) + available
        paid += available
    return result


class ReferenceExamples(unittest.TestCase):
    def test_scaled_frequency_and_rational_attribution_are_separate(self) -> None:
        lots = (Funding("alice", 0, 31, 80, 30, 5, 5, "original"),
                Funding("bob", 13, 47, 32, 12, 2, 2, "original"))
        cohorts = (Cohort(0, (("alice", 7),)), Cohort(13, (("alice", 7), ("bob", 11))),
                   Cohort(25, (("bob", 11),)), Cohort(38, (("alice", 7), ("bob", 11))))
        sparse = scaled_entitlements(lots, cohorts, 47)
        frequent = scaled_entitlements(lots, cohorts, 47, tuple(range(48)))
        self.assertEqual(sparse, frequent)
        ideal = entitlements(lots, cohorts, 47)
        self.assertEqual(vector_change_count(cohorts), 4)
        bound = rational_error_bound(len(lots), vector_change_count(cohorts))
        for member, amount in ideal.members.items():
            self.assertLessEqual(abs(Fraction(sparse.members[member], SCALE) - amount), bound)
        self.assertEqual(sparse.creator, 112 * SCALE)
        self.assertEqual(sparse.referrers, {"original": 7 * SCALE})

    def test_refund_cancels_active_and_future_funding_not_earned_value(self) -> None:
        lots = (Funding("alice", 0, 12, 96, 12, 6, 6, "original", 3),
                Funding("alice", 20, 32, 96, 12, 6, 6, "original", 3),
                Funding("alice", 40, 52, 96, 12, 6, 6, "different", generation=1))
        cohorts = (Cohort(0, (("alice", 120),)), Cohort(3, ()),
                   Cohort(40, (("alice", 360),)))
        result = scaled_entitlements(lots, cohorts, 52)
        self.assertEqual(result.refunded, 210)
        self.assertEqual(result.creator, 120 * SCALE)
        self.assertLess(sum(result.cancellation), SCALE + 4 * MAX_TIME)
        ideal = entitlements(lots, cohorts, 52)
        self.assertEqual(ideal.refunded, 210)
        self.assertEqual(ideal.reserved, 0)
        self.assertEqual(ideal.members["alice"], 15)
        self.assertEqual(ideal.referrers, {"original": Fraction(3, 2), "different": 6})

    def test_ownership_changes_move_all_unclaimed_creator_credit(self) -> None:
        lot = Funding("alice", 0, 12, 96, 12, 6, 6, "original")
        owners = ((0, "first"), (6, "second"))
        self.assertEqual(creator_claims((lot,), owners, (12,)), {"second": 96})
        self.assertEqual(creator_claims((lot,), owners, (3, 12)), {"first": 24, "second": 72})

    def test_authored_free_gap_and_grant_does_not_shift_paid_interval(self) -> None:
        # A grant does not delay the first paid lot. A purchased zero-price
        # interval [10,20) delays the next paid lot without originating funding.
        lots = (Funding("alice", 0, 10, 10, 0, 0, 0),
                Funding("alice", 20, 30, 10, 0, 0, 0))
        self.assertEqual(scaled_entitlements(lots, (), 15).creator, 10 * SCALE)
        self.assertEqual(scaled_entitlements(lots, (), 19).creator, 10 * SCALE)
        self.assertEqual(scaled_entitlements(lots, (), 30).creator, 20 * SCALE)

    def test_all_four_allocations(self) -> None:
        lot = Funding("alice", 0, 12, 96, 12, 6, 6, "referrer")
        cohorts = (Cohort(0, (("alice", 120),)),)
        initial = entitlements((lot,), cohorts, 0)
        self.assertEqual(initial.earned, 0)
        self.assertEqual(initial.reserved, 120)
        partial = entitlements((lot,), cohorts, 3)
        self.assertEqual((partial.creator, partial.members["alice"],
                          partial.referrers["referrer"], partial.protocol),
                         (24, 3, Fraction(3, 2), Fraction(3, 2)))
        self.assertEqual(partial.reserved, 90)
        final = entitlements((lot,), cohorts, 12)
        self.assertEqual(final.earned, 120)
        self.assertEqual(final.reserved, 0)

    def test_later_join_does_not_capture_earlier_stream(self) -> None:
        stream = Funding("alice", 0, 30, 0, 30, 0, 0)
        cohorts = (Cohort(0, (("alice", 1),)),
                   Cohort(15, (("alice", 1), ("bob", 1))))
        result = entitlements((stream,), cohorts, 30)
        self.assertEqual(result.members, {"alice": Fraction(45, 2), "bob": Fraction(15, 2)})

    def test_suspended_interval_excluded(self) -> None:
        stream = Funding("alice", 0, 30, 0, 30, 0, 0)
        both = (("alice", 1), ("bob", 1))
        result = entitlements((stream,), (Cohort(0, both),
            Cohort(10, (("alice", 1),)), Cohort(20, both)), 30)
        self.assertEqual(result.members, {"alice": 20, "bob": 10})

    def test_future_start_and_empty_cohort_are_not_reassigned(self) -> None:
        stream = Funding("alice", 10, 30, 0, 20, 0, 0)
        cohorts = (Cohort(20, (("bob", 1),)),)
        self.assertEqual(entitlements((stream,), cohorts, 5).reserved, 20)
        result = entitlements((stream,), cohorts, 30)
        self.assertEqual(result.unassigned, 10)
        self.assertEqual(result.members, {"bob": 10})

    def test_curve_partition_and_window(self) -> None:
        self.assertEqual(curve_value(100, 15_000, 100), 125)
        self.assertEqual(curve_value(200, 15_000, 100), 225)
        self.assertEqual(curve_value(MAX_GROSS, 10_000, 0), MAX_GROSS)
        for boost in (10_100, 15_000, 30_000, 100_000):
            for horizon in (1, 7, 100, MAX_GROSS):
                pieces = (1, 2, 5, 13, 101)
                cursor = total = 0
                for piece in pieces:
                    total += curve_value(cursor + piece, boost, horizon) - curve_value(cursor, boost, horizon)
                    cursor += piece
                self.assertEqual(total, curve_value(cursor, boost, horizon))


if __name__ == "__main__":
    unittest.main()
