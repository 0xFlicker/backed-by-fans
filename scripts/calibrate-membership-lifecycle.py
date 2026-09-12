#!/usr/bin/env python3
"""Independent rational cash expectations for permanent membership retirement.

No production ABI, ledger, or onchain reads are used. Existing 004 calibration
artifacts remain historical; this generates the current lifecycle vectors only.
"""
from fractions import Fraction
from pathlib import Path
import json

UNIT = 10**18
HORIZON = 1000 * UNIT


def cumulative(gross, boost):
    width = min(gross, HORIZON)
    return gross + width * (2 * HORIZON - width) * (boost - 10_000) // (20_000 * HORIZON)


def lifecycle(boost, refund):
    cursor = 0
    last = 0
    positions = []
    credits = {"A": Fraction(), "B": Fraction()}
    earned = [Fraction() for _ in range(4)]
    refunded = Fraction()

    def settle(through):
        nonlocal last
        boundaries = sorted({p["end"] for p in positions if p["live"] and last <= p["end"] <= through} | {through})
        for at in boundaries:
            reward = Fraction()
            for p in positions:
                used = max(0, min(at, p["end"], p["cancel"]) - max(last, p["start"]))
                for purpose, allocation in enumerate(p["cuts"]):
                    amount = Fraction(allocation * used, p["end"] - p["start"])
                    earned[purpose] += amount
                    if purpose == 1:
                        reward += amount
            denominator = sum(p["shares"] for p in positions if p["live"])
            assert denominator or not reward
            for p in positions:
                if p["live"]:
                    credits[p["owner"]] += reward * Fraction(p["shares"], denominator)
            # Funding through the boundary belongs to the pre-expiry cohort.
            for p in positions:
                if p["end"] == at:
                    p["live"] = False
            last = at

    def create(at, owner, gross, duration):
        nonlocal cursor
        settle(at)
        shares = cumulative(cursor + gross, boost) - cumulative(cursor, boost)
        cursor += gross
        cuts = [gross * 8 // 10, gross // 10, gross // 20, gross // 20]
        positions.append(dict(owner=owner, start=at, end=at + duration, cancel=10**9,
                              shares=shares, cuts=cuts, gross=gross, live=True))

    duration = 30 if refund else 10
    create(0, "A", 100 * UNIT, duration)
    create(0, "B", 100 * UNIT, duration)
    settle(10)
    if refund:
        p = positions[1]
        refunded = Fraction(p["gross"] * (p["end"] - 10), duration)
        p["cancel"] = 10
        p["live"] = False
    else:
        create(10, "A", 100 * UNIT, 10)
    settle(20)
    if not refund:
        create(20, "A", 100 * UNIT, 10)
    create(20, "B", UNIT, duration)
    settle(30)
    reserved = sum(Fraction(p["gross"] * max(0, p["end"] - 30), p["end"] - p["start"])
                   for p in positions if p["cancel"] >= p["end"])
    shares = {owner: sum(p["shares"] for p in positions if p["live"] and p["owner"] == owner)
              for owner in credits}
    assert sum(credits.values()) == earned[1]
    assert sum(earned) + refunded + reserved == cursor
    return [boost, int(refund), cursor, int(refunded), shares["A"], shares["B"],
            int(credits["A"]), int(credits["B"]), int(earned[0]), int(earned[1]),
            int(earned[2]), int(earned[3]), int(reserved)]


if __name__ == "__main__":
    rows = [lifecycle(boost, refund) for boost in [10_000, 15_000, 30_000] for refund in [False, True]]
    words = [word for row in rows for word in row]
    target = Path(__file__).resolve().parents[1] / "contracts/test/fixtures/membership-curve-lifecycle.bin"
    target.write_bytes(b"".join(word.to_bytes(32, "big") for word in [32, len(words), *words]))
    print(json.dumps(rows, indent=2))
