# Backed By Fans

## Creator-owned memberships

*First draft · September 2026*

![Overlapping membership forms in charcoal, coral, violet, and lime on warm paper.](assets/cover.png)

Backed By Fans lets creators offer memberships on their own terms. Fans pay for membership time and receive a soulbound NFT: a membership token that stays with their wallet and cannot be transferred or sold. Creators decide what belonging means, from access to a private community to recognition of support for their work.

A membership is a prepaid subscription that fans renew manually. Each payment adds time. As that time is used, the payment is earned by the creator and, where enabled, shared with members and a referrer. A portion goes to the protocol, exclusively to buy and burn the protocol token.

This connects payment to an ongoing membership. Paying for several months does not make the entire payment immediately available to the creator or reward recipients. It funds the months ahead, with value earned throughout that period.

## Membership on the creator’s terms

A creator can offer one membership or several tiers. Each tier has its own price, payment currency, period length, and reward terms. A musician might offer a supporters’ community, a writer might provide access to a private website, and an artist might use membership simply to recognize the people supporting their practice.

The membership NFT gives creators a common way to recognize fans across these experiences. A Discord server, website, or other application can check whether a wallet has an active membership. Creators can build these experiences themselves or use services that support the membership contracts.

The benefits come from the creator. The protocol records membership and handles payments and rewards; it does not deliver content, operate a community, or guarantee the benefits described by a creator.

### Terms that stay fixed

When a creator publishes a tier, its core terms become permanent:

- The tier’s name and symbol.
- Its payment currency, price per period, and period length.
- Its minimum positive payment.
- The percentages allocated to member rewards, referrals, and the protocol.
- The rules determining how much reward weight each payment creates.

Fans can review these terms before joining. A creator cannot later raise the price of that same tier, change its currency, or reduce its member-reward percentage. Different economic terms require a new tier.

The protocol allocation must be at least 1% of each payment. The creator chooses the tier’s allocation within the contract’s limits. Member and referral rewards are optional; either percentage can be zero. The creator receives what remains after the applicable allocations.

### What can evolve

Creators can update a tier’s description, website, and NFT artwork. These updates can affect existing memberships as well as new ones. Artwork can use the built-in styles or a custom onchain design.

Creators can also change membership capacity and the amount of time fans may prepay. A capacity reduction cannot go below the number of occupied places, and a new prepayment limit does not remove time already purchased.

A creator may pause new membership time additions, give complimentary time, revoke unused complimentary time, or refund unused paid time. Pausing does not stop the membership clock or undo earnings. Revoking complimentary time does not remove time a fan paid for.

Tier ownership can be transferred to a new owner. The new owner takes over these responsibilities and controls while the tier’s permanent terms remain in place.

## Joining, renewing, and returning

When a fan joins, their wallet receives the tier’s soulbound NFT. Buying more time extends that membership rather than creating another NFT for the same wallet and tier.

Fans choose when to renew. There are no automatic recurring charges. If they renew before their paid time runs out, the new payment funds the additional paid period. If they return after expiry, their new membership time begins when they rejoin.

A tier can also accept contributions instead of setting a fixed price. In that model, each contribution adds one membership period. A fan can contribute zero or choose a positive amount that meets the tier’s minimum. A zero contribution adds time but funds no rewards or creator earnings.

Fixed-price memberships can be gifted to another wallet. The recipient receives the membership time and the reward weight associated with the payment. Creators can separately grant complimentary time, which adds access without creating new reward weight or funded earnings. Paid time is used before complimentary time.

### Access and the NFT

A fan’s access expires when their membership time runs out. The NFT can still be present in the wallet afterward, so an application granting access must check that the membership is active rather than checking only for the NFT.

Creators can remove expired memberships from the tier’s occupied places. This action, called synchronization, burns the expired NFT and suspends its participation in new member rewards. Expiry alone does not burn the NFT or suspend reward eligibility.

The membership’s history remains associated with its wallet. If the fan returns, the same NFT identity can be issued again, subject to the tier’s capacity and other terms. A positive membership payment restores suspended reward weight. Complimentary time or a zero contribution can restore access without restoring that weight.

