# Simple permissionless buybacks

Status: implemented with fresh-fork execution evidence and passing final checks,
2026-09-08; clean personal-wallet handoff pending. See
[current implementation evidence](standing-buybacks-evidence.md).
This replaces period approvals, delegated policy publishing and mandatory EIP-712
price authorizations. Historical expiring-policy deployments and acceptance remain
separate; the replacement requires a fresh immutable deployment.

## The product

Earned fees accumulate. Anyone can press **Buy and burn** when a meaningful batch
is eligible. The contract buys protocol tokens and burns them. If nobody calls,
the money waits; the protocol does not depend on a designated executor or service.

## Standing rules, configured when needed

The Safe configures supported payment tokens, fixed execution routes, batch
minimums/maximums, and minimum intervals globally and per currency. The Safe retains
pause controls but cannot withdraw fee inventory or redirect purchased tokens.
Settings persist until changed; there are no daily renewals, spending periods,
queued periods, automatic budget refills or required price-signing keys.

ETH and canonical WETH share one denomination and execution path. Unwrapping is
automatic and is not a purchase. Membership and donation accounting remain separate.
Only actual purchases consume applicable execution limits. Reverted purchases do
not advance cooldowns. Changes to settings do not reset the last-successful-buy
clocks. Minimum batches prevent dust calls from cheaply occupying the shared clock.
Standing caps and cooldowns bound throughput; they do not guarantee market prices
or fair scheduling by other callers.

## One useful local page

Show available funds, the next eligible buy, estimated tokens burned and gas cost.
Provide human-unit controls for standing limits and one combined Safe review of
changes across tokens. Raw policy JSON is not a normal operator task.

Keep the simulation controls **spend X% over Y time** as a planning aid: they help
suggest economical batch sizes and spacing. They do not create another onchain
period or require repeated approvals. Prefer fewer economical trades; start with
an editable 2.5% gas-cost threshold. Show amounts that should wait rather than
forcing the vault to clear. The gas threshold governs our helper/runner spending;
other callers pay their own gas.

Reuse the existing local Next server and existing quotes, receipt reconciliation
and simulation tools. Add only the backend needed for local reads and optional
sequential Anvil rehearsal. The page and backend are conveniences, never required
authorities for public contract execution.

## Optional execution helper

A bounded one-shot runner checks eligibility, simulates, executes worthwhile buys
and exits. Local invocation proves the path; production Vercel Cron integration is
future work. No perpetual daemon, bespoke wallet lifecycle or publisher service.

Fetch historical samples on demand where useful to the simulator: a two-hour
lookback at two-minute intervals, with no collector warm-up. This offchain data
cannot be represented as a contract-enforced protection. All automatic caches have
TTLs and enforced capacity limits; no persistent cache is required for correctness.

## Approved scope

The user approved time and size controls plus an admin tool to calculate them on
2026-09-08. Execution uses the configured markets under those standing limits.
No oracle, mandatory historical-price check, recurring price policy or price-signing
service is required. There is no further pricing-design approval gate.

The calculator helps choose practical settings from available funds, expected
income, liquidity, simulated execution and gas costs. Quotes and historical data
inform that review without becoming authorization requirements for public callers.
Existing route restrictions, accounting checks and actual burn verification remain.
Historical expiring-policy contracts are not upgraded or migrated. The replacement
has been deployed on a fresh local fork; final manual handoff is recorded separately
in the evidence document.

## Delivery

1. Implement standing execution rules, ETH/WETH handling and generated interfaces;
   remove the obsolete expiring-policy workflow from the replacement implementation.
2. Simplify the local page and reuse the runner. Test accounting, partial fills,
   combined limits, cooldown races, dust calls, gas deferral and service independence.
3. Prepare a fresh verified fork pin, deploy and fund the replacement protocol, and
   exercise actual bonding and graduated-pool burns from an ordinary wallet.
4. Record re-pinning requirements, fixture changes and exact restart commands in
   the repository runbook. No backwards-compatibility layer or state migration.

Success: an ordinary caller can execute an eligible burn without the operator's
backend, a price signer, or a newly issued daily approval.
