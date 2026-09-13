# Entry Point Map

> Backed By Fans | 60 state-changing ABI functions | 22 permissionless | 16 caller-gated | 21 admin-only | 1 initializer

---

## Protocol Flow Paths

### Protocol Setup (Factory Owner)

`MembershipFactory.constructor()` -> `ProtocolBuybackVault.constructor()` -> `ProtocolBurnRouter.constructor()`

`[factory setup]` -> `MembershipFactory.bindProtocolToken()` -> `ProtocolBuybackVault.bindProtocolToken()` -> `PonsBuybackExecutor.constructor()`

`[token binding]` -> vault route/limit setters -> `ProtocolBuybackVault.setBuybacksPaused(false)`

### Creator Flow

`OnchainMediaStoreFactory.store()` -> optional `RendererRegistry.register()` -> `MembershipFactory.createTier()` -> clone `MembershipTier.initialize()`

`[tier creation]` -> owner presentation/cap/grant actions -> `withdrawCreatorProceeds()`

### Supporter Flow

`[tier creation]` -> payment-token approval -> `createMembership()` or `createContributionMembership()`

`[live membership]` -> renew/gift/transfer -> reward/referral claims

`[live membership]` -> time passes -> `processAccounting()` / `processExpirations()` -> retired reward claim

### Buyback Flow

`[earned protocol allocation]` -> `MembershipTier.releaseProtocolFees()` -> `ProtocolBuybackVault.recordEarnedFees()`

`[configured unpaused vault]` -> `ProtocolBurnRouter.advance()` -> `ProtocolBuybackVault.process()` -> `PonsBuybackExecutor.execute()` -> protocol-token burn

## Permissionless

The following calls have no protocol role restriction. Some act on the caller's own claim or payment state and still validate token ownership or supplied state.

| Contract | Function | Caller / parameters | State and value flow |
|---|---|---|---|
| MembershipFactory | `claimEverything(requests,maxAccountingSteps)` | beneficiary; ordered registered tiers | Settles and pays caller across tiers |
| MembershipFactory | `createTier(config)` | creator must equal caller | Deploys and registers deterministic clone |
| MembershipTier | `processAccounting(maxSteps)` | keeper/anyone | Advances bounded vesting cursor |
| MembershipTier | `processExpirations(maxSteps)` | keeper/anyone | Retires bounded expired positions |
| MembershipTier | `createMembership(periods,referrer,maxSteps)` | payer | Pulls exact fixed payment; mints membership |
| MembershipTier | `giftMembership(recipient,periods,maxSteps)` | payer | Pulls exact payment; mints to recipient |
| MembershipTier | `giftRenewal(tokenId,owner,periods,status,referrer,maxSteps)` | payer | Pulls payment; extends bound position |
| MembershipTier | `createContributionMembership(gross,referrer,maxSteps)` | payer | Pulls optional contribution; mints one period |
| MembershipTier | `releaseProtocolFees()` | keeper/anyone | Transfers earned fees to vault and records them |
| MembershipTier | `claimRetiredRewards()` | beneficiary | Pays caller's retired member credit |
| MembershipTier | `claimReferral()` | referrer | Pays caller's referral credit |
| MembershipTier | `claimRewards(tokenIds,maxSteps)` | beneficiary | Settles selected owned claims and pays caller |
| ProtocolBurnRouter | `advance(tiers,purchases,deadline)` | keeper/anyone | Advances tiers, releases fees, executes ready buys |
| ProtocolBurnRouter | `advanceAccounting(tiers)` | keeper/anyone | Advances registered tier accounting |
| ProtocolBurnRouter | `buyback(purchases,deadline)` | keeper/anyone | Processes ready vault inventory and measures burn |
| ProtocolBuybackVault | `process(asset,bucket,amount,revision,deadline)` | keeper/anyone | Settles configured inventory and burns output |
| ProtocolBuybackVault | `syncDonation(asset)` | anyone | Accounts only unaccounted backing as donation |
| RendererPreviewHarness | `preview(creationCode,callData)` | RPC caller | Temporary CREATE and exact call; no retained state in eth_call |
| RendererRegistry | `deployAndRegister(initCode)` | renderer creator | Deploys, validates, and registers renderer |
| RendererRegistry | `register(renderer)` | wallet | Adds validated renderer to caller's saved list |
| RendererRegistry | `unregister(renderer)` | wallet | Removes caller-scoped registration |
| OnchainMediaStoreFactory | `store(payload,mime)` | media creator | Deploys or returns deterministic immutable store |

