# Creator, Supporter and Operator Interface Contract

The interface explains reward weight and earned money separately. It never presents a multiplier as a promised payout. Follow `web/AGENTS.md`: wagmi/viem own the full wallet lifecycle and generated Foundry bindings own contract shapes.

## Creator Publication

- Label the control “Reward early supporters” with More / Some / None. Some is initially selected. Presets fill starting boost and early-support window; advanced edits show Custom. A 1.00x boost normalizes to None and no active window.
- Fixed-price window uses whole configured periods plus equivalent total time. PWYW uses a total contribution threshold in the selected token. Show its canonical converted amount during review, especially with scaled token displays. No separate reference-price field.
- Preview the continuous marginal boost, the average boost for an example purchase that may cross the window boundary, and the normal rate after the window. The graph is illustrative share weight. Cash splits remain separate.
- Validate the same bounds as the contract. Do not silently clamp over-cap values or zero-after-conversion amounts. Changing token or price requires revalidating/converting the unpublished window; it cannot alter an existing tier.
- Review permanently locked starting boost, window, allocation rates and earning rules. Explain upfront permanent shares, all four time-earned cash allocations, creator-sync cutoff, and the distinction between free access and suspended rewards. Published tiers show read-only terms; metadata editing cannot change them.
- Use the documented initial defaults and allow creator customization within supported bounds. Preset changes affect only unpublished forms. An unrepresentable default requires valid input before publication; never clamp silently. Per-asset economic calibration or platform approval is not a prerequisite for these flows.

Affected seams: `features/creator/config.ts`, `CreateTierWizard.tsx`, `TierManagement.tsx`, `features/protocol/registry-reconciliation.ts`, `lib/direct-read.ts`, generated tuple tests.

## Purchase, Renewal and Gifts

Show actual access duration, payment split, estimated new shares, and any historical shares restored. For PWYW, a larger contribution changes weight and curve progress while still buying one actual period. For a zero contribution, show zero new shares and no restoration of suspended shares. Free extension of already-eligible weight follows the accepted behavior.

Use `previewShares` and canonical economic reads at the same block when practical. Do not calculate `sharesAdded=gross` except canonical None. If another purchase moves the curve before inclusion, the earlier quote does not become the success criterion.

After a library-supplied successful receipt, decode relevant `PaymentProcessed`, `SharesIssued` and membership events for this tier/recipient. Confirm actual issued amount and canonical historical shares/access/eligibility. The expected minimum next shares is the prior observed shares plus the receipt-issued amount, not the stale quoted amount; concurrent additional purchases may make the total higher. No log search or receipt reconstruction is introduced.

Affected seams: `features/membership/state.ts`, `MembershipExperience.tsx`, `membership-read.ts`, existing payout/transaction reconciliation helpers.

## Earnings and Claims

| Audience | Display |
|---|---|
| Creator | Settled amount available to claim, future creator allocation reserved, processed-through time when incomplete |
| Member | Settled reward claim, historical weight, eligibility status, and tier-wide future member funding clearly labeled as a pool—not a personal entitlement |
| Referrer | Their settled commission and reserved originating commissions where bounded reads support it; no membership prerequisite |
| Protocol operator | Settled releasable buyback funds, reserved funding, and accounting progress, separate from market execution |

Do not calculate a member's guaranteed future reward by multiplying aggregate unvested funding by today's share fraction. Recipient eligibility and later purchases can change that allocation.

Claim success comes from the matching actual payout event and authoritative refreshed state. Confirm the paid amount; show any subsequently earned balance. Remove predicates that require a creator/member/referral balance to remain zero. Earned claims stay available after pause, sync, refund or ownership changes according to their beneficiary rules.

## Catch-up

Incomplete accounting is distinct from zero earnings. Show a short explanation such as “Update earnings to include membership time since [time]” and a bounded “Advance” action that can also release earned funding and perform eligible buyback/burn work. Existing settled earnings remain claimable. Each successful advance receipt refreshes canonical status and separately reports accounting progress, released funding and burned amounts. Accounting-only and mixed-stage progress are successful outcomes; failed stages and no-work outcomes are distinct. Further work offers another ordinary transaction, and the existing permissionless runner uses the same combined action across calls. No worker payment is displayed or promised. No local queue of pending transactions, custom retry engine or automatic wallet signatures.

A purchase/refund/sync simulation returning AccountingBehind directs the user to advance, then a new simulation. Direct tier-only processing remains available to compatible clients. Do not claim the reverted attempt saved progress. Do not present a completion percentage based on an unbounded unknown event count. Use processed-through time and whether another boundary is due.

Affected seams: membership/account summaries, creator operations, `ReleaseTierFees.tsx`, `prepare-burn.ts`, `fee-forecast.ts`, `lib/buyback-settings/read.ts`, `web/scripts/run-buybacks.ts` and `buyback-rehearsal.ts`.

## Refund Review