The NFT can serve as a record of support, but it is not guaranteed to remain in the wallet forever. It is also not transferable to another wallet, including when the fan wants to change wallets.

![Membership timeline showing access ending at expiry, followed by creator synchronization that burns the NFT and suspends reward eligibility. A positive payment on return restores all three.](assets/membership-timeline.svg)

*Figure 1. Access, NFT ownership, and reward eligibility follow different rules.*

## How payments become earnings

Each payment has four possible destinations:

| Recipient | What the allocation supports |
| --- | --- |
| Creator | Earnings from the membership |
| Members | Optional rewards shared among eligible memberships |
| Referrer | Optional rewards for the membership’s recorded referrer |
| Protocol | Fees available for protocol-token buybacks and burns |

The amounts are allocated when the payment is made. They are earned as its membership time is used.

This distinction matters when a fan prepays. A payment for an additional month is reserved for that month. It does not become immediately earned simply because the fan paid early. The same timing applies to creator earnings, member rewards, referral rewards, and protocol fees.

Once earned, creator proceeds and rewards can be claimed. Accrual describes how the amount grows over time; it does not mean tokens are transferred to every recipient’s wallet every second. Claims and protocol-fee release happen through transactions.

All four allocations use the tier’s payment currency. A membership priced in one currency does not automatically pay its member rewards in the protocol token.

### A payment over thirty days

Consider a tier charging 100 units of its payment currency for thirty days. Its terms allocate 70% to the creator, 20% to members, 5% to a referrer, and 5% to the protocol. These are illustrative percentages, not protocol defaults.

Assume the fan has no existing paid time and has a recorded referrer. With no refund or other change, the payment is earned as follows:

| Time used | Creator | Member rewards | Referrer | Protocol | Unearned |
| --- | ---: | ---: | ---: | ---: | ---: |
| At payment | 0 | 0 | 0 | 0 | 100 |
| Fifteen days | 35 | 10 | 2.5 | 2.5 | 50 |
| Thirty days | 70 | 20 | 5 | 5 | 0 |

The member-reward column is the amount shared by the pool, not an amount promised to any one fan. Each eligible membership receives a portion according to its reward weight during the time those rewards are earned.

If the membership has no recorded referrer, the referral portion goes to the creator. In this example, the allocation would become 75% creator, 20% members, and 5% protocol.

![Payment flow at day fifteen: a 100-unit payment has earned 35 units for the creator, 10 for the member pool, 2.5 for the referrer, and 2.5 for the protocol; 50 units remain unearned.](assets/payment-flow.svg)

*Figure 2. All four allocations accrue over paid time. Earned protocol fees are released for separate buyback and burn execution.*

### Refunds

A creator can refund unused paid time. The refund is funded by the payment’s remaining unearned allocations. Already earned creator proceeds, rewards, and protocol fees are not taken back.

In the thirty-day example, a refund after fifteen days would return approximately 50 units and cancel the rest of the funded period. The exact amount follows the payment currency’s smallest units and the contract’s rounding rules.

A refund clears the membership’s remaining paid and complimentary time and immediately suspends its eligibility for new member rewards. Rewards already earned remain claimable.

Refunds require the creator’s authorization. A fan can stop renewing, but cannot unilaterally demand an onchain refund for unused time.

## Sharing membership rewards

Creators can dedicate part of each payment to their members. This allows the community to participate in the membership activity it helps sustain.

Rewards can come from new fans joining, existing fans renewing, and gifts. A fan’s own payment can also contribute to rewards they receive. New reward weight participates in rewards earned after that weight is created, including later earnings from membership periods already underway. It does not receive a share of rewards earned before it existed.

### Reward weight

Positive payments add reward weight to the recipient’s membership. The contracts call this weight “shares.” These shares are not transferable tokens or ownership of the creator’s business. They determine how the member-reward pool is divided.

For example, if two eligible memberships have equal weight throughout an interval, they split the rewards earned during that interval equally. If one has twice the weight of the other, it receives two-thirds and the other receives one-third. New payments and changes in eligibility can change those proportions for later earnings.

Creators can choose to give early support additional weight. Early payments receive more reward weight per unit paid. This bonus decreases as total payments into the tier grow. Weight already earned remains unchanged. The starting bonus and payment threshold are fixed when the tier is created.

