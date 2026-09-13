# Application and accessibility evidence — T068/T070

## Configured fork acceptance

The earlier claim that private RPC configuration was missing was incorrect. `contracts/.env` already contains `ROBINHOOD_MAINNET_RPC_URL`; its value was privately mapped to the harness variable `BBF_FORK_RPC_URL`. The endpoint was not printed or persisted in evidence.

The current protocol graph is deployed on an authentic fork of origin chain **4663**, block **58083838**, hash `0xbed1732da1a4301c9f3ea9c5eafbdf76f80e8b4afade3e3c0fe66d41f794ea6c`. Execution is local chain **31337** at `http://127.0.0.1:18557`, with the application at `http://127.0.0.1:3110`. Run ID: `transferable-memberships-20260912-02`; retained reports, traces, screenshots, and per-scenario mined transactions/receipts are under `artifacts/protocol-fork/transferable-memberships-20260912-02`.

| Scope | Passing evidence directory |
|---|---|
| Paid creation, explicit renewal and gift | `browser-131240` |
| Free renewal, permanent expiration and fresh return | `browser-131629` |
| Fixed member/referral payout wallets | `browser-132223` |
| Preserved failed claim and exact retry, creator refund, stale quote | `browser-132420` |
| Refund after claims; mixed free/paid refund | `browser-132627` |
| Beneficiary claims after creator ownership change; mutable creator controls; paused retirement/claim/fresh return | `browser-133209` |
| Permissionless paused batches and zero-NFT owner claim with exact fractional remainder | `browser-133951` |
| Paused transfer with 260 expired grants and incomplete 256-step preview; current-owner refund and final-owner retired claim | `browser-134619` |
| No-NFT account claim; 101-position/nine-tier discovery, stale selection and bounded claims; account keyboard/accessibility checks | `browser-134619` |

**23 distinct browser cases passed: 19 configured scenarios and four general checks.** Renewal recovery passed in `browser-140024`; refund and maintenance recovery passed in `browser-140629`; live accounting preview and reward payout passed in `browser-141247`. The unconfigured-deployment test correctly skips in this configured environment (`browser-141407`); its earlier general-environment pass remains separate. `browser-acceptance-summary.json` selects each case’s latest report by modification time. Individual passing cases above may share a report with an earlier failure in a subsequent case; these are separate successful reruns, not one uninterrupted green invocation. Original failed reports are retained.

The browser uses the existing local EIP-6963 wallet fixture through the real wagmi/viem simulation, submission, receipt and reconciliation flow. Origin payment-token code/storage is unchanged; assets are acquired by real fork trades/deposits. This establishes local fork application acceptance, not browser-extension, hardware-wallet or production acceptance. The one labeled claim-delivery RPC fault checks error handling and exact retry; it is not an issuer-restriction proof. Foundry separately covers restricted delivery.

## Runtime corrections

- Disposable signers avoid default Anvil addresses that inherit origin-chain EIP-7702 code; fixture setup rejects a signer with existing code. No origin account code was cleared and safe mint checks were preserved.
- Fixture transactions retain explicit gas budgets and otherwise allow next-block settlement headroom. A retained local trace established the prior out-of-gas cause.
- Free membership buttons now identify new creation, selected-ID renewal and ended positions explicitly.
- A URL-selected token binds to the first connected wallet and clears from the active selection when another wallet connects; a regression test covers initial connection and switching.
- Refund confirmation now describes permanent retirement and preserved earned owner rewards.
- Creator management wraps long recipient addresses and permits the grid to shrink; the completed-refund 320px overflow regression now passes.
- Browser callers use the current creator acknowledgment and precise gift/refund/renewal selectors. Wallet changes use the existing account-switch helper. Maintenance tests distinguish receipt-timestamp completion from newly elapsed time.

## Accessibility

| Criterion | Executed or reviewed evidence | Remaining limit |
|---|---|---|
| Keyboard, names and selected state | Native labeled selectors, inputs, checkboxes, buttons and details; component keyboard/selection tests; account browser Tab reaches Skip to content | Complete keyboard-only wallet journeys and physical devices were not replayed |
| Focus after selection disappears | Surviving heading refs/focus and status notices in TierReadPanel and account clear-selection behavior; component regressions and source review | Configured transfer/burn focus timing has no dedicated keyboard assertion |
| Errors/help/busy/expanded state and announcements | Associated help, aria-invalid, native details, named regions, aria-busy and status/error semantics; runtime Axe checks | Screen-reader announcements and timing were not tested |
| Saved maintenance progress | Paused multi-batch browser execution, actual processed/retired counts and explicit continuation; no automatic subsequent payment | Screen-reader announcement quality remains unverified |
| 320 CSS-pixel reflow | Actual maintenance, transfer, recovery and 101-position portfolio routes pass document overflow and Axe checks; live previews also pass 320px overflow checks; retained narrow screenshots reviewed | Not a claim about every physical device or browser engine |
| Independent read failures | Component regressions keep paused live transfer, maintenance and settled retired claims available despite unavailable projections | The projection-failure branch uses component mocks; the incomplete-preview transfer uses the real fork |

The user-approved static/source-review allowance applies to the explicitly untested accessibility behaviors. It does not substitute for the configured product flows above. No new custom dialogs or transaction lifecycle subsystem were introduced.

## General browsers and source identity

Before configured recovery, the resumed verification entrypoint passed **91 general browser checks**, with **248 configured checks skipped** and no failures. Those skipped checks were not passes. The configured evidence above supersedes the earlier absence of lifecycle wallet proof.

Final source identity, contract tests, tooling, production build and evidence boundaries are recorded in `verification.md`. No public-chain writes, commits, pushes or deployment occurred. The owned fork and app remain running for review.
