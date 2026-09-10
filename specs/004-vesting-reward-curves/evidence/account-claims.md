# Account-wide claims — 2026-09-10

Implemented tier `claimAll`, factory-only `claimAllFor`, and factory `claimEverything` (eight unique registered tiers, shared 25-checkpoint budget). Payments remain in their original currency and go directly to the beneficiary. Original settled-only claims remain available while accounting is behind. Contextual errors preserve the blocked tier or underlying transfer error. Active referral-only wallets are discoverable before first settlement.

The account section previews totals across all three payout categories and presents a named, separate advance CTA when necessary. It batches larger discovered collections, labels incomplete discovery, resimulates before writes, checks receipt events and refreshes queries. Changes in claim-versus-advance intent are never silently submitted. The component uses wagmi/viem and TanStack Query directly; no custom transaction lifecycle, pending journal or compatibility layer was added.

Verification:

- 70 focused Solidity/deployment tests passed (`ClaimEverythingTest`, `ClaimsAndWithdrawalsTest`, `AdversarialPaymentsAndExitsTest`, `DeploymentScriptsTest`, `VestingLinkingTest`). Covers categories, ownership, multiple currencies, shared budget, atomic rollback, transfer rejection, reentrancy, fractions through existing ledger tests, immutable store/source/link verification and deployment graph limits.
- 665 frontend tests passed, including named catch-up, exact fresh wagmi request, no-op suppression, receipt confirmation, explicit batching, changed-intent rejection and referral-only discovery.
- TypeScript, ESLint, formatting and generated-contract drift checks passed.
- Final measured tier base creation: 41,914 bytes (limit 49,150).
- Factory runtime: 12,600 bytes (limit 98,304).
- Exact factory CREATE2 payload: 57,956 / 58,148 bytes for the two public configurations (limit 95,000; retained headroom assertion below 65,000).
- Exact store A/B CREATE2 payload: 21,371 bytes each. Existing store runtime and entire creation graph assertions pass.

Solidity test harnesses use the existing larger test-only allocation because they embed whole deployment graphs; release limits are enforced explicitly by DeploymentScriptsTest. No limits in foundry.toml or deployment scripts changed.

The updated contracts were deployed to the fresh local fork `account-claims-20260910-04`, with the website on port 3110 and wallet RPC on port 18557. Both user wallets were funded and account/protocol HTTP checks returned 200. Live wallet claim/advance rehearsal remains pending. No public deployment or push occurred.
