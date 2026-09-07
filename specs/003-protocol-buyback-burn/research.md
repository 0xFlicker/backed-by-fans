# Research: Protocol buyback and burn

**Date**: 2026-09-07  
**Evidence**: Repository inspection, official documentation/source, and agent-reported read-only
Blockscout contract inspection. No fork, deployment, swap, Safe transaction or browser test was run.
Decisions below resolve design questions; the final evidence table identifies unproven integration claims.

## 1. Extend the existing protocol

**Decision**: Keep `MembershipFactory` as the token registry and sole authority source. Add immutable
per-tier `protocolFeeBps`, tier-held continuous fee accrual and a dedicated factory-bound burn vault
receiving earned releases. Remove obsolete fee payout paths. The user approved this accrual extension
after the initial plan; it supersedes upfront protocol-fee transfer.

**Rationale**: The factory already provides Safe-owned token enablement and pagination; disablement
only affects new tiers. `MembershipTier._applyPayment` already splits gross using independent floors,
exact-transfers fees and keeps reward/referral/creator liabilities. `MembershipModel` already accepts a
variable protocol rate. Preserve gross refund entitlement, but now use the membership's unearned
protocol reserves first, then creator proceeds and owner top-up. At100%, unused-time refunds need no
owner funding, even after earlier earned fees have burned.

**Alternatives considered**: Replacing the membership protocol or adding a second payment-token registry
would duplicate working behavior. Keeping fee withdrawal as a compatibility path contradicts the spec.
A vault constructed by the factory avoids mutable binding or circular setup; deployment size must be tested.

**Repository evidence**: `contracts/src/MembershipFactory.sol`, `MembershipTier.sol`,
`types/MembershipTypes.sol`, `contracts/test/models/MembershipModel.sol`,
`contracts/test/invariants/AccountingInvariant.t.sol`. The old invariant treats factory donations as
protocol revenue; replace that assumption with separate membership and donation ledgers.

The existing time checkpoint consumes paid seconds before grant seconds, and gross refunds already
prorate unused paid time. Use that paid clock for per-purchase fee earning. Cumulative floor rounding
preserves total fees and checkpoint independence; prefix fee totals plus binary-searchable lot ends
avoid unbounded scans. Variable contribution gross-prefix cleanup currently deletes a dynamic array:
replace that reset with logical generation isolation alongside fee lots to keep cancel/rejoin bounded.
[Accrual design](contracts/fee-accrual.md) records exact formulas and edge cases.

Alternatives considered for timing: upfront release makes future-time fees unavailable for refunds;
period-end cliffs complicate partial-period cancellation; transferring unearned reserves to the vault
adds a refund withdrawal path to otherwise burn-only custody. Keeping reserves in existing tiers and
releasing only earned fees preserves the simpler custody boundary. Separate calendar transactions or
a new streaming dependency are unnecessary; entitlement derives lazily from paid-time consumption.

Design arithmetic check (2026-09-07): a deterministic Python model with seed8310 exercised4,000
fixed-price and variable-contribution sequences, checking fee conservation, checkpoint-frequency
independence, cancellation residual≤one raw unit and full100% unused-time refund backing. All sampled
cases passed. This checks the proposed formulas only; it is not Solidity, browser or fork proof.
Implementation must retain the corresponding independent model and stateful regression cases.

## 2. Select Pons v2 and bind to deployed sources

**Decision**: Implement Pons v2 first. Use verified deployment-specific interfaces and source inputs,
not the root generated v1 ABI or an assumed faithful copy of current GitHub main.

**Rationale**: Published Pons supports ETH launch, public curve trades, separate graduation/pool creation,
ERC20 holder burn and the approved vesting compensation. Long remains insufficiently documented to
justify an implementation. The earlier [evaluation](launchpad-evaluation.md) records both candidates.

