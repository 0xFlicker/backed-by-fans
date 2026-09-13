# Application Contract

## Canonical reads and identity

Use generated Foundry/Wagmi bindings, pinned chain ID and official factory registration. Remove ERC-5192 as a required authenticity interface in `membership-interfaces.ts`. Public addresses remain sourced from supported public Foundry broadcasts; this change does not relabel old deployments as implementing the new lifecycle.

Position keys are `(chainId, tierAddress, tokenId)`. Beneficiary-credit keys are `(chainId, tierAddress, beneficiary)`. Never merge two positions by tier alone. Owner discovery pages and their detail reads use one block snapshot; restart on refreshed ownership rather than continuing an offset across different blocks. Preserve the existing bounded tier catalogue pages and nest bounded position pages. Display more-results controls and incomplete totals. Former-member rewards remain discoverable via `hasClaimInterest`, even with zero NFT balance.

## Join, renew, sponsor and grant

- A wallet with no positions sees the membership content and **New membership** flow directly, with no membership selector or empty panel.
- A wallet with exactly one position opens that verified token's status and renewal view automatically. A wallet with several positions uses a compact **Your memberships** selector beside the membership details; do not choose among siblings. Keep these controls in the open page layout, without a surrounding card. Show pagination only when another page exists.
- **Join again** is a secondary text action that opens **New membership**, subject to tier capacity. Preserve that explicit choice across refreshes; with one position, **Back to your membership** returns to it.
- **Renew membership #ID** targets a selected live position. The preview shows its time, added time, new weight and locked referral. Other positions remain unchanged.
- An expired position shows **Membership ended** and **New membership**. Explain that earned rewards remain claimable. Do not promise old weight or identity restoration.
- Gifts distinguish **Give a new membership** and **Add time to membership #ID**. The latter shows the current recipient and pins expected owner/referral; a transfer makes the quote stale and requires a fresh confirmation.
- Creator grants distinguish new membership from selected-token additions. Creator refund confirmation includes ID, current recipient and gross ceiling. Ownership changes between preview and submission produce a clear stale-preview error.
- Zero-contribution and complimentary flows can require accounting maintenance just as paid flows do. Display **Update membership accounting** with progress when needed, then obtain a fresh quote; never hide the transaction or automatically spend funds after a maintenance receipt.

`MembershipExperience.tsx`, membership state/read helpers, `TierManagement.tsx`, management reads and grant reconciliation must target canonical token IDs rather than a wallet-derived contract identity. The presentation may initially select a sole verified owned token, but must not silently choose among multiple positions or override an explicit new-membership choice. Decode a newly created ID from the successful supplied receipt and then reread canonical state. Existing-token actions reconcile their explicit ID.

## Transfer

Each live position offers **Transfer membership**. The confirmation identifies the selected token and recipient and explains that remaining time, membership benefits and unclaimed member rewards go with it, and its referral choice stays fixed. Distinguish ERC-20 payment allowance from ERC-721 token/operator approval. Allow viewing and revoking NFT approvals through the same library transaction integration.

Describe NFT approvals as permission to transfer. Do not enable owner-only renewal or reward claims merely because the connected wallet has token or operator approval; claims remain owner-authorized even when the payout would go to the owner. Sponsored time additions remain a separate flow with their own rules.

Use safe transfer by default. Show pending/failed/confirmed state from wagmi/viem; after a successful receipt reread ownership, both ownership pages, access and reward views. If the receiving contract moved the token later, show canonical current ownership; do not invent a successful recipient postcondition unsupported by the receipt and reread. A rejected receiver or expired target shows its actual failure. Live transfer actions remain available during a pause, subject to normal ownership, approval and timestamp-based expiration checks. Never disable or gate a live transfer on accounting completeness, require an accounting update first, or process maintenance as part of the transfer. An incomplete reward projection remains visibly incomplete and does not block transfer. Burned tokens cannot offer transfer.

## Account and claims

