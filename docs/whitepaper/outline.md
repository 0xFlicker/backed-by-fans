# Backed By Fans — whitepaper outline

Status: working outline for review, not publication copy or a deployment attestation.
Source baseline: `cf2ad73e0ba009de84a435dfb0bef0f50722e1e9`.

## Editorial scope

Membership-first. Explain a prepaid subscription that fans renew manually: creators set the terms, fans fund membership time, and payments accrue to participants as that time is consumed. No automatic billing is implied.

Fans receive a soulbound membership NFT and, when enabled by the creator, member rewards. Creators supply any access, content, or community benefits. The protocol supplies membership records, accounting, and interfaces that other applications can use.

Use “protocol token” until it has a name. Its supporting role is fee-funded buyback/burn and intended availability as a membership payment currency. Exclude speculative tier-creation burns, creator/fan token incentives, and other undecided utility. Do not imply that ordinary membership rewards are paid in the protocol token.

Target: 8–12 pages of main text, with a technical appendix. Markdown is the source; PDF layout and static diagrams follow content approval.

## 1. Membership as ongoing support

**Reader takeaway:** a membership sustains a relationship over time rather than ending with a purchase.

- Introduce creators, fans, and tiers without opening with token economics.
- A creator may publish multiple tiers with separate terms.
- A payment buys time; renewal adds time through an explicit transaction.
- Benefits can include Discord, websites, communities, or recognition of support. These are creator-defined examples, not protocol-provided entitlements.
- Describe the NFT as non-transferable proof of membership/support, subject to the expiry and synchronization behavior below. Do not promise a permanent NFT in the wallet.

Sources: [S1] `purchase`, `contribute`, `renewSubscription`, `locked`, `_update`; [S2] `createTier`.

## 2. What a tier promises—and what its creator can change

**Reader takeaway:** distinguish immutable economic terms from ongoing creator authority.

| Fixed at creation | Meaning for a fan |
| --- | --- |
| Tier name and symbol | No creator setter changes these labels. |
| Payment token | Each tier uses one currency; it cannot later switch to another. |
| Price per period and period duration | Fixed-price renewals use the same base terms. A zero price selects the contribution model. |
| Minimum positive payment | The factory minimum is snapshotted into the tier; later factory changes do not rewrite it. |
| Member-reward, referral, and protocol percentages | Future payments follow the same allocation rules. |
| Starting reward-weight boost and early-support horizon | The reward-weight curve cannot be changed after creation. |
| Tier identity and factory/vault connections | The deployed tier has fixed protocol identity and accounting destinations. |

| Creator can change or do later | Boundary to explain |
| --- | --- |
| Description and external URL | Copy and linked benefits can change. |
| Renderer, art settings, and media | Presentation can change for existing NFTs as well as new ones, subject to validation. |
| Pause/unpause | Blocks new time purchases/contributions and grants; it does not stop elapsed time or reverse accrued value. |
| Supply cap | Cannot set a nonzero cap below occupied supply; zero is uncapped. Expiry and freeing an occupied slot are separate. |
| Maximum prepaid periods | Changes the limit on subsequent time additions; does not erase existing paid time. |
| Grant or revoke grant time | Complimentary time has no payment backing. Revocation does not remove paid seconds. |
| Refund | Creator-authorized refund cancels remaining funded time and clears grant time; fans do not have an unconditional self-service refund right. |
| Synchronize expired memberships | Burns expired NFTs, frees occupied slots, and suspends their reward eligibility. |
| Transfer tier ownership | Two-step transfer changes the creator authority; it does not rewrite immutable terms. |
| Withdraw earned creator proceeds | Only earned proceeds are available; unearned funding and other protected liabilities are distinct. |

Protocol fee is **at least 1%, not universally exactly 1%**: creation validates `protocolFeeBps >= 100` and the three explicit cuts must total no more than 100%. Creator proceeds receive the remainder. Member and referral rates may be zero.

Sources: [S1] immutable declarations, constructor, creator setters, `refund`, `synchronizeExpiredMemberships`, `transferOwnership`; [S2] `createTier`; [S3] `TierConfig`.

## 3. The membership lifecycle

**Reader takeaway:** NFT existence, active access, and reward eligibility are related but different states.

1. **Create:** publish a tier and its fixed terms.
2. **Join:** a successful payment adds time and mints a wallet-bound NFT. A wallet has one persistent token identity per tier.
3. **Accrue:** all four allocations are earned over the funded interval. Accounting transactions settle elapsed time.
4. **Renew:** add prepaid time. New funding follows existing paid time rather than being earned immediately. Paid seconds are consumed before grant seconds.
5. **Expire:** active access ends when time runs out. Holding the NFT alone must not be used as proof of active access.
6. **Synchronize:** the creator can burn the expired NFT and suspend reward weight. Natural expiry alone does not suspend that weight.
7. **Return:** qualifying time additions can remint the same token ID to the same wallet. A positive payment activates reward weight; a zero contribution or complimentary grant does not restore suspended reward eligibility.