## Caller-Gated

| Gate | Contract | Function(s) | Effective restriction |
|---|---|---|---|
| Pending Safe | MembershipFactory | `acceptOwnership()` | Caller must be pending owner and pass Safe runtime/config validation |
| Pending owner | MembershipTier | `acceptOwnership()` | Inherited pending-owner restriction |
| ERC-721 authorization | MembershipTier | `approve`, `setApprovalForAll`, `transferFrom`, both `safeTransferFrom` overloads | Token owner or approved operator; transfers require a live membership |
| Membership owner | MembershipTier | `renewSubscription`, `renewMembership`, `renewContributionMembership`, `cancelSubscription`, `claimReward` | Bound token owner/authorization checks |
| Factory | MembershipTier | `claimRewardsFor()` | `msg.sender == factory` |
| Factory | ProtocolBuybackVault | `bindProtocolToken()` | `msg.sender == factory`; one-time binding |
| Registered tier | ProtocolBuybackVault | `recordEarnedFees()` | Factory registration check; exact backing required |
| Vault | PonsBuybackExecutor | `execute()` | `msg.sender == immutable vault` |

## Admin-Only

| Contract | Function | State Modified |
|---|---|---|
| MembershipFactory | `bindProtocolToken(token)` | Delegates one-time vault token/executor binding |
| MembershipFactory | `setPaymentTokenEnabled(token,enabled)` | Listed/enabled token registry |
| MembershipFactory | `setMinimumPayment(token,minimum)` | Per-token future-tier floor |
| MembershipFactory | `transferOwnership(newOwner)` | Pending Safe owner |
| MembershipTier | `setPresentation(renderer,art,media)` | Renderer and art/media config |
| MembershipTier | `withdrawCreatorProceeds()` | Creator liability and ERC-20 balance |
| MembershipTier | `refund(tokenId,owner,maxGross,maxSteps)` | Cancels unearned funding and retires token |
| MembershipTier | `grantMembership(recipient,periods,maxSteps)` | Grant time and optional new token |
| MembershipTier | `addGrantTime(tokenId,owner,periods,maxSteps)` | Grant time |
| MembershipTier | `revokeGrantTime(tokenId,owner,maxSteps)` | Grant time and optional retirement |
| MembershipTier | `setPaused(paused)` | Tier purchase pause |
| MembershipTier | `setSupplyCap(cap)` | Occupied-position cap |
| MembershipTier | `setMaxPrepaidPeriods(maximum)` | Paid-time bound |
| MembershipTier | `setTierMetadata(metadata)` | Description and external URI |
| MembershipTier | `transferOwnership(newOwner)` | Pending creator owner |
| ProtocolBuybackVault | `setRoute(asset,route)` | Validated route and revision |
| ProtocolBuybackVault | `setLimits(asset,limits)` | Asset limits and revision |
| ProtocolBuybackVault | `setExecutionLimits(interval,assets,limits)` | Batch limits and global interval |
| ProtocolBuybackVault | `setGlobalMinInterval(interval)` | Global cooldown |
| ProtocolBuybackVault | `setBuybacksPaused(paused)` | Global pause |
| ProtocolBuybackVault | `setAssetBuybacksPaused(asset,paused)` | Asset pause |

## Initialization

`MembershipTier.initialize(config)` is a one-time clone initializer. The shared implementation disables initializers in its constructor; `MembershipFactory.createTier()` clones and initializes atomically.
