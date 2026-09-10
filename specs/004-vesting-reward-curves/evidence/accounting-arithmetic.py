#!/usr/bin/env python3
"""Reproduce the planning-only Q128 refund and carry arithmetic checks.

This checks 50,000 deterministic arithmetic samples. It does not execute the
Solidity implementation, model membership histories, verify recipient attribution,
exercise the scheduler, or establish gas/deployment feasibility.
"""

import random


def main() -> None:
    rng = random.Random(401)
    scale = 1 << 128

    for _ in range(50_000):
        gross = rng.randrange(1, 1 << 112)
        duration = rng.randrange(1, 1 << 64)
        elapsed = rng.randrange(duration)
        cuts = sorted([0, gross] + [rng.randrange(gross + 1) for _ in range(3)])
        allocations = [cuts[index + 1] - cuts[index] for index in range(4)]

        earned_scaled = sum(
            (amount * scale // duration) * elapsed for amount in allocations
        )
        refund_raw = gross * (duration - elapsed) // duration
        residual_scaled = gross * scale - earned_scaled - refund_raw * scale
        assert 0 <= residual_scaled < scale + 4 * duration

        carry_sample = rng.randrange(1, 1 << 112)
        weight = rng.randrange(1, 10 * (1 << 112))
        funding_parts = [rng.randrange(1, 1 << 125) for _ in range(5)]
        initial_carry = carry_sample % weight
        index_increment = 0
        carry = initial_carry
        for funding in funding_parts:
            increment, carry = divmod(funding + carry, weight)
            index_increment += increment
        assert (index_increment, carry) == divmod(
            sum(funding_parts) + initial_carry, weight
        )

    print(
        "50,000 randomized Q128 refund/carry arithmetic cases passed; "
        "pure arithmetic only, no Solidity or scheduler proof."
    )


if __name__ == "__main__":
    main()
