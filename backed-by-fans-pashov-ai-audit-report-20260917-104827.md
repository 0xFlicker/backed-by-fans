# 🔐 Security Review — backed-by-fans

---

## Scope

|                                  |                                                        |
| -------------------------------- | ------------------------------------------------------ |
| **Mode**                         | ALL / default                                          |
| **Files reviewed**               | `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2BondingCurve.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2BuybackVault.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2FeeEscrow.sol`<br>`contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2GraduationExecutor.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2GraduationGuard.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2LaunchDeployer.sol`<br>`contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2LaunchFactory.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2LaunchLocker.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/PonsV2LauncherToken.sol`<br>`contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/hooks/PonsV2MemeHook.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/libraries/PonsV2BondingCurveMath.sol` · `contracts/external/pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e/libraries/PonsV2GraduationMath.sol`<br>`contracts/external/uniswap/universal-router/contracts/libraries/Commands.sol` · `contracts/external/uniswap/v4-core/src/libraries/CustomRevert.sol` · `contracts/external/uniswap/v4-core/src/libraries/FixedPoint128.sol`<br>`contracts/external/uniswap/v4-core/src/libraries/FullMath.sol` · `contracts/external/uniswap/v4-core/src/libraries/LiquidityMath.sol` · `contracts/external/uniswap/v4-core/src/libraries/Position.sol`<br>`contracts/external/uniswap/v4-core/src/libraries/SafeCast.sol` · `contracts/external/uniswap/v4-core/src/libraries/StateLibrary.sol` · `contracts/external/uniswap/v4-core/src/types/BalanceDelta.sol`<br>`contracts/external/uniswap/v4-core/src/types/BeforeSwapDelta.sol` · `contracts/external/uniswap/v4-core/src/types/Currency.sol` · `contracts/external/uniswap/v4-core/src/types/PoolId.sol`<br>`contracts/external/uniswap/v4-core/src/types/PoolKey.sol` · `contracts/external/uniswap/v4-core/src/types/PoolOperation.sol` · `contracts/external/uniswap/v4-periphery/src/libraries/ActionConstants.sol`<br>`contracts/external/uniswap/v4-periphery/src/libraries/Actions.sol` · `contracts/external/uniswap/v4-periphery/src/libraries/PathKey.sol` · `contracts/script/CreateSafe.s.sol`<br>`contracts/script/DeployDirectProtocol.s.sol` · `contracts/script/DeployForkProtocol.s.sol` · `contracts/script/DeployForkProtocolNoToken.s.sol`<br>`contracts/script/DeployRendererRegistry.s.sol` · `contracts/script/LinkedVestingDeployment.sol` · `contracts/script/TierImplementationDeployment.sol`<br>`contracts/src/ImmutableCodeStore.sol` · `contracts/src/MembershipFactory.sol` · `contracts/src/MembershipTier.sol`<br>`contracts/src/OnchainMetadataRenderer.sol` · `contracts/src/PonsBuybackExecutor.sol` · `contracts/src/ProtocolBurnRouter.sol`<br>`contracts/src/ProtocolBuybackVault.sol` · `contracts/src/RendererPreviewHarness.sol` · `contracts/src/RendererRegistry.sol`<br>`contracts/src/RobinhoodProtocolAuthority.sol` · `contracts/src/RobinhoodProtocolConfig.sol` · `contracts/src/TierIdentity.sol`<br>`contracts/src/libraries/BuybackIntegration.sol` · `contracts/src/libraries/ExpirationSchedule.sol` · `contracts/src/libraries/ProtocolLaunchValidation.sol`<br>`contracts/src/libraries/ProtocolSafeValidation.sol` · `contracts/src/libraries/RewardCurve.sol` · `contracts/src/libraries/VestingLedger.sol`<br>`contracts/src/media/CodeStoreReader.sol` · `contracts/src/media/ImageValidation.sol` · `contracts/src/media/OnchainMediaStoreFactory.sol`<br>`contracts/src/renderer/RendererPrimitives.sol` · `contracts/src/renderer/TextValidation.sol` · `contracts/src/renderer/engines/AfterimageEngine.sol`<br>`contracts/src/renderer/engines/BloomEngine.sol` · `contracts/src/renderer/engines/ChorusEngine.sol` · `contracts/src/renderer/engines/LoomEngine.sol`<br>`contracts/src/renderer/engines/MarqueeEngine.sol` · `contracts/src/renderer/engines/StackEngine.sol` · `contracts/src/types/BuybackTypes.sol`<br>`contracts/src/types/MembershipTypes.sol` |
| **Confidence threshold (1-100)** | 80                                                     |

---

## Findings

[90] **1. Buyers can permanently self-refer and divert creator proceeds [agents: 2]**

`MembershipTier._lockReferralChoice` · Confidence: 90

