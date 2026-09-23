# Product and Integration Contract

## Creator

Creation requires an explicit retention percentage, displaying both creator retention and member refund, and an independent periodic-capability choice for fixed positive pricing. Explain that retention can only decrease for all positions and allowance alone does not enroll anyone. Later management offers retention reduction and one-way capability enablement. Preserve grant/revoke controls under their existing authority and clearly distinguish them from removed creator paid-refunds. When revocation would remove gifted time from an enrolled position, the creator review must say: “Revoking this gifted time will also stop this membership’s periodic refill.”

## Member

Use current chain/tier/token identity and connected-wallet authority. All positions remain individually selectable, including multiple positions of one owner. Operator cancellation is supported by entering/selecting a position and checking actual token/operator approval; discovery must not assume the connected wallet owns it. Do not offer operators enrollment or allowance manipulation for someone else's wallet.

**Cancel now:** Show current owner, unused gross, refund percentage/amount, creator proceeds, earned claims preserved, canceled paid/granted time and permanent retirement consequences. Require complete current accounting projection; offer independent maintenance when behind. Show current estimated refund, minimum refund on success and quote deadline. Use a two-minute chain-time review window shortened to remain strictly before expiration; calculate its floor through the deadline and bind owner/minimum/deadline in the submitted action. Normal inclusion delay within this window is covered by the floor. After the deadline, require a fresh review and wallet submission; never silently extend it or lower the minimum. No future live window means no protected quote is offered. The guaranteed minimum is conditional on successful cancellation, not a promise of inclusion. No creator pause is required. Confirm from cancellation/retirement receipt events, then refresh final-owner claims.

**Periodic refill:** Display target duration, current prepaid time, effective referral, wallet balance, allowance, fractional equivalents and maximum collectible whole periods. Enrollment and token approval are separately visible actions through existing wallet lifecycle. Finite/unlimited approval must be an explicit choice. For tokens requiring allowance reset, use existing zero-then-set handling rather than overwrite assumptions. Owner can stop enrollment without signing an allowance transaction.

**Stop versus revoke:** Stop disables this position's refills and preserves paid time. Revoking tier allowance blocks charges sharing that spender but leaves enrollment stored; restoring allowance can resume still-live enrollment. Pausing has the same temporary charging effect. Explain that another position can consume shared balance/allowance and no funds are reserved.

**Refill now:** Expose a selected NFT action for any connected executor, including a non-owner who pays transaction gas. Show no-work/blocked reasons, incomplete accounting and actual purchase bounds. The executor cannot choose beneficiary, target or referral. Use separate maintenance action if behind. No guarantee of a background keeper or success before expiration.

## State and race handling

Preserve cached content through transient read failure while marking it stale; never turn unavailable money into zero or incomplete coverage into a complete claim. Refresh ownership, approval, enrollment, policy and quote before simulation. Changed chain/token/target invalidates prior review. Pending action state comes from existing wagmi/viem flow and receipt reconciliation; no new polling/signing framework.

A competing completed refill is included in later cancellation settlement; a completed cancellation makes refill impossible. Stopping enrollment only prevents subsequent charges and does not undo a previously included transaction. Transfer clears intent; recipient must enroll explicitly. Approval revocation or pause can be temporary; canceled/expired positions never restart. Reads distinguish live, expired-awaiting-maintenance and retired.

## Reports and documents

Protocol totals separate actual member refunds, canceled unused gross and informational creator-retention totals. Creator retained proceeds are available earned creator credit; do not add them twice to creator earnings/outstanding balances. Funding residues, unassigned balances and earned credit remain separately classified. Update README/integration examples, generated types, protocol-flow displays, supported agent/action surfaces and whitepaper together.

## Accessibility and evidence

Keyboard-accessible labeled controls, focus handling, readable percentages/units, announced pending/errors/results and narrow-screen layouts apply to each flow. Browser acceptance covers owner, token-approved operator, creator-only rejection and unrelated permissionless refill executor. Report tested viewport/environment and any limitations; static review is not browser proof.

## Prepayment cap changes

Show the owner target and currently purchasable whole periods with concise state labels for no-work or partial refill. Document the exact exclusive N + 1 paid-time limit and examples in the whitepaper and technical docs; do not add lengthy cap explanations or disclaimers to ordinary creator/member experience pages. A cap reduction neither shortens prepaid time nor disables enrollment; raising the cap can permit refill again toward the original target. Do not ask the holder to re-enroll solely because a creator changed the cap. Granted time affects target timing and total expiration, not paid-cap usage.

## Grant-revocation stop disclosure

When enrollment is absent show “Periodic refill off,” with owner-only re-enablement when the position is otherwise eligible. Do not offer restart on a retired position. Keep grant-revocation detail in transaction history. Do not introduce stored reason state, a reason getter, or a history lookup prerequisite for displaying the ordinary off state. The concise creator revocation review still explains that revoking gifted time stops refill.

## Configuration during pause

Keep creator capability enablement and owner enrollment/target changes/re-enablement available while paused, subject to ordinary eligibility. State that configuration moves no funds and refill payments are blocked until unpause. Explain that still-live enrolled positions can then refill; stopped or expired positions cannot restart automatically.

## Cancellation preview after expiration

For “Expired — awaiting retirement,” explain that membership has ended, cancellation is unavailable, and earned rewards are preserved through normal settlement; provide the appropriate maintenance/claim route. For “Retired,” explain that cancellation is unavailable and link to the member's earned-claims view. Do not display a zero-refund quote as actionable, offer refill/reactivation of that NFT, or require a fresh quote deadline just to show non-live status. Unknown IDs show a distinct not-found error. If the selected live position expires during review, replace the quote with this lifecycle explanation.