Show fixed recipient, actual unused-time gross refund and funding from its reserved allocations. Remove owner top-up amount/allowance controls. A complete preview uses settled accounting. A `projected` preview is a constant-work current-block refund calculation before any pending global boundary; label it as projected at `fundingAsOf`, separately from settled `accountingAsOf`, and require fresh simulation, which settles before refunding. If neither complete nor projected, label the financial amounts historical and require catch-up plus a fresh quote before submission. This avoids making creators chase a cursor that becomes incomplete on every new block even when no checkpoint is due. Preserve creator authority and max-gross protection. Confirm actual refund/canceled-time receipt values and a newer canonical funding generation; later legitimate grants/payments must not make that receipt appear unsuccessful. Historical shares and the curve cursor remain permanent.

## Independent-Client Parity and States

Every create/read/process/pay/claim/refund/sync action is represented in the tier/factory ABI. No website visit establishes vesting, eligibility or claim rights. A direct compatible client can perform the same authorized action without app-specific secrets, sessions or signatures beyond the existing wallet call.

Cover disconnected/wrong chain, invalid parameters, insufficient funds/allowance, simulation revert, pending/confirmed/reverted wallet states, incomplete accounting, no eligible shares, zero settled earnings, continuing accrual, paused access, suspended rewards, token display change, and successful receipt with nonzero refreshed earnings. Use library-owned transaction states, not an application replacement detector.

## Browser Acceptance

Observe publication for every preset and custom settings; immutable readback; both pricing modes; a curve-crossing purchase; execution-time quote change; free preserve, free non-restoration and positive restoration; delayed catch-up in multiple transactions; all three claims with accruing balances; owner transfer; partial refund after earlier payouts; and earned-only buyback release. Record exact local chain, revision and authoritative receipt/read values. Mocked frontend checks alone do not satisfy the observed browser requirement.

## Accessibility and Animation Acceptance

Apply FR-052–054 and SC-012 to this feature's new and changed surfaces. Reuse the existing semantic controls, focus styling, status components and motion preferences; do not add a separate accessibility mode or redesign unrelated pages.

- **Controls and validation:** Use labeled native controls where suitable; expose preset group names, selected values and Custom state. Custom boost/window fields include units, supported limits and associated instructions. All actions work by keyboard without traps or dragging. Keep focus visible and unobscured in logical order; restore it after dismissing app dialogs. Associate field errors programmatically, explain how to fix them, and focus the first invalid field on failed form submission. Published values remain readable as text.
- **Summary instead of chart navigation:** Present a visible summary next to the controls and in immutable review. For example: “Some — starts at 1.5× reward weight, tapering to 1× over the first 1,000 purchased periods.” Use the actual configured values and period units; PWYW summaries use the contribution threshold and token. None explains the normal linear rate, while Custom exposes the configured boost and window. Any displayed example purchase's average boost must also appear in text. Explain that weight is not a guaranteed cash payout. Keep supplemental chart rendering out of the accessibility tree and tab order; never put focusable descendants inside an aria-hidden chart. Do not require chart navigation, exhaustive point descriptions or a data table. Any necessary value or action belongs in the text/controls as well, rather than only in a hover tooltip or plotted interaction.
- **Statuses and recovery:** Clearly label earned versus reserved funds, historical weight, eligibility, processed-through time and incomplete accounting. Announce meaningful loading, validation, pending, completed, failed and further-work states through appropriate existing status/error semantics. Do not make every accruing number or refreshed timestamp a live region; routine reads must not steal focus or repeatedly announce balances. Keep claim, advance and retry controls labeled and keyboard usable, using wagmi-owned transaction state.
- **Visual access:** Target at least 4.5:1 contrast for normal text, 3:1 for large text and meaningful control/graph marks against adjacent colors. Do not rely only on color for selected, invalid or earning states. Maintain usable text and controls at 200% text zoom and 320 CSS-pixel width without lost content or actions. Support system high-contrast/forced-colors presentation, including chart lines and labels; do not depend on a background fill or disable forced colors globally. Meet standard target-size/spacing requirements for interactive controls.
- **Animation:** Preserve normal transitions and chart animation by default. With prefers-reduced-motion, suppress nonessential drawing, movement and animated numeric interpolation and show the stable current result. CSS rules do not cover canvas or JavaScript animation automatically; implement preference handling at those seams when used. High contrast alone does not disable animation. Avoid flashing; any automatically moving content that requires a pause control must provide it.
- **Evidence:** Exercise keyboard-only and a named browser/screen-reader combination through preset/custom publication, invalid input correction, a claim and multi-step catch-up/retry. Confirm summaries match canonical settings and no chart traversal is needed. Observe default and reduced motion, high contrast/forced colors, zoom/reflow, focus and status announcements. Automated semantic/contrast checks supplement these observed journeys. This is feature acceptance, not a claim of a completed site-wide accessibility audit.

The baseline is applicable [WCAG 2.2 A/AA criteria](https://www.w3.org/TR/WCAG22/), with the explicit reduced-motion treatment above. The summary carries the graph's purpose and decision-relevant information, following [W3C text-alternative guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html); no separate assistive chart experience is required. Reduced motion also follows [W3C interaction-animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Atomic advancement revision

Use fixed 25-checkpoint UI batches. Membership page targets its tier; protocol page defaults to automatic bounded selection with optional registered tier address input. Expose accounting-only, buyback-only and both. Native simulation/estimation and wallet lifecycle own transaction preparation; no blanket gas budget. Show skip reasons, full rollback errors and a catch-up anchor for AccountingBehind. Display the immutable tier minimum in PWYW and publication review, including zero access.
