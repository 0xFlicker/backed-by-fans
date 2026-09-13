# Public payment reporting and funded review fork

Feature 005 amendment, implemented and verified on the disposable Robinhood-origin fork.

- Run: `payment-flow-20260912-02`; RPC `http://127.0.0.1:18557`, execution chain 31337, webpage `http://127.0.0.1:3110`. Previous run `transferable-clones-20260912-02` was stopped through its scoped runner; its evidence remains intact. The initial payment-reporting fork `payment-flow-20260912-01` was also replaced to include live allocation rates; its evidence is retained.
- New Safe: `0x8E49Fc6cC2d671ee4f1Fc662811Bd50ED90b4da1`. Wallet `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027` is an owner and the threshold remains one. Browser verification reached an enabled Sign settings action without signing or submitting settings.
- Both supplied wallets own three 500 USDG / 30-day memberships and one 0.1 WETH / 30-day membership. Their remaining spending balances were independently verified as 1,000 USDG and 1 WETH each, plus native gas funds and AMD.
- The six USDG memberships fund 300 USDG of protocol fees; WETH memberships fund an additional 0.02 WETH. These accrue during the memberships' first 30 days, not immediately. Exact onchain earned + unearned + released protocol totals match these allocations.
- `review-seed.json` records purchased positions and transaction receipts; `review-verification.json` records independent ownership, balance, interface, clone-bytecode and accounting checks.

## Verification

Final animated-value amendment on run `payment-flow-20260912-02`:

- 24 contract tests passed, including live allocation rates before/after funding and expiry boundaries, paused operation, incomplete preview suppression, unassigned member funding, exact conservation and preview/write equivalence with 256 fuzz runs.
- 15 payment-flow/counter tests and 15 existing counter/account-reward/protocol-preview regressions passed. Countdown subtraction preserves fractional precision and clamps at zero; aggregation keeps a single pinned snapshot and freezes at its earliest boundary.
- Five browser checks passed on the replacement fork: responsive flow and currency selection, funded account discovery, restored Safe signer, failed-read presentation, and live amount motion. The animation check observed increasing earned and decreasing pending amounts with no intervening payment-report RPC reads, unchanged destination geometry, and continued numeric updates with CSS animation disabled under reduced motion.
- Fresh onchain verification confirms all eight NFT owners, wallet balances, the Safe owner and threshold, standard clone bytecode, the membership interface, exact first-month protocol allocations and nonzero live rates. Typecheck, scoped lint and generated binding drift checks passed after the final ABI change.

Earlier checks retained from the reporting implementation:

- Initial accounting/vesting/retirement/payout suite: 89 passing tests. Additional projection suite: 18 passing tests, including unassigned-funding exclusion and 256 fuzz cases comparing exact aggregate previews with writes. Five membership-standard/interface tests passed.
- Account/authenticity/payment-reader suite: 33 passing tests. Payment-flow error/empty state tests: 2 passing tests. Existing protocol preview-funding tests: 3 passing tests.
- Browser: desktop and mobile flow, currency switching, account discovery, Safe signer availability, and RPC failure presentation passed. Axe checks passed at widths 1280, 390 and 320 within the payment flow. Screenshots retained for dark desktop, dark mobile and light desktop. No settings or claim transactions were submitted by browser checks.
- Typecheck, scoped ESLint, generated-bindings drift check, whitespace checks and whitepaper PDF rebuild passed.
- The compiler-derived membership interface ID is now `0xaa0af8b7`, checked against the onchain clone and Solidity's `type(IMembershipTier).interfaceId`. Complete authoritative account discovery discards obsolete cards from a replaced fork without clearing cards during a pending refresh.

This is local fork evidence. Public deployment and explorer verification remain deferred to the next authorized testnet deployment.

## Buyback availability presentation correction

The protocol branch now shows cumulative membership-funded spending, available buyback funds (unspent membership vault inventory plus earned protocol fees), and still-accruing funding. Vault inventory is read at the same block and counted once per currency across pages. Internal release-state labels are removed; the combined buyback action handles release. Contract/deployment changes were unnecessary.

Nine payment-flow unit/component checks and three browser checks passed, including responsive/accessibility review, failed reads, animated amounts, stable layout and reduced motion. Typecheck, scoped lint and whitespace checks passed. Browser inspection also showed actual buyback spending deducted from available funds. Evidence is retained under `validation/buyback-availability` in the active fork run.
