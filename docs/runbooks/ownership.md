# Ownership operations runbook

Status: **procedure ready; production owners not selected**.

Both factory and tier use non-renounceable, nonzero, two-step ownership. A
transfer changes nothing until the nominated address calls `acceptOwnership`.
The pending address must be verified directly before initiation and again before
acceptance.

## Tier ownership

The current tier owner controls pause, supply cap, maximum prepaid periods,
metadata, grants/revocations, creator withdrawals, refunds, and refund top-ups.
Acceptance immediately moves all of those responsibilities and all existing
creator proceeds. It does not move credential ownership, reward shares, locked
referrals, or protected liabilities.

Before acceptance, record refund exposure and ensure the next owner understands
that a refund can require its exact USDG top-up. Exercise preview and allowance
checks using a non-production rehearsal. The operational sequence is: pause and
wait for confirmation, preview from confirmed paused state, execute the bounded
`refund` with the previewed ceilings, wait for confirmation, and only then
unpause. Do not use the unbounded ERC-5643 cancellation adapter for routine
refunds.

## Factory ownership

The factory owner controls the fee recipient and future ownership nominations;
tier creation remains permissionless. The fee recipient, not the owner by
default, is the only protocol-fee withdrawal destination. Verify the intended
fee recipient separately from the intended factory owner.

## Procedure

1. Reproduce the current checked-in broadcast and direct-read `owner`, `pendingOwner`,
   balances, liabilities, fee recipient, and pause/cap state.
2. Verify the nominee's address and control through two independent channels.
3. Initiate `transferOwnership`; record receipt and expected pending address.
4. Require the nominee to direct-read state, simulate `acceptOwnership`, then
   accept from the nominated account.
5. Confirm the ownership events and direct state through two RPCs. Rerun the
   deployment checker and begin the monitoring observation window.
6. Create a new signed operational record. Never edit the prior evidence.

Never nominate zero, renounce ownership, assume a multisig transaction executed
because it was proposed, or combine nomination and acceptance into an opaque
batch that prevents independent inspection.
