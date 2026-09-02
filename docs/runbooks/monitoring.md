# Protocol monitoring runbook

Status: **procedure ready; production monitors not configured**.

Contracts are the source of truth. Monitoring may alert and summarize but must
not become required for a read, payment, refund, or claim.

## Schedule

Run the full deployment checker immediately after capture, then at launch,
`+1h`, `+4h`, `+24h`, `+7d`, and weekly. After each ownership or fee-recipient
change, rerun it immediately and begin a fresh short observation window.

## Critical alerts

- Tier solvency: token balance falls below `creatorProceeds + rewardReserve +
  totalReferralLiability`.
- Authority: factory/tier owner, pending owner, fee recipient, deployer binding,
  tier renderer, or tier payment token differs from the reviewed state.
- Runtime: code hash or code presence differs at factory, renderer, tier
  deployer, preview harness, any launch token, or any monitored registered tier.
- Mainnet USDG: proxy implementation, authority, runtime hash, decimals, or
  pause state differs from the deployment-day observation.
- Registry: a tier presented as official fails `isRegisteredTier`, its
  immutable factory/payment-token wiring, or its required interfaces.
- Operational: unexpected pause/cap/metadata change, failed fixed-destination
  exits, abnormal RPC disagreement, or Blockscout verification regression.

For every run, record captured block number/hash, RPC source class, all observed
values, command/artifact digest, operator, UTC time, and disposition. Confirm a
critical signal through a second RPC before attribution, but begin containment
immediately when user funds could be at risk.

## Limits

No monitor can reverse an immutable deployment, redirect a frozen payout, or
make an unregistered tier authentic. Unsolicited token transfers are surplus,
not proceeds. Preserve raw observations even when an alert is later classified
as a provider or explorer failure.