List individual same-tier positions with distinct token identity, expiry, access and reward state. Grouping under a tier must not collapse them. Separate **Rewards from ended memberships** at the beneficiary/tier level; explain amounts below one payment unit without displaying them as lost or claimable whole units.

**Claim all** discovers the invocation’s positions and beneficiary balances automatically, sizes explicit batches by simulation/gas estimation, and reports completed and remaining work. Manual **Claim selected rewards** remains optional. Each tier’s beneficiary categories are accounted for correctly across split batches; new arrivals and continuous accrual do not extend the invocation indefinitely. Resource failures cause smaller batches; business failures remain explicit. Wallet rejection stops the sequence with successful receipts preserved for in-memory resumption. Transfer or burn after selection forces a refresh on stale-selection failure. A zero-NFT account can claim its ended-membership balance directly. Incomplete projection is never treated as zero or a final claimable amount.

`AccountDiscovery`, `account-discovery.ts`, `account-cache.ts`, `account-rewards-read.ts` and `AccountRewards.tsx` need page completeness and composite keys. Refetch each affected position and beneficiary balance after receipt success. Keep no historical-log discovery or application transaction journal.

## Permissionless maintenance

Replace creator-only `ExpiredMembershipSyncControl` and `expired-membership-sync.ts` history scanning with a shared status/action usable by any wallet, including while paused. One call performs at most its caller-supplied combined accounting/retirement budget. Show saved progress, whether more remains, and another explicit action if needed. Explain that an atomic payment/claim revert did not save attempted cleanup.

Maintenance has no keeper reward, payment-token allowance, receiver payout or privileged caller requirement. Status and projected capacity use both funding and expiration work.

## Documentation and simulations

Rewrite current lifecycle language in `docs/protocol/integration.md`, contract NatSpec, public help/copy, simulation helpers and fixtures. Update `docs/whitepaper/whitepaper.md`, `outline.md`, timeline/weight diagrams and the generated PDF. Explain transferable ownership, independent positions, chronological weight removal, fresh return issuance and fractional owner rewards using membership/support language. Historical funding does not establish that the present NFT holder personally paid.

## Wallet integration boundary

Use wagmi/viem for connection, chain switching, simulation, write, receipts and query lifecycle. Pass `simulateContract`'s request directly to `writeContract`. Reconciliation starts only from the successful library-supplied receipt and consists of event decoding and canonical rereads. No custom polling, receipt recovery, nonce tracking, persistent intent journal, replacement classification or new indexer is introduced.

## Accessibility implementation and evidence

Apply these requirements to membership/position selectors, transfer and approval controls, maintenance actions/progress, discovery pagination, and live/retired reward selection and claims. Use existing accessible components and native HTML controls where possible.

- Every action and selection is keyboard operable with a logical tab order and visible focus. No pointer-only action or keyboard trap. Dialogs receive focus, contain keyboard focus while open, support dismissal where appropriate, and return focus to the trigger or a sensible surviving control when closed.
- Give controls accessible names; distinguish repeated position controls by membership ID and tier. Expose selected, expanded, busy and disabled states through native semantics or appropriate ARIA. Associate input errors and help with their fields; do not communicate state solely by color.
- Announce meaningful loading completion, transaction outcomes, stale selections and maintenance progress through status/error semantics without moving focus or announcing every background refresh. Unknown progress must not display a fabricated percentage.
- When a selected position disappears after transfer or retirement, preserve a logical focus destination and announce the selection change. Refreshes must not silently drop focus onto the document body.
- At a 320 CSS-pixel viewport, controls, labels, errors and membership/reward information reflow without page-level horizontal scrolling, overlap or clipped actions. Long addresses and IDs wrap or use an accessible full-value affordance.

Implement all criteria even when testing tools are limited. Run available static accessibility checks and review component semantics, focus handlers, announcements and responsive styles against each criterion. Use automated checks and manual keyboard, assistive-technology and narrow-screen replay when available. If unavailable, record the specific limitation, source evidence and behaviors not exercised; static analysis and source review are an accepted verification limit for accessibility, not proof of rendered layout, keyboard execution or screen-reader behavior. A detected implementation defect must still be fixed. This allowance does not waive contract, accounting or other product-flow validation.