The benefit follows the amount paid into the tier, not a calendar deadline or a fixed number of people. A payment that spans different points on the curve receives the corresponding weight across those points. Renewals can add weight, and the amount a fan receives depends on where the tier is on its curve when the payment succeeds.

![Illustrative early-support curve declining from 1.5 times to normal weight after 1,000 units paid. New payments receive less bonus as the tier grows; existing weight stays unchanged.](assets/reward-weight.svg)

*Figure 3. The bonus applies to new payments. This example uses a 1.5× starting boost and a 1,000-unit threshold; creators choose their tier’s terms.*

### Keeping and suspending weight

Refunds do not erase a membership’s accumulated weight or move the tier backward on its early-support curve. Weight must, however, be eligible to participate in new rewards.

A refund suspends eligibility immediately. A creator can also suspend an expired membership through synchronization. Until that action occurs, an expired membership may continue receiving rewards even though it no longer grants active access.

Suspension does not remove rewards already earned. The associated wallet can claim them even after the NFT has been burned. When a positive payment restores eligibility, the membership resumes participating from that point; it does not receive rewards for the interval when it was suspended.

If rewards accrue while no membership has eligible weight, those amounts remain reserved. They do not become additional creator earnings.

Member rewards depend on actual payments, the tier’s chosen percentage, and the eligible weight sharing the pool. No particular reward amount is guaranteed.

## Referral rewards

A creator can also dedicate a portion of membership payments to referrals.

A membership records its referral choice when the member first makes a qualifying positive payment for themselves. That choice can be a referrer or no referrer, and it then remains fixed. Later payments follow the recorded choice.

A gift does not choose a new referrer for its recipient. If the recipient already has a recorded referrer, the gift follows that choice. If no referrer is recorded, the creator receives the unused referral portion.

Referral rewards follow the same time-based model as other earnings. A referrer earns their allocation while the referred membership’s funded time is used and can claim the earned amount in that tier’s payment currency.

## The protocol token

The protocol token has a supporting role in Backed By Fans. Memberships provide the reason to participate: supporting a creator, belonging to a community, and receiving the benefits that creator offers.

Earned protocol fees connect that membership activity to the token. Fees are used to buy the protocol token and burn the purchased amount, reducing its supply. Protocol fees accrue with membership time; buybacks and burns happen in separate transactions.

The protocol token will be made available as a membership payment currency. Creators can then publish tiers priced in that token, with creator earnings and member rewards paid in the same currency. Protocol fees received in the protocol token will be burned directly.

## Responsibilities and limits

The contracts enforce each tier’s fixed economic terms, membership time, reward rules, and payment accounting. Creators remain responsible for their membership benefits and for the controls they retain, including changes to descriptions and artwork, refunds, and the removal of expired memberships.

The protocol also has administrative controls. Its authority manages which payment currencies can be used for new tiers, their minimum positive payments, and buyback settings and pauses. Those controls do not give creators a way to rewrite the fixed economic terms of an existing tier.

Using the protocol also depends on the underlying blockchain and payment currencies. Transactions can require gas and take time to complete. Payment tokens may have restrictions imposed by their own issuers. Smart-contract bugs, unavailable services, and problems with third-party integrations can affect the experience. Buybacks additionally depend on market liquidity and execution conditions.

Balances earned over time may need to be brought up to date onchain before they can be claimed.

---

## Contract references

This draft describes the contracts at revision `cf2ad73e0ba009de84a435dfb0bef0f50722e1e9`. It does not establish the deployment or launch status of a particular network.

- [Membership terms, time, NFTs, and claims](../../contracts/src/MembershipTier.sol)
- [Tier creation and payment-currency configuration](../../contracts/src/MembershipFactory.sol)
- [Time-based earnings and reward accounting](../../contracts/src/libraries/VestingLedger.sol)
- [Early-support reward weight](../../contracts/src/libraries/RewardCurve.sol)
- [Protocol-fee processing and burning](../../contracts/src/ProtocolBuybackVault.sol)
- [Accounting, fee release, and buyback execution](../../contracts/src/ProtocolBurnRouter.sol)
