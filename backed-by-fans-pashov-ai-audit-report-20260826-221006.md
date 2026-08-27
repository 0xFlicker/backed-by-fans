# Security Review — Backed By Fans

Date: 2026-08-26

Reviewed revision: `67f29fb`

Mode: full Solidity repository scan

Auditor: Pashov Solidity Auditor skill, 12 independent attacker lenses

Status: final adjudicated report

## Scope

- `contracts/script/CheckDeployment.s.sol`
- `contracts/script/DeployProtocol.s.sol`
- `contracts/src/types/MembershipTypes.sol`
- `contracts/src/OnchainMetadataRenderer.sol`
- `contracts/src/ImmutableCodeStore.sol`
- `contracts/src/MembershipTierDeployer.sol`
- `contracts/src/MembershipFactory.sol`
- `contracts/src/MembershipTier.sol`

Tests, mocks, interfaces, and vendored libraries were used only as supporting context and were not primary scan targets.

## Executive disposition

Testnet deployment is blocked on the two deployment-attestation denial-of-service findings below. Both let normal permissionless protocol activity invalidate the validation-tier evidence flow.

The accounting review did not identify an insolvency path or an unprivileged withdrawal from protected creator, reward, referral, or protocol balances. Several initially severe-looking reward findings were confirmed as deliberate consequences of permanent gross-contribution shares and are recorded as accepted economics rather than vulnerabilities.

| ID | Priority | Disposition |
| --- | --- | --- |
| F-01 | P1 | Remediate before testnet |
| F-02 | P1 | Remediate before testnet |
| F-03 | P2 | Harden the supported deployment workflow |
| F-04 | P3 | Remediate before pilot integration testing |
| F-05 | P3 | Operational mitigation: pause, preview, bounded refund |
| A-01 | Accepted | Permanent-share dilution is disclosed protocol economics |
| A-02 | Accepted | Refunds preserve historical shares and allocations by design |
| I-01 | Informational | Reward-index scale boundary is economically unreachable |

## Actionable findings

### F-01 — Permissionless registry growth races validation-tier capture

Confidence: 100

Affected function: `CheckDeployment.capture`

Converging agents: 3

`capture` derives the validation tier's registry index from `tierCount() - 1`. Because `MembershipFactory.createTier` is permissionless, any creator can append another tier after the validation tier is created. Capture then reads the later tier and rejects the genuine validation tier.

Example:

1. Validation tier `V` is registered at index 0.
2. Another creator registers tier `A` at index 1.
3. Capture observes `tierCount() == 2` and records index 1 for `V`.
4. The checker reads `A` at index 1 and reverts.

This can be repeated against every retry. Capture must bind the validation tier to its actual creation index rather than the mutable registry tail.

Recommended remediation: locate the supplied validation tier in the append-only registry or pass and verify its creation index from trusted transaction evidence.

### F-02 — Public validation-tier activity permanently poisons pristine-state verification

Confidence: 100

Affected functions: `DeployProtocol.deployValidationTier`, `CheckDeployment._check`

Converging agents: 3

The deployment script creates an ordinary unpaused one-USDG tier. `purchase` and `gift` are permissionless, but the checker requires the validation tier to retain zero mints, occupancy, proceeds, shares, rewards, and referral liabilities.

One purchase permanently increments `totalMinted`. Refund and synchronization do not erase historical identity or shares, so the tier can never satisfy the pristine-state check again.

Recommended remediation: attest immutable configuration, code, factory registration, ownership, and contract bindings. Do not require publicly mutable accounting state to remain pristine.

### F-03 — The Solidity checker alone does not authenticate deployment provenance

Confidence: 75

Affected functions: `CheckDeployment.run`, `capture`, `check`, `_check`, `_checkHashes`, `_checkTransactionInputHashes`, `_checkVerificationUrl`

Converging agents: 4

The Solidity checker accepts caller-supplied block and transaction identifiers and compares several runtime hashes with values captured from the same addresses. Explorer verification checks URL shape rather than verified-source status.

The repository's shell verification workflow independently fetches blocks, transactions, receipts, calldata, and creation history, which closes the demonstrated path when that wrapper is used correctly. The risk is misuse of the Solidity component as a complete provenance verifier.

Recommended remediation: make the wrapper the sole supported release entry point and make standalone checker output explicitly state-only, or move independent RPC evidence verification into the checker workflow.

