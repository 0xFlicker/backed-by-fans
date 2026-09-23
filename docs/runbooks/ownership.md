# Ownership operations runbook

Status: **procedure ready; production owners not selected**.

Both factory and tier use non-renounceable, nonzero, two-step ownership. A
transfer changes nothing until the nominated address calls `acceptOwnership`.
The pending address must be verified directly before initiation and again before
acceptance.

## Tier ownership

The current tier owner controls pause, supply cap, maximum prepaid periods,
metadata, renderer, grants/revocations, creator withdrawals, decreasing cancellation
retention and one-way periodic capability enablement. Acceptance transfers these
controls and earned creator proceeds. It does not move NFT ownership, member
credit, referral attribution or protected liabilities, and cannot raise retention.

Record current cancellation terms and earned/unearned balances before acceptance.
Cancellation is initiated by the NFT owner or approved operator, pays the current
NFT owner and credits the retained share to earned creator proceeds. It needs no
creator top-up or pause. Use the native owner/minimum/deadline protections when
operating an NFT the creator separately owns or is approved for. Grant revocation
is distinct: removing nonzero gifted time stops refill enrollment but preserves
paid time. The live NFT holder can explicitly enroll again.

## Factory ownership

The factory owner controls the accepted-token set, fee recipient, and future
ownership nominations; tier creation remains permissionless for enabled tokens.
The fee recipient, not the owner by default, is the only protocol-fee withdrawal
destination. Verify the intended fee recipient separately from the intended
factory owner.

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
