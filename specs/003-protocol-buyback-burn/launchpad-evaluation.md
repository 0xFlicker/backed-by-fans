# Launchpad evaluation and evidence boundaries

**Assessed**: 2026-09-07  
**Feature**: [Protocol buyback and burn](spec.md)  
**Evidence class**: Current public documentation and published source inspection. No live deployment
bytecode comparison, RPC probe, token launch, fork execution, or browser transaction was performed
while preparing this specification.

## Selection

Implementation setup review on 2026-09-07 retains this selection and chooses a pinned
disposable mainnet fork. No complete official launchpad testnet was established by the
renewed first-party search. The selected historical block supports a header and factory
state read; full archive/dependency validation is still pending. See the dated implementation
review in [research.md](research.md) for the exact hash and G1–G6 boundaries. Verified Pons
MIT source snapshots are retained in `contracts/external/pons/4663/`; upstream exchange
licenses must be preserved separately.

Use **Pons v2 as the first forknet integration candidate**. It has substantially better accessible
integration evidence than Long. This is a research-backed priority, not a completed deployment
compatibility finding. The implementation plan must establish the exact deployed version and pass
the tests below before treating the selection as final.

The latest user decision retains a Backed By Fans protocol Safe for token onboarding and
post-launch buyback configuration, superseding the earlier no-admin requirement. External launchpad
powers remain acceptable when disclosed separately. Pons's external roles are dependencies to
characterize, not a requirement to create an ownerless replacement launchpad. Token-governed DAO
administration is out of scope; earned membership-fee inventory remains dedicated to buyback and burn. Unearned protocol fees
remain reserved in tiers for unused-time refunds; they are not available for launchpad purchases.

| Criterion | Pons v2 | Long.xyz |
| --- | --- | --- |
| Current first-party evidence | Public repository contains v1 and v2 sources; v2 has a documented factory. | Current official app identifies Robinhood Chain, but exposes little integration material in the retrieved page. |
| ETH pairing | Published v2 curve supports native ETH as its quote asset. | An indexed launch page offers ETH, but its seven-month-old crawl is insufficient to confirm the current Robinhood deployment. |
| Launch lifecycle | Curve trades precede a graduated pool; inspect deployed state for each transition. | Older first-party material describes auction epochs. Current addresses, lifecycle and graduation interfaces were not established. |
| True burn | Published launch token supports holder-initiated supply destruction. Built-in Pons buybacks instead vest. | Current token burn capability was not established. |
| Administrative dependencies | Published factory and hook retain administrative and sweep-operator powers; details below. | Current roles and their effects were not established. |
| Test environment | No official launchpad testnet deployment manifest was located in the sources checked. Public source makes a faithful copied environment worth evaluating. | No official launchpad testnet deployment manifest or complete copyable stack was located. |
| Decision | First candidate for concrete fork verification. | Evaluated but not selected on presently available evidence. |