Official repository revision inspected: `8b9bf371030279133017b5c1b713823f5889c5d2` (2026-09-06).
The factory agrees with explorer-verified source apart from whitespace, but the deployed curve source
includes `launchSupply`, `launchedAt`, recipient exemptions and `currentSnipeTaxBps(recipient)` absent
from that GitHub curve. The verified source compilation metadata is Solidity 0.8.35, Cancun,
optimizer 200, via IR. This is explorer verification, not our own reproducible bytecode comparison.
[Official revision](https://github.com/ponsdotdev/ponsfamily/tree/8b9bf371030279133017b5c1b713823f5889c5d2),
[verified factory](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract).

**Read-only observations**, collected at `latest` rather than a common pinned block:
factory is verified/nonproxy; `launchEnabled=true`; launch fee 0.0005 ETH. Preset 0 reports
1e27 raw supply, 100-bps curve fee, 1.68 ETH phantom quote, 4.2 ETH graduation threshold, zero V4 core
pool fee, tick spacing 200 and enabled status. Latest indexed block observed was 57,010,735,
2026-09-07T17:25:23Z. These values are discovery evidence, not accepted immutable launch inputs.
[Factory state and verified source](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract).

Dependency discovery from verified factory constructor/source:

| Role | Candidate address on origin chain 4663 |
| --- | --- |
| Pons factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| PositionManager | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Liquidity locker | `0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952` |
| Meme hook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |
| Fee escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |
| Pons buyback vault | `0x42df2a798f82289E177311362e8f5ccC45c1219c` |

Re-read and hash every dependency, helper and role at the chosen fork block before using this map.
Obtain source/compiler metadata including constructor arguments and immutable values. The discovery
map is not permission to hardcode future dynamic token, curve or pool identities.

**Alternatives considered**: A faithful copied testnet is acceptable only with the entire verified
stack and real initialization; copying the inspected GitHub curve would omit deployed behavior.
Long is retained as a research alternative if Pons fails, not a parallel production adapter.

## 3. Launch, graduate and account for actual fees

**Decision**: ETH quote, zero extra creator tax, vested buybacks enabled, developer-designated Pons
recipient. Use verified `previewLaunchEconomics` and nonzero expected economics when calling
`launchToken(TokenParams,uint256,address)`; obtain the exact struct and helper ABI from verified source.
The deployer-funded curve purchase is recorded separately from the launch fee and later earned tokens.

Use `buy(uint256,uint256,address)` on the curve with the executor as recipient. ETH refunds return to
the caller; account using actual consumption. The deployed launch-window tax is recipient-sensitive:
wait while the burn executor has a nonzero anti-sniping penalty, while continuing memberships.
Do not grant it exemptions or assume the developer's treatment applies. Ordinary venue fees remain.

Crossing purchases may attempt graduation without creating a pool. Run public `graduate(token)` if
ready but unswept, and `createGraduatedPool(token)` if swept but pool absent. Read actual lifecycle
state before each purchase. Pool trading uses its full native ETH `PoolKey`, including the hook;
WETH is not interchangeable with native ETH in that key.
[Factory source](https://github.com/ponsdotdev/ponsfamily/blob/8b9bf371030279133017b5c1b713823f5889c5d2/contractsV2/src/v2/PonsV2LaunchFactory.sol).

**Rationale**: These are real public paths needed to prove bonding and graduation. Delayed pool
creation or launch taxes must not appear as failed memberships or nonexistent burns.

**Alternatives considered**: Manually setting a graduation flag or changing external permissions
cannot establish real integration. Paying avoidable anti-sniping penalties is unnecessary.

**Burn-before-graduation check**: Source inspection finds that curve initialization snapshots supply
for reserved inventory; later pricing and graduation use tracked token/quote reserves and reserved
tokens, not a buyer's live balance or current token supply. The deployed `launchSupply` getter is a
reporting snapshot, not the mechanism protecting trading math. A holder burn after purchase therefore
does not itself consume curve reserves or advance graduation. Require an invariant comparing equivalent
purchase sequences with and without buyer burns: reserve-derived graduation/seedability thresholds must
agree. This source finding still requires a real fork test.
[Verified source bundle](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract).

## 4. Use constrained official exchange execution

**Decision**: Encode exact-input Universal Router operations internally from typed Safe-approved
routes. Use the official router/periphery ABI and encoding dependencies; do not build arbitrary call
execution or a custom PoolManager settlement framework. Verify router and Pons manager compatibility.

Official Uniswap SDK discovery gives Robinhood V2.1.1 Universal Router
`0x8876789976decbfcbbbe364623c63652db8c0904` and WETH
`0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`. Pin the exact SDK revision used during implementation;
verify code and immutable wiring at the fork origin. Prefer supported V4 conversion pools, at most two
conversion legs. If required assets lack such a route, record G3 failure and investigate a concrete
supported venue before expanding executor types; do not invent liquidity or add a generic router.
[Official SDK constants](https://github.com/Uniswap/sdks/blob/main/sdks/universal-router-sdk/src/utils/constants.ts).

The official guide recommends Universal Router for V4 swaps. Our fixed command builder fixes
recipients/refunds, disallows allow-revert flags, bounds approvals and measures actual balances.
[Uniswap swap guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping).

**Alternatives considered**: Direct PoolManager integration adds callback and settlement complexity.
Caller-supplied Universal Router calldata could change recipients or leave funds behind. A dynamic
adapter registry would undermine burn-only custody.

## 5. Price protection is Safe economic authorization

**Decision**: Use positive expiring per-leg raw-unit reference rates, bounded tolerance, per-batch
limits and finite cumulative policy exposure. The Safe chooses evidence independently of callers'
execution-time spot quotes and records its evidence hash. No policy automatically renews.
Exact arithmetic, limits and examples are in [buyback-policy.md](contracts/buyback-policy.md).

**Rationale**: A freshly launched token lacks established independent oracle history, and a pool's
current quote is manipulable. The current specification authorizes Safe buyback configuration; an
explicit limit policy is simpler and more honest than inventing a new oracle or requiring privileged
signatures for each execution. It permits bonding-period purchases as soon as a valid policy and
ordinary fee conditions hold.

This does not prove fair market value or eliminate MEV. Manipulators can trade within the authorized
floor; the Safe can deliberately accept poor economics. An expiring finite budget bounds what ordinary
callers can spend under that decision. Public activity must disclose this economic trust, policy
expiry and exhausted budget. Safety invariants protect custody/purpose, not the Safe's price judgment.

**Alternatives considered**: Caller min-out or same-block spot quotes are insufficient. A bespoke
TWAP observer adds manipulable sampling and oracle operations. An oracle-dependent design without an
actual feed for the fresh token cannot establish bonding burns. A privileged keeper signature would
violate routine public execution. Stored Safe policies are configuration, not per-execution signatures.

## 6. Keep Pons compensation separate

**Decision**: Membership-funded tokens are burned directly. Pons's trading-fee buybacks keep their
native vesting/escrow flow; no custom splitter or direct trading-fee burn is introduced.

The Pons vault's `release(token)` credits escrow; native and token claims use `claim()` and
`claimToken(token)`. Read the actual beneficiary split and vest position. Test partial release,
additional-deposit weighted remaining duration and final release using local time advancement.
Operator-dependent sweeps may need separately labeled external participation; membership processing
must succeed without that role. [Vault source](https://github.com/ponsdotdev/ponsfamily/blob/8b9bf371030279133017b5c1b713823f5889c5d2/contractsV2/src/v2/PonsV2BuybackVault.sol),
[escrow interface](https://github.com/ponsdotdev/ponsfamily/blob/8b9bf371030279133017b5c1b713823f5889c5d2/contractsV2/src/v2/interfaces/ILaunchpadV2.sol).

**Alternatives considered**: Treating vesting as a burn, or blocking BBF fee processing on external
sweeps, confuses the two economic flows and contradicts the confirmed requirement.

The deployed curve's graduation calls `_sweepFees(0,false)`: pending buyback earmarks are distributed
as creator revenue. An ordinary attempted internal buyback can also fall back to creator payout when
impact or remaining allocation prevents execution. Enabled buybacks therefore do not guarantee every
earmarked fee vests. Test actual eligible sweeps before curve exhaustion or after pool creation, and
reconcile fallback payouts separately. Excess seed-token locks and LP locks are not burns.
[Verified curve/factory bundle](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract).

## 7. Reuse Safe, browser and execution tooling

**Decision**: Script-based administration; public configuration page; one Bun/viem runner. Genuine
local Safe signatures exercise configuration; no hosted transaction service or custom admin application.

Existing `CreateSafe.s.sol` and deployment checks validate Safe v1.5.0, approved public owner policy,
code hashes, guard and modules. Build a distinct local 2-of-3 fixture using canonical contracts and test
keys. Verify `ExecutionSuccess` and target state because outer Safe receipts can succeed while inner
calls fail. [Safe transaction reference](https://docs.safe.global/reference-smart-account/transactions/execTransaction).

Reuse `web/AGENTS.md` wallet/generation boundaries, existing Anvil EIP-1193 test wallet, and pinned
wagmi/viem. Use generated Foundry ABIs including external interface artifacts; no handwritten application
bindings. Extend `config.ts`'s currently testnet-only deployment assembly to all actually deployed
supported public chains. Do not manufacture public addresses from ephemeral fork records.

**Alternatives considered**: Custom wallet lifecycle, persistent transaction journals, a new backend
or Safe transaction-service dependency duplicate existing facilities or obstruct disposable forks.

## 8. Strict fork acceptance extends, rather than re-labels, current tests

**Decision**: Extend current Anvil bootstrap with a strict pinned full-integration entrypoint and
retained evidence. Keep loopback transaction RPC, chain 31337 and upstream archive credentials private.
Origin chain 4663, block number/hash and execution chain must be recorded separately. Verify external
chain-ID assumptions explicitly; a discrepancy is a gate failure, not permission to silently change IDs.

`test-web-anvil.sh` currently accepts a fork URL but uses latest state, deploys mock payment assets,
never launches Pons and removes temporary evidence. Playwright normally retains only failure traces.
None of those baseline checks is full forknet proof. Retain successful traces and all receipts before
cleanup, and require authentic assets/markets plus two clean runs.

Robinhood officially documents mainnet 4663, testnet 46630 and archive-capable providers. Public RPC
availability is not an archive guarantee or proof of a complete Pons testnet.
[Network documentation](https://docs.robinhood.com/chain/connecting/).

**Alternatives considered**: A complete official testnet is preferable if proven; no such deployment
was established in this research. Latest-state tests, mocked assets and altered permission checks
cannot substitute for the required origin-pinned integration.

## Verification still required

| Claim | Current evidence | Required next evidence |
| --- | --- | --- |
| Deployed Pons supports candidate launch | Verified explorer source and latest getters | Origin-pinned archive reads and actual local launch |
| Source reproduces runtime | Factory text comparison; curve mismatch identified | Exact per-dependency source/compiler/immutable/runtime manifest |
| Mandatory payment assets have usable routes | Not established | Real balances, pools, quotes and complete conversions on fork |
| Graduation and Pons hook swaps work | Source-supported public entrypoints | Actual threshold crossing, pool creation and swap/burn receipts |
| Safe administration works end to end | Existing creation code/tests | Actual signed configuration transactions and failure cases |
| Full product works on fork | Existing synthetic harness only | Full browser/contract evidence from two clean runs |

These unresolved external results remain G1–G6 implementation gates. There is no unresolved product
preference hidden behind a placeholder and no claim that research is authentic integration proof.
