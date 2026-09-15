---
date: 2026-09-13
topic: contract-release-security-recommendations
---

# Contract Release Security Recommendations

## Summary

Record the release-candidate security findings, their protocol context, and the recommended disposition before implementation or release approval. Related findings may be grouped when they describe one exploit chain rather than independent risks.

---

## Review states

- **Open:** The finding and recommendation are recorded, but the protocol decision is not settled.
- **Accepted:** The finding requires a change before release.
- **Risk accepted:** The behavior is intentional and its bounded consequences are documented.
- **Rejected:** The claimed exploit does not hold under the supported trust model or contract behavior.
- **Dismissed upstream:** Excluded from this release decision for the reason recorded in the finding: configuration-based unreachability or external Pons ownership scope.

---

## Findings

### F1-F3. Permissionless buybacks lack an economic execution bound

- **Audit confidence:** 90
- **State:** Accepted
- **Affected path:** `contracts/src/ProtocolBuybackVault.sol` → `contracts/src/PonsBuybackExecutor.sol`
- **Grouped findings:** Permissionless callers can sandwich protocol buybacks; buyback execution accepts economically worthless results; every buyback market leg hard-codes a one-unit output floor.

#### Finding

Any account can select the exact eligible block and authorized input amount for a buyback. The vault limits batch size and cadence, but the executor accepts any positive output. An attacker can manipulate a venue, call the buyback between its own trades, and retain value lost by the vault.

This finding establishes that execution quality is not enforced by the contracts. It does not by itself establish that a sandwich is profitable under the intended production pool depths, fees, gas costs, and configured buyback sizes.

#### Protocol context

Pons is the source of all protocol tokens at launch. Before graduation, the final purchase executes against the Pons bonding curve. After graduation, it executes against the token's main Pons pool.

The configured payment-asset route may contain up to two conversion pools before reaching native ETH or WETH. The executor then unwraps WETH when necessary and always completes the protocol-token purchase through the active Pons curve or main pool. A fee-bearing final Pons venue therefore reduces sandwich profitability but does not protect an earlier conversion leg.

The intended policy uses maximum batch sizes, global and per-asset cooldowns, and the fee-bearing Pons venue to make extraction barely profitable after fees. That claim is currently an operating assumption rather than a contract invariant.

#### Recommendations

- R1. Use operator-controlled execution during the launch and single-venue phase. The trusted operator controls timing, amount, route, and minimum outputs, supplying all policy terms per transaction from off-chain policy. Do not store operator policy on-chain.
- R2. Submit operator transactions through private order flow where the chain supports it, while retaining a hard minimum-output check as the failure boundary.
- R3. Preserve structural route validation, pause, exact settlement, and burn controls in both execution modes. Stored route, batch-size, cooldown, and policy-revision controls apply to permissionless execution; the operator supplies its economic terms off-chain.
- R4. Ship an on-contract transition between `OperatorGuarded` and `PermissionlessGuarded`, retaining global and per-asset pause controls. Do not provide unguarded permissionless execution.
- R5. Make the Safe the economic authority for any transition to `PermissionlessGuarded`, including the caller-independent price limits active at that transition.
- R6. Evaluate the complete route, including payment-asset conversion legs, rather than treating the final Pons pool fee as protection for the entire transaction.
- R7. Report protocol net loss and attacker net profit separately, accounting for venue fees, liquidity costs, gas, and recovered protocol fees. Record the Safe's quantitative acceptance criteria before enabling permissionless execution; do not equate protocol loss with attacker profit.
- R14. Only the factory-owner Safe may appoint, replace, or revoke the operator and change execution mode. The operator is trusted economic and route authority within the executor's supported typed routes; it gains no withdrawal or governance authority.
- R15. Permissionless policy expiry and cumulative budgets are optional. Zero expiry means indefinite validity and zero configured budget means unlimited spending under the existing per-transaction limits and cooldowns. A Safe may configure permanent settings without renewal.

#### Decision

`OperatorGuarded` assigns per-transaction economic and route authority to the configured trusted operator. Its policy lives entirely off-chain; only authorization, execution mode, and accounting/safety state remain on-chain. A transition to `PermissionlessGuarded` assigns standing economic authority to the Safe, which authorizes the public routes and caller-independent limits. Expiry and finite budgets are optional, not release requirements. Findings F1, F2, and F3 are one exploit chain and receive one disposition.

Unpredictable timing and private submission can reduce ordering exposure, but do not guarantee sandwich prevention. On-chain storage is public, and public transaction submission reveals execution terms before inclusion. Hard output bounds remain the enforceable failure boundary.

#### Acceptance examples

- AE1. **Covers R1-R3.** When the Pons curve or pool is the only protocol-token venue, only the configured operator can initiate a market buyback under its submitted minimum output, and a failed price check leaves inventory and cooldowns unchanged.
- AE2. **Covers R4-R5.** When governance enables permissionless execution, the same change also activates a caller-independent economic bound; no interval exists where an arbitrary caller can execute with a dust output floor.
- AE3. **Covers R6-R7.** When a payment token requires conversion before the Pons purchase, the economic analysis includes manipulation of every conversion pool and reports consolidated protocol loss after recovered fees.
- AE4. **Covers R1, R14.** An authorized operator can execute with a supported transaction-supplied route and positive market-leg minima even when no public route or policy exists. Revocation immediately rejects later operator calls, and the public router cannot bypass operator authorization.
- AE5. **Covers R15.** A permissionless policy with zero expiry and unlimited budget remains eligible without renewal, subject to its route, price, batch, cooldown, lifecycle, and pause controls.