### F-04 — `isRenewable` can report true when standard renewal must revert

Confidence: 75

Affected function: `MembershipTier.isRenewable`

Converging agents: 2

A gifted or creator-granted credential on a priced tier may have referral status `Unset`. `isRenewable` checks time, capacity, pause, and timestamp limits and returns true, while `renewSubscription` rejects the same unchanged state with `ReferralChoiceRequired`.

No funds are lost because renewal reverts atomically. The mismatch breaks generic subscription automation and creates unnecessary failed transactions.

Recommended remediation: return false for a priced tier while referral status is `Unset`. The member can use the custom purchase flow once to select a referrer or explicit no-referrer state.

### F-05 — Unbounded ERC-5643 cancellation can use a stale refund preview

Confidence: 75 after chain and workflow adjudication

Affected function: `MembershipTier.cancelSubscription`

Converging agents: 2

The ERC-5643-shaped adapter is creator-only and calls the internal refund with maximum possible gross-refund and owner-top-up ceilings. If additional paid time lands before cancellation, the later execution refunds the larger current amount. The creator recovers the newly credited creator-proceeds portion, but must fund the protocol, reward, and referral portions because those allocations are never clawed back.

Robinhood Chain uses first-come, first-served sequencing rather than priority-gas ordering, which substantially weakens the original front-running framing. The remaining issue is an avoidable stale-state authorization.

Operational remediation:

1. Pause the tier and wait for confirmation.
2. Preview the refund.
3. Execute `refund(tokenId, maxGrossRefund, maxOwnerTopUp)` using the previewed limits.
4. Unpause afterward when appropriate.

The application should use the bounded custom refund flow. Whether the contract should continue advertising ERC-5643 while cancellation remains creator-controlled is a separate interface-compatibility decision.

## Accepted protocol economics

### A-01 — Permanent shares permit creator-controlled and Sybil dilution

Positive gross payments permanently mint shares equal to gross. A creator can contribute through controlled wallets, recover creator proceeds and self-funded reward/referral allocations, and acquire permanent reward weight for approximately the protocol-fee cost.

This does not let the creator extract more from a fixed supporter payment than choosing a lower reward percentage would. It affects the credibility and concentration of an advertised reward allocation, not solvency or access control.

The protocol intentionally requires:

- permanent gross-contribution shares;
- shares that survive expiration, synchronization, refunds, and ownership changes; and
- full gross refunds of unused purchased time funded by creator proceeds plus exact creator top-up.

Permanent non-recyclable backing is incompatible with retaining both permanent shares and full gross refunds. If backing unlocks on refund, shares must be burned or slashed; if shares remain permanent, the backing cannot be included in a full refund.

Disposition: preserve permanent shares and disclose dilution, reward concentration, and the inability to prove economic independence between wallets. Do not add address-based creator exclusions; they are trivially bypassed.

### A-02 — Refunds preserve shares, referral identity, and prior allocations

Refunds clear remaining paid and grant time but intentionally preserve the credential, reward shares, referral state, and protected allocations. This follows the permanent historical-incentive model and is not treated as a defect.

## Informational observations

### I-01 — Reward index scale boundary

The `1e27` reward scale can produce a zero index increment for a one-base-unit reward after total shares exceed `1e27` base units. With six-decimal USDG this represents `1e21` USDG of cumulative tier payments, and larger ordinary rewards require proportionally larger totals.

Disposition: economically unreachable for the canonical payment token and not actionable for deployment.

### I-02 — Mainnet USDG implementation pinning

The deployment guard pins testnet proxy code, implementation code, implementation address, and pause state. The mainnet branch currently validates only canonical address and basic metadata. This is outside the current testnet gate and must be revisited when authoritative mainnet USDG implementation evidence is available.

## Remediation order

1. Bind capture to the actual validation-tier index.
2. Remove mutable pristine-accounting requirements from deployment attestation.
3. Add the missing referral-state condition to `isRenewable`.
4. Make pause-preview-bounded-refund the documented and application-supported creator flow.
5. Clarify that the Solidity checker is state verification inside a larger provenance-checking wrapper.
6. Re-run focused deployment, standards, refund, full unit, invariant, formatting, and build checks.

## Limitations

This review was performed by AI agents against local source and tests. It does not prove the absence of vulnerabilities and is not a substitute for independent human review, public testing, a bug bounty, or production monitoring.