Include a small sidebar on gifts and contributions:

- Fixed-price gifts buy time for the recipient and credit that membership's shares.
- Contribution-mode tiers add one period per contribution, including zero-value contributions. Positive contributions must meet the minimum and fund accrual; zero contributions create no paid allocation or new shares.
- Grant time is complimentary access, with no payment allocation or new shares.

**Figure 1:** lifecycle diagram with separate rows for access, NFT existence, and reward eligibility. Show the creator synchronization transaction explicitly between “expired” and “burned/suspended.”

Sources: [S1] `_purchaseFixed`, `_contribute`, `_applyPayment`, `_prepareTimeIncrease`, `_timeBalancesAt`, `grantTime`, `synchronizeExpiredMemberships`; [S4] `issueShares`, `_setWeight`.

## 4. Where a payment goes

**Reader takeaway:** allocation at payment is different from earning and claiming.

- The payment is allocated to creator proceeds, the member pool, an attributed referrer, and protocol fees.
- All four allocations begin unearned and accrue over the payment's funded interval.
- The creator receives the unused referral allocation when no referrer is recorded, plus split rounding remainder.
- Member rewards and referral rewards are denominated in the tier's payment token.
- Earning is not an automatic token transfer every second. Claims and fee release require transactions; bounded accounting may need to catch up first.
- Distinguish allocated, unearned, earned, and claimed balances consistently throughout the paper.

**Figure 2:** static payment-flow diagram: creator configures tier; fan funds tier; tier branches into creator, members, referrer, and protocol; earned protocol fees lead to a separately executed buyback/burn. Use time annotations along the branches, not arrows implying instant payouts.

### Worked example: one 100-unit payment for 30 days

Illustrative fixed-price tier: 70% creator, 20% members, 5% referral, 5% protocol. A valid referrer is recorded. These percentages are an example, not defaults. Assume no existing paid time, refund, or other change to the funding interval.

| Elapsed funded time | Creator earned | Member pool earned | Referrer earned | Protocol earned | Still unearned |
| --- | ---: | ---: | ---: | ---: | ---: |
| At payment | 0 | 0 | 0 | 0 | 100 |
| 15 days | 35 | 10 | 2.5 | 2.5 | 50 |
| 30 days | 70 | 20 | 5 | 5 | 0 |

The member column is a pool total, not one fan's reward. Individual rewards depend on eligible weight during each accrual interval. Display values are idealized; contract base-unit rounding and fractional reserves belong in the appendix.

With no recorded referrer, the example becomes 75/20/0/5. A creator-authorized refund halfway through would return the unused funded amount, subject to integer rounding, and cancel future accrual from that payment. Already earned allocations are not clawed back.

Sources: [S1] `_applyPayment`, `_refund`, claims, `releaseProtocolFees`; [S4] `append`, `_integrate`, `_distribute`, `cancelFunding`.

## 5. Optional member rewards and referrals

**Reader takeaway:** rewards arise from funded membership activity, with explicit eligibility rules—not token ownership or promised returns.

- Member rewards are optional per tier. When enabled, positive membership payments create permanent accounting shares using the tier's immutable reward-weight curve.
- “Shares” are accounting weight, not transferable tokens or ownership of the creator's business.
- Early payments can receive more weight per unit. The boost tapers toward normal weight according to cumulative gross paid into that tier. A large payment crossing the curve receives integrated weight, not the initial boost on its entire amount.
- Renewal and gift payments can contribute to the pool, as can a fan's own payment. Avoid saying rewards come exclusively from “future fans.”
- New weight does not receive rewards already earned before its issuance. It can participate in subsequent accrual from funding already underway, as well as its own new funding.
- Refunds do not erase historical shares or rewind the early-support curve. They suspend eligibility immediately. Creator synchronization also suspends expired memberships; natural expiry alone does not.
- Accrued credit remains claimable by the associated wallet after synchronization burns the NFT. Suspended intervals are not backfilled.
- A referrer is locked on the membership's first qualifying self-payment, including the choice of no referrer. Gifts do not choose a new referrer; an existing lock applies. Explain this once in plain language, with the attribution states in the appendix.
- No eligible weight: member allocations remain protected as unassigned amounts rather than becoming creator proceeds. Do not advertise a future redistribution mechanism that does not exist.