#### Sources

- `contracts/src/ProtocolBuybackVault.sol`: permissionless processing, configured routes, batch limits, cooldowns, revisions, and settlement.
- `contracts/src/PonsBuybackExecutor.sol`: conversion routing, lifecycle-selected Pons purchase, and current one-unit output floors.
- `specs/003-protocol-buyback-burn/research.md`: earlier Safe-authorized price-policy design and its trade-offs.
- `specs/003-protocol-buyback-burn/operating-model-proposal.md`: current standing permissionless model and its explicit lack of a fair-price guarantee.

#### Deferred transition decision

The Safe must define the quantitative loss or attacker-profit threshold that qualifies as barely profitable before enabling `PermissionlessGuarded`. This does not block an `OperatorGuarded` release.

### F4-F15. Upstream Pons asset-behavior findings

- **Audit confidence:** 90
- **State:** Dismissed upstream
- **Scope boundary:** The Backed By Fans protocol token is launched against native ETH and accepts only that Pons launch configuration.

#### Grouped findings

- F4. Bonding-curve sells can bypass user slippage and underback reserves.
- F5. Quote payouts trust nominal reserve debits.
- F6. Fee sweeping can erase more debt than the escrow receives.
- F7. A negative rebase can permanently deadlock graduation.
- F8. Escrow claims do not enforce exact outbound settlement.
- F9. Negative rebases create a first-claimer race.
- F10. Deposit-time balance measurement does not survive later rebases.
- F11. A malformed ERC-20 boolean can block graduation.
- F12. One launch can spend another launch's pooled reserve.
- F13. One pool's payout can consume another pool's backing.
- F14. Swap settlement ignores excess hook debits.
- F15. The rebasing-token rescue path cannot rescue insolvency.

#### Disposition

These findings depend on behavior in the external Pons contracts combined with ERC-20 quote assets or pool currencies that tax recipients, surcharge senders, rebase, or return malformed transfer data. Backed By Fans validates that its protocol token's Pons launch and curve use native ETH as the pair token. The launched protocol token is the standard Pons token rather than a caller-selected mutable ERC-20.

The findings are dismissed from the Backed By Fans release decision. This disposition does not assert that the reported generic Pons behaviors are false or acceptable for other Pons launch configurations.

#### Requirements

- R8. Protocol launch validation must continue to reject any Pons protocol-token launch whose pair token is not native ETH.
- R9. Deployment evidence must continue to prove that the protocol token was launched with native ETH and the expected standard Pons token implementation.
- R10. A future proposal to support another Pons pair token must reopen the relevant upstream findings before implementation.

#### Sources

- `contracts/src/libraries/ProtocolLaunchValidation.sol`: requires both the launch record and curve to identify native ETH as the pair token.
- `contracts/script/DeployForkProtocol.s.sol`: previews and launches the protocol token with the native pair-token identifier.
- `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/`: pinned upstream Pons source reviewed by the audit.

---

## Leads

### L1. Free expiration-queue backlog

- **State:** Risk accepted
- **Affected path:** `contracts/src/MembershipTier.sol`
- **Impact:** Per-tier maintenance cost and temporary liveness degradation; no direct loss of custody or entitlement.

#### Assessment

An uncapped contribution tier permits accounts to mint one-period memberships with zero gross payment. Each mint schedules one expiration. An attacker can therefore prepay transaction and storage costs to create a future maintenance backlog.

The backlog is bounded by attacker-funded mints and scoped to one tier. Once its first expiration is due, creation and other accounting-dependent mutations require the same backlog to advance, so the attacker cannot continue extending it without participating in cleanup. Permissionless maintenance clears multiple entries per transaction and remains available while the tier is paused. The existing 10,000-position regression clears the backlog in 400 calls of 25 steps.

The behavior is annoying but bounded: the attacker pays for individual NFT creation while maintenance retires positions in batches.

#### Requirements

- R11. Zero contributions must continue to add access without funding rewards, creator earnings, referral earnings, protocol fees, or reward weight.
- R12. Expiration processing must remain permissionless, bounded per call, and available while the tier is paused.
- R13. User-facing accounting-dependent operations may fail closed while maintenance is behind, without losing funds or changing partial state.

#### Decision

Accept the bounded maintenance burden without adding an admission hook, protocol-token burn, bond, or bounty. The mitigation would add mutable admission authority, alter the meaning of free access, or introduce more lifecycle and custody risk than this attacker-funded backlog warrants.

#### Sources

- `contracts/src/MembershipTier.sol`: zero-gross contribution creation, expiration scheduling, catch-up, pause, and supply-cap controls.
- `contracts/test/MembershipLifecycleGas.t.sol`: bounded preview and maintenance behavior with 10,000 scheduled positions.
- `docs/whitepaper/whitepaper.md`: documented zero-contribution and expiration-maintenance semantics.

### L2-L6. Upstream Pons leads

- **State:** Dismissed upstream
- **Scope boundary:** These leads concern the external Pons operator, vesting, graduation, or launch-forwarder behavior rather than Backed By Fans-owned contracts.

#### Grouped leads

- L2. Trusted operator can self-sandwich curve fee sweeps.
- L3. Trusted operator can self-sandwich hook fee sweeps.
- L4. Repeated vesting-duration flooring may bias Pons vesting release times.
- L5. Finite-range seed-ratio calculations may leave Pons graduation residuals.
- L6. Pons launch-forwarder identity depends on its upstream caller binding.

#### Disposition

Dismiss these leads from the Backed By Fans release decision under the upstream Pons scope rule. This disposition does not classify the leads as disproven findings for Pons itself.