## Loading, empty, failed, stale and incomplete states

Apply these ordinary read states to membership selection, ownership discovery, maintenance status and rewards. Use the existing query and transaction lifecycle. Only actions whose own required data is unavailable or invalid need to wait; incomplete discovery or reward accounting must not block an otherwise valid live transfer.

| State | Presentation | Actions and recovery |
|---|---|---|
| Loading | Show a loading indicator for the pending selector, ownership page, maintenance status or reward read. Previously loaded data may remain visible with a refreshing indicator; do not replace unknown data with zero or an empty-state claim. | Wait for data required by the selected action. Keep unrelated usable controls available; query completion updates the affected view. |
| Empty | After a complete successful read, distinguish no selectable memberships, no owned positions, no maintenance due as of the read, and no whole rewards currently claimable. Keep fractional earned credit visible. | Offer new membership where permitted. A wallet with no NFTs can still claim settled ended-membership rewards. Never treat an empty page with a continuation or an incomplete projection as a complete empty result. |
| Failed | Show the read error in the affected area and label retained data as outdated; do not imply a failed read established zero membership or rewards, or completed maintenance. | Provide retry through the existing query mechanism. Preserve valid selections where possible; only affected dependent actions wait for usable data. Transaction failure uses its actual library error; a failed atomic call does not report saved maintenance. |
| Stale | Explain that ownership, expiration, a quote or maintenance status changed. A transferred, expired or burned selection must not remain presented as eligible for its previous action. | Refresh canonical data; clear invalid selections and let the user select an eligible position or reconfirm a fresh quote. Refresh owner pages from the start at the new block. Reread maintenance status after a receipt; continue only within an explicitly started Claim all sequence, with normal wallet confirmations; otherwise require another action. |
| Incomplete | Show loaded positions plus a continuation, a clearly scoped subtotal, or accounting progress with more work remaining. For reward projections that cannot finish, show the amount as incomplete, not as a final claimable total. | Allow loading further pages and selecting validated loaded positions within batch limits; selected claims must satisfy their own preview/execution requirements. Offer explicit bounded maintenance for accounting-dependent actions. Keep live transfers and direct settled retired-credit claims available under their existing rules. |

A partial total covers only the identified loaded positions/tiers at the indicated snapshot; label that scope and never call it the full wallet balance. Keep different payment assets separate, include beneficiary-level categories only once per tier, and do not substitute zero for omitted or unprojected values. This clarifies the existing discovery, preview and transaction behavior without adding contract calls or a new state-management service.

## 2026-09-12 clone and caller-budget amendment

Feature 005 remains open. One fixed implementation is deployed separately; the membership factory directly deploys standard deterministic ERC-1167 clones and initializes each atomically once. The implementation is initialization-locked. Initializable OpenZeppelin ERC-721 enumeration/ownership preserve independent tier state; fixed economic storage has no setters or upgrade path. Factory registration distinguishes official tiers. Tier A/B stores and the separate tier deployer are removed.

Custom membership mutations accept an explicit accounting budget; factory claims share a caller budget across sorted tier requests by actual consumed steps. All protocol batch/page paths remove arbitrary numeric iteration ceilings. Inputs, economics and native Robinhood limits remain validated. Positive-budget maintenance saves chronological partial progress; atomic mutations revert if catch-up cannot finish. Standard ERC-5643 signatures require separate maintenance for due events. Transfer and settled retired-credit withdrawal do not run catch-up.

Validation includes above-former-cap cases, small/large batch equivalence, locked/atomic clone initialization, independent storage, Claim all interruption/revalidation, and measured before/after gas. Replace only the owned fork/web at RPC 18557, chain 31337 and web 3110 using the existing private RPC/pin. Explorer verification/clone recognition is deferred to the next authorized testnet deployment. Previous evidence does not validate this amendment.
