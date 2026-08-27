# Incident response runbook

Status: **procedure ready; responders and public channels not yet approved**.

## Triage and containment

1. Record the first observed block/hash, affected addresses, transaction hashes,
   direct reads, reporter, and UTC time. Preserve logs before changing anything.
2. Reproduce through a second RPC and compare against the checked-in Foundry
   broadcast and generated chain address.
3. Stop UI promotion and new tier creation guidance for an affected factory.
   Do not hide existing credentials, liabilities, or fixed-destination exits.
4. If reducing new activity is safer, the current tier owner may pause the tier.
   Pause does not stop claims, withdrawals, refunds, or synchronization.
5. Publish plain guidance that distinguishes confirmed chain state, provider
   outage, suspected impact, and unknowns. Do not promise recovery or redirect.

## Response boundaries

There is no upgrade, rollback, administrator transfer, token rescue, or payout
redirect. Never consume protected reward/referral liabilities or unsolicited
surplus to improvise recovery. Preserve fixed payout identities and the
historical credential model.

If a new protocol instance is required, freeze the affected UI integration,
complete a new review and public broadcast, and explicitly supersede the old
record. The old contracts and liabilities remain independently readable; do not
rewrite history or describe a new deployment as a rollback.

## Closure evidence

An incident closes only with root cause, affected range, custody reconciliation,
user impact, containment actions, code and broadcast digests, owner decisions,
follow-up checks, and a public/private disclosure disposition. Update runbooks
when the process—not merely one execution—was deficient.