**Figure 3:** optional two-fan timeline separating share issuance from later accrual. Use equal weights first; introduce the early-support curve only afterward.

Sources: [S1] `_lockReferralChoice`, `_validateReferralChoice`, `_applyPayment`, `claimReward`, `_deactivateRewardEligibility`; [S4] `issueShares`, `_setWeight`, `_distribute`; [S5] `validate`, `quote`, `cumulative`.

## 6. A supporting protocol token

**Reader takeaway:** membership is useful independently; token participation is optional.

- Describe the mechanism as connecting community membership activity to the protocol token through earned-fee-funded buybacks and burns. Avoid implying a guaranteed market-price outcome.
- Separate fee accrual, fee release to the vault, market execution, and burning. Execution is not automatic at each payment or each second.
- Token binding, available inventory, configured routes/limits, pauses, and market conditions determine whether execution is possible.
- Intended use as a tier payment currency requires payment-token enablement and a configured minimum. Binding the protocol token does not itself enable it for tier creation.
- Creators who want that currency would create tiers denominated in it. Existing tiers cannot switch currency.
- Earned fees already denominated in the protocol token can be burned directly rather than buying that same token first.

Sources: [S2] `bindProtocolToken`, `setPaymentTokenEnabled`, `setMinimumPayment`; [S6] `_bindProtocolToken`, `_processingStatus`, `process`, `_burn`, `recordEarnedFees`; [S7] `advance`, `buyback`.

## 7. Trust boundaries and integrations

**Reader takeaway:** know what the contracts enforce and who controls the rest.

- Creators control mutable benefits, metadata/art, refunds, expiry synchronization, and tier ownership as listed above.
- Protocol authority controls token admission/minima for new tiers, one-time protocol-token binding, and buyback configuration/pauses. Do not equate creator-owned memberships with the absence of administrative powers.
- Integrations should read active membership status for access; NFT ownership alone is insufficient. Historical support and current access are different uses.
- A soulbound credential does not migrate to another wallet through an NFT transfer. Avoid promising wallet recovery that is not implemented.
- Contract bugs, payment-token restrictions, chain/RPC availability, external applications, and buyback liquidity/execution are dependencies to explain plainly.
- Accounting may be stale until processed; a projected amount and a settled withdrawable amount should be distinguished.
- Reward weight does not promise a particular reward amount. Creator benefits are not enforced merely because membership ownership is onchain.

Sources: [S1] access views, soulbound methods, owner methods, `processAccounting`; [S2] owner methods; [S6] authority modifier and setters; [S7] execution entrypoints.

## Technical appendix plan

- Gross allocation formulas, rounding, and protected liabilities.
- Cumulative reward-weight formula and a crossing-the-horizon example.
- Distinct access/NFT/eligibility state table, including refunds, gifts, grants, zero contributions, and rejoining.
- Referral states and locking behavior.
- Accounting catch-up and refund projections; distinguish preview completeness from current-chain state.
- Contract map, source revision, deployed addresses/network, and verification evidence as of publication.
- Glossary: tier, period, paid time, grant time, allocation, accrual, share, eligibility, synchronization, claim, buyback, burn.

## Findings to resolve in the prose

These do not require new protocol design; they require accurate wording:

1. **Memento qualification:** the permanent membership record survives, but the NFT can be burned by creator synchronization after expiry. Our earlier “remains in the wallet” wording was too strong.
2. **Subscription qualification:** renewal is manual, and access expiry is immediate in time-based views. Reward suspension is a separate action; do not say rewards automatically stop at expiry.
3. **Reward source qualification:** “future fans” is an intuitive introduction, but payments from existing fans and the recipient's own funding also participate.
4. **Fee qualification:** 1% is a minimum in current creation validation, not the only allowed protocol rate.
5. **Documentation drift:** `docs/protocol/accounting.md` describes superseded immediate allocation, fixed fees, and owner-top-up refunds. It must not be used as the whitepaper's accounting authority. This outline follows current contracts instead; updating that older document is separate work.

## Source map

References name the functions to inspect alongside each section, so line-number changes do not obscure the evidence.

- [S1 — MembershipTier](../../contracts/src/MembershipTier.sol)
- [S2 — MembershipFactory](../../contracts/src/MembershipFactory.sol)
- [S3 — MembershipTypes](../../contracts/src/types/MembershipTypes.sol)
- [S4 — VestingLedger](../../contracts/src/libraries/VestingLedger.sol)
- [S5 — RewardCurve](../../contracts/src/libraries/RewardCurve.sol)
- [S6 — ProtocolBuybackVault](../../contracts/src/ProtocolBuybackVault.sol)
- [S7 — ProtocolBurnRouter](../../contracts/src/ProtocolBurnRouter.sol)