Pons describes v2 as a full-supply bonding launch followed by a locked Uniswap v4 pool. Its repository
lists factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` and warns that root-level generated ABI
files describe v1. Resolve the v2 stack separately and verify source against runtime code before use.
[Pons repository](https://github.com/ponsdotdev/ponsfamily)

The current Long app and older indexed pages do not establish a usable present-day integration.
The historical how-it-works URL returned 404 during this assessment. Do not infer that Long lacks
the required capabilities, reuse another network's addresses, or substitute the similar-looking
`longxyz.com` domain for the requested `long.xyz`.
[Long app](https://app.long.xyz/), [indexed launch page](https://app.long.xyz/launch),
[historical explanation](https://app.long.xyz/how-it-works)

## Pons constraints that change the design

The published launcher token inherits `ERC20Burnable`, mints its initial supply to the curve, and
gives its deployer attribution rather than token privileges. This supports an independent Backed By
Fans buyer burning its own received balance. Verify an equal reduction in `totalSupply`; a token
transfer or a vesting deposit is insufficient evidence.
[Launcher token source](https://github.com/ponsdotdev/ponsfamily/blob/main/contractsV2/src/v2/PonsV2LauncherToken.sol)

The curve's published buy path can partially fill at completion and return unused quote currency.
The unused ETH must remain part of the Backed By Fans fee budget. Curve fee sweeps accept the
creator or the sweep operator, but internal buybacks require the operator. These sweep restrictions
concern Pons trading-fee handling, not ordinary purchases made with membership-fee inventory.
Confirm the selected deployment's behavior.
[Curve source](https://github.com/ponsdotdev/ponsfamily/blob/main/contractsV2/src/v2/PonsV2BondingCurve.sol)

The required flow is **membership fees reserved in tiers → continuous earning over consumed paid
time → earned release → curve purchase during bonding / pool purchase after graduation → burn
received tokens**. Unearned reserves can instead fund unused-time refunds. Pons's ordinary trading fees apply to those purchases. The
purchased tokens do not enter Pons's vesting vault, and disabling that vault's mechanism is not
required for this flow. The user has now selected **vested buybacks enabled at launch**, with the
developer receiving the remaining creator ETH trading revenue and the creator's earned vested
tokens. Initial developer holdings still come from the funded launch purchase. This replaces the
earlier off setting and requirement to send all launch creator proceeds to the burn destination.

Record the actual fee and vesting terms from the selected deployment rather than treating published
constructor defaults as live configuration. Deposits, releases and beneficiary claims need their own
evidence. Membership-funded purchases also pay ordinary Pons trading costs, which can generate
developer revenue and vested tokens; disclose that connection without counting vesting as a burn.
[Vault source](https://github.com/ponsdotdev/ponsfamily/blob/main/contractsV2/src/v2/PonsV2BuybackVault.sol)

The published factory permits an owner to override a launch's creator fee recipient after a
timelock, without creator veto, and disables ownership renunciation. It also has public-launch
controls and deployment-dependent anti-sniping treatment. The developer's Pons recipient remains
subject to those external powers. Keep the optional creator trading tax at zero; record any launchpad-
mandated treatment of the deployer's ETH purchase and its actual receipt rather than claiming
identical execution for all launch participants.
[Factory source](https://github.com/ponsdotdev/ponsfamily/blob/main/contractsV2/src/v2/PonsV2LaunchFactory.sol)

The published post-graduation hook requires its sweep operator for internal conversions and
buybacks. Enabled vested buybacks therefore retain an external sweep dependency. An unavailable
operator can delay trading compensation. Test that failure explicitly. Backed
By Fans membership-fee purchases must not wait for launchpad creator-fee harvesting. Do not claim
all external trading-fee income can be collected without Pons participation.
[Hook source](https://github.com/ponsdotdev/ponsfamily/blob/main/contractsV2/src/v2/hooks/PonsV2MemeHook.sol)

The Pons docs endpoint redirected to a regional restriction page from this browsing environment.
The indexed documentation and separately public official source were available. This is a limit of
this research environment, not a determination of the user's eligibility or proof that the protocol
is unavailable. [Pons documentation](https://docs.ponsfamily.com/v2)

## Testnet, copied testnet, and forknet decision

Robinhood documents mainnet chain ID **4663**, testnet **46630**, public RPC endpoints, and archive
providers. Availability of Robinhood testnet does not establish availability of either launchpad or
its complete exchange dependencies there.
[Network documentation](https://docs.robinhood.com/chain/connecting/)

No working launchpad testnet was located in the official materials and targeted searches above.
This is a bounded negative finding, not proof that one does not exist. Resolve the environment
before implementation depends on it:

1. Accept an official testnet only after proving launch, bonding trades, graduation, pool trades,
   burn, and representative payment-asset conversions against documented addresses.
2. A copied testnet is acceptable only if its complete dependencies, initialization, permissions,
   relevant token behavior, and licenses can be reproduced. A source tree alone is insufficient.
3. Otherwise use a short-lived mainnet fork pinned to a recorded block number and hash. Retain
   authentic launchpad and exchange runtime code and state. Fresh Backed By Fans deployments and
   the fresh protocol-token launch occur only in that disposable environment.

The copied environment must not remove an operator check, change a curve, invent liquidity, or
bypass an external authorization check in order to report a real integration pass. The requested
Backed By Fans Safe configuration must instead be exercised through actual authorized Safe transactions.
Separate manipulated fault-injection fixtures from the unmodified integration run. Copying an
externally licensed test dependency does not turn it into MIT-licensed Backed By Fans source.

## Planning exit evidence

These are factual engineering investigations, not unspecified product preferences. Record the
results in the implementation plan and its research artifacts:

- Document the Backed By Fans Safe role separately from Pons owner/operator and developer-beneficiary
  roles. Specify token onboarding, route approval/replacement, bounded execution settings and buyback
  pause/resume, with public changes and no arbitrary membership-fee withdrawal or upgrade authority.
  Test authorized Safe execution and unauthorized rejection, including pending inventory after a
  configuration change. Record Safe availability and compromise risks; no DAO integration is required.
- Pin the source revision, origin chain/block/hash, role-address map, runtime code hashes,
  version-specific ABI and dependency wiring for the selected launchpad and exchange.
- Prove native ETH launch is open to an ordinary account; identify launch fee, minimum purchase,
  launch-window taxes, exemptions, reserved supply and transition thresholds from that deployment.
- Prove the complete public route from membership-fee assets to the protocol token and its burn
  during bonding and after graduation, without launchpad operator credentials.
- Verify vested buybacks are enabled at launch, the developer's creator recipient can claim earned
  ETH and vested tokens, and vault deposits/releases reconcile to the recorded beneficiary split.
  Keep unswept external balances and developer compensation separate from membership-fee custody.
  Exercise recipient/toggle changes only as explicitly labeled external-control tests; they must
  confer no Backed By Fans authority and must not rewrite already accrued allocations.
- Identify a manipulation-resistant execution rule for each conversion leg, including the early
  bonding period with little price history. A caller's own minimum output or the pool's current
  spot quote alone is not proof of a safe public spending rule.
- Demonstrate two independent, gas-funded ordinary callers can run processing. Explain who pays
  gas, why routine execution needs no Safe signature, and when processing will wait for Safe
  configuration, gas, liquidity or admissible pricing.
- Establish archive-state availability and a repeatable fork bootstrap. Record unavailable state
  as a blocker rather than silently using latest state or mocks.
- If Pons fails a mandatory Backed By Fans property, investigate Long with the same evidence bar.
  Do not add a second production integration, invent a replacement launchpad, or relax a property
  merely to obtain a passing demonstration.

## US-person premise

The user's proposed policy is to launch against ETH and support multiple membership payment
tokens on mainnet, including Stock Tokens. This specification preserves that technical scope.
The user has also approved developer trading income and vested tokens, so the earlier no-fee-receipts
premise no longer describes the design. SEC staff distinguish several forms of tokenized securities and explain that tokenizing
a security does not remove the securities-law questions. The staff statement is not itself a rule
or a legal opinion about Backed By Fans.
[SEC staff statement, January 28, 2026](https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities)

Mainnet assessment must address the actual assets, fee conversions, token launch, distribution,
developer holdings, issuer terms, and public communications. It is separate from completing the
technical forknet implementation. Burning fees is not described to users as regulatory clearance.
Stock Token scaling and corporate-action behavior must also remain accurate.
[Robinhood integration guidance](https://docs.robinhood.com/chain/building-with-stock-tokens/)