**Description**
A first-time buyer may lock themselves as referrer, so with a 1,000,000 gross payment and 5,000 referral bps the buyer vests 500,000 that otherwise belongs to the creator remainder, and the choice persists for later payments.

**Fix (Option A — reject self-referral)**

```diff
- Accept referralChoice equal to the payer or recipient.
+ Reject referralChoice equal to the payer or recipient at lock time.
```

**Fix (Option B — account as no referral)**

```diff
- Lock self-referrals as LockedAddress.
+ Account self-referrals as LockedNone.
```

---

[75] **2. Permissionless last-fill buybacks revert before graduation [agents: 2]**

`PonsBuybackExecutor._buyCurve` · Confidence: 75

**Description**
The executor computes an absolute token floor from the full offered ETH, while the Pons curve clamps its final fill and refunds unused ETH; an offer of 10,000 at a 1/2 rate demands 5,000 tokens even when only 10 remain and cost 12, so `InexactSettlement` reverts before the vault's intended graduation short-fill exception.

---

[75] **3. Zero-budget ERC-5643 renewals stall behind any overdue checkpoint [agents: 2]**

`MembershipTier.renewSubscription` · Confidence: 75

**Description**
`renewSubscription` hardcodes `maxAccountingSteps=0`, so one unrelated funding end or expiration at or before `block.timestamp` makes `_catchUp(0)` return incomplete and reverts every IERC-5643 renewal until a separate caller processes accounting.

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [90] | Buyers can permanently self-refer and divert creator proceeds |
| 2 | [75] | Permissionless last-fill buybacks revert before graduation |
| 3 | [75] | Zero-budget ERC-5643 renewals stall behind any overdue checkpoint |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **Direct code-store reads trust a matching runtime rather than factory provenance [agents: 1]** — `CodeStoreReader.read` — Code smells: code length, STOP prefix, and code hash prove current bytes but not deployment origin; the registered-media path supplies the missing provenance, while a direct hand-built configuration still needs manual boundary review.
- **PNG admission validates only an envelope of the file [agents: 1]** — `ImageValidation._isValidPNG` — Code smells: CRC checks cover IHDR and IEND but not later IDAT, PLTE, or ancillary chunks; malformed display payloads may be stored, though no custody impact was traced.
- **Runtime payment-token admission accepts any contract with code [agents: 1]** — `MembershipFactory._validatePaymentToken` — Code smells: post-deploy listing omits stronger decimals/interface behavior checks; owner-listed hostile tokens can freeze asset-specific tiers, but no unprivileged listing path exists.
- **Renderer validation rethrows unbounded revert data [agents: 1]** — `MembershipFactory._validateRenderer` — Code smells: creator-selected renderer revert bytes are copied and rethrown without a size bound; the demonstrated harm is gas grief of the creator's own `createTier` call.
- **Renderer validation can reenter tier creation with a second salt [agents: 1]** — `MembershipFactory.createTier` — Code smells: untrusted `validateConfiguration` executes before cloning without the factory's transient guard; no theft was shown because same-salt reentry reverts atomically and distinct salts equal sequential authorized creations.
- **Enabled payment tokens can become undercollateralized after admission [agents: 1]** — `MembershipFactory.setPaymentTokenEnabled` — Code smells: exact transfer deltas do not protect nominal long-lived liabilities from a later negative rebase or blacklist; no actually enabled asset with such behavior was established.
- **Zero-gross contribution tiers permit unbounded timed-position creation [agents: 1]** — `MembershipTier._contribute` — Code smells: a zero payment still adds paid time and schedules expiration, and `supplyCap=0` is unlimited; the bounded permissionless maintenance design prevents a demonstrated permanent loss.
- **Expired positions retain occupancy until maintenance runs [agents: 1]** — `MembershipTier._retire` — Code smells: wall-clock-inactive tokens continue consuming `occupiedSupply` until permissionless accounting pops them, temporarily blocking capped mints.
- **ERC-5643 cancellation uses the same zero-step catch-up trap [agents: 1]** — `MembershipTier.cancelSubscription` — Code smells: the creator wrapper passes zero steps into `_refund`, so any overdue global checkpoint reverts cancellation even though budgeted `refund` succeeds.
- **Non-member claims can return stale settled amounts [agents: 2]** — `MembershipTier.claimReferral` — Code smells: referral, creator, protocol, and retired-credit withdrawals do not catch accounting up first; value remains claimable after separate processing, so loss was not shown.
- **Paid gifts are incompatible with the standard renew surface [agents: 1]** — `MembershipTier.giftMembership` — Code smells: gifts skip referral locking while `renewSubscription` requires a locked choice; the proprietary renew path can repair the state by selecting a referral.
- **Renewability view omits accounting completeness [agents: 2]** — `MembershipTier.isRenewable` — Code smells: the view can return true while `renewSubscription` reverts behind an overdue checkpoint; downstream reliance by an in-scope marketplace was not established.
- **Expiration-only naming advances full accounting [agents: 1]** — `MembershipTier.processExpirations` — Code smells: the entrypoint also processes funding lots and reward distribution; no keeper security invariant depending on expiration-only work was shown.
- **Refunds preserve previously harvested weight and the early-support cursor [agents: 1]** — `MembershipTier.refund` — Code smells: refunded prepaid principal does not rewind distributed rewards or `totalGross`; exploitation requires the trusted creator to authorize the refund.
- **Zero max-prepaid periods means unlimited, not disabled [agents: 1]** — `MembershipTier.setMaxPrepaidPeriods` — Code smells: the ceiling applies only when nonzero; product copy or operator expectations were not proven to interpret zero differently.
- **Post-admission media validation does not reparse the image [agents: 1]** — `OnchainMediaStoreFactory.validateOnchainMedia` — Code smells: integrity is rechecked by stored fields, code hash, and payload bytes but not `ImageValidation.isValid`; no mutable same-hash payload was demonstrated.
- **Production metadata rendering is weaker than preview validation [agents: 2]** — `OnchainMetadataRenderer.renderTokenURI` — Code smells: production uses code length/hash/prefix checks while preview also validates digest and image structure; no feasible fixed-codehash payload swap was proven.
- **Vendored path-key helper permits identical pool currencies [agents: 1]** — `PathKeyLibrary.getPoolAndSwapDirection` — Code smells: `currencyIn == intermediateCurrency` can form an invalid key; BBF constructs pool keys directly and does not use this helper.
- **Spot-only routing remains sandwich-sensitive when stored rates are loose [agents: 1]** — `PonsBuybackExecutor._routerSwap` — Code smells: `sqrtPriceLimitX96=0` and same-block slot validation leave price protection entirely to configured rates; no profitable concrete pool state was supplied.
- **Large quote arithmetic can overflow for compositionally accepted custom-pair launches [agents: 1]** — `PonsV2BondingCurveMath._amountOut` — Code smells: raw multiplication combines independently bounded input and reserves before division; this was not shown to affect the native-ETH BBF launch or cause another user's loss.
- **Sell-side launch-token receipts are nominal rather than measured [agents: 1]** — `PonsV2BondingCurve.sell` — Code smells: `tokensIn` is credited after `transferFrom` without a balance delta; the pinned standard Pons token transfers exactly, so the separate fee-on-transfer drain path is unreachable for BBF.
- **Native escrow credit is the unguarded twin of token credit [agents: 1]** — `PonsV2FeeEscrow.credit` — Code smells: an ETH claim callback may reenter only to make an additional deposit; claim reentry itself remains blocked and no double withdrawal was shown.
- **Graduation leaves ERC-20 and Permit2 allowances live [agents: 1]** — `PonsV2GraduationExecutor.mintFullRangePosition` — Code smells: partially consumed approvals survive while later graduations may deposit the same quote asset; no unprivileged position-manager pull path was proven.
- **A Q192 fit shortcut is wrong outside current seed ceilings [agents: 1]** — `PonsV2GraduationMath._fitsQ192` — Code smells: the large-`amount0` branch can select a reverting formula, but current signed-128 seed bounds make it dead code.
- **Snipe-tax terms are omitted from the economics pin [agents: 1]** — `PonsV2LaunchFactory._economicsDigest` — Code smells: an owner can change public-buyer tax terms between preview and launch while creator wallets remain exempt; this is a privileged parameter action without an unprivileged amplifier.
- **Changing creator recipient redirects already accrued value [agents: 1]** — `PonsV2LaunchFactory._setCreatorFeeRecipient` — Code smells: pending curve/hook fees and unreleased vest follow the live recipient; the standing recovery power is privileged and timelocked.
- **Graduation measures quote receipt but trusts nominal token output [agents: 1]** — `PonsV2LaunchFactory._sweepCurve` — Code smells: quote is booked by balance delta while launcher tokens use the curve's reported amount; the shipped standard token does not short-deliver.
- **Launch authority depends on out-of-scope forwarder binding [agents: 1]** — `PonsV2LaunchFactory.launchTokenFor` — Code smells: the factory authenticates only the forwarder and trusts supplied deployer, fee-recipient, and exemption fields; the configured forwarder's caller binding was not in scope.
- **Native and token hook payouts enforce different receipt semantics [agents: 1]** — `PonsV2MemeHook._payOut` — Code smells: token payouts demand exact escrow receipt while native payout does not measure a delta; BBF's protocol launch is native ETH and no undercredit was traced.
- **Router burn telemetry can include unrelated same-transaction burns [agents: 1]** — `ProtocolBurnRouter._buyback` — Code smells: the event reports total-supply delta rather than the vault's accounted burn; vault settlement still enforces its own exact burn, so this is telemetry risk.
- **The vault's graduation short-fill exception is unreachable downstream [agents: 1]** — `ProtocolBuybackVault._processMarket` — Code smells: the executor reverts on the full-offer quantity floor before the vault can accept `inputSpent < minInput`; this is the vault-side seam of Finding 3 rather than an independent loss path.
- **Operator fills can move cooldown state asymmetrically [agents: 1]** — `ProtocolBuybackVault.process` — Code smells: direct protocol-token burns and operator market fills do not share all permissionless checks, allowing a trusted operator to affect later public timing; no unprivileged theft path was shown.
- **Operator-guarded execution permits one-unit market floors [agents: 1]** — `ProtocolBuybackVault.processOperator` — Code smells: the trusted operator supplies route and minima and only nonzero is enforced; this matches the documented OperatorGuarded trust model.
- **Ready status can describe an unexecutable final curve fill [agents: 1]** — `ProtocolBuybackVault.processingStatus` — Code smells: status ignores remaining sellable tokens while the burn router submits `maxInput`, so keepers can repeatedly hit Finding 3's revert.
- **Zero permissionless budget means unlimited spending [agents: 1]** — `ProtocolBuybackVault.setPermissionlessPolicy` — Code smells: zero is explicitly documented as unlimited rather than disabled; this remains an operator footgun, not a code-path ambiguity.
- **Launch binding checks fewer dependency hashes than execution [agents: 1]** — `ProtocolLaunchValidation.validate` — Code smells: several immutable dependency hashes are enforced only when the executor runs; address-runtime replacement feasibility on Robinhood was not established.
- **Successor validation permits signer-set expansion [agents: 1]** — `ProtocolSafeValidation.validate` — Code smells: any canonical module-free Safe with a valid threshold may become owner, not only a single approved signer; comments indicate signer rotation belongs inside Safe governance.
- **The preview harness is a live arbitrary CREATE gadget [agents: 3]** — `RendererPreviewHarness.preview` — Code smells: the function is public and state-changing despite eth_call-only documentation, with no initcode cap; the harness owns no protocol authority or assets, so material harm was not traced.
- **Renderer registry admission is schema-only [agents: 1]** — `RendererRegistry._validateRenderer` — Code smells: a renderer may pass schema validation and later revert or return hostile metadata; creators choose the renderer and no non-creator replacement path was shown.
- **Cumulative reward quotes rely on a separate validator [agents: 1]** — `RewardCurve.cumulative` — Code smells: boosted quotes divide by `horizon` and accept invalid boost grids if a caller skips `validate`; current tier initialization validates these parameters.
- **Text validation admits bidi controls and supplementary noncharacters [agents: 1]** — `TextValidation.isValid` — Code smells: creator text can visually spoof names or produce decoder-sensitive SVG text; no custody or authorization impact was shown.
- **Previewed member rate does not model carry and dust transitions [agents: 1]** — `VestingLedger._previewResult` — Code smells: the view reports instantaneous pro-rata flow while write accounting distributes integer index increments with carry; no theft from the mismatch was demonstrated.
- **Stored ledger status ignores due expirations [agents: 1]** — `VestingLedger._status` — Code smells: completeness is derived only from the funding heap and `scheduledExpirations` remains zero; current tier wrappers add expiration-aware checks, but direct library consumers could misread it.
- **Stored expiration narrows after addition [agents: 1]** — `VestingLedger._storedExpiration` — Code smells: the sum is cast to `uint64` and could wrap; current writers call the capacity guard first, so no live bypass was found.
- **Direct library claim previews use the wrong storage context [agents: 1]** — `VestingLedger.encodedClaimPreview` — Code smells: `IERC721(address(this)).ownerOf` is correct under delegatecall from a tier but reverts when calling the deployed library directly; production clones use delegatecall.
- **Settled preview can claim completion while expirations remain due [agents: 1]** — `VestingLedger.encodedPreview` — Code smells: settled status uses funding-only `_status` while current status walks expiration frontier; no consumer that authorizes writes from the settled flag was identified.
- **Refund preview can mix stale funding and expiration state [agents: 1]** — `VestingLedger.encodedRefund` — Code smells: the tier overwrites completion/projection flags without recomputing funding-as-of and cancellation numbers; a value-changing live generation mismatch was not proven.
- **Direct share quotes accept unvalidated curve parameters [agents: 1]** — `VestingLedger.quoteShares` — Code smells: a zero boosted horizon divides by zero and off-grid boosts can be quoted; protocol callers use constructor-validated storage, so the demonstrated direct call is self-reverting rather than a victim loss.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
