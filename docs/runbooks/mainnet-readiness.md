# Mainnet go/no-go

Overall status: **BLOCKED**. This checklist records evidence boundaries; it does
not authorize deployment. Only explicit human authorization after every required
gate is PASS can change the decision to GO.

Status meanings: **OPEN** means locally actionable work is not complete;
**BLOCKED** means required external evidence or setup is unavailable; **PASS**
requires an immutable evidence reference, owner, and review date. Never infer PASS
from a green local test.

| Gate | Status | Required evidence |
| --- | --- | --- |
| Canonical public testnet USDG | PASS | Paxos source, exact proxy pin, and live read-only observation recorded in [testnet USDG evidence](../release/testnet-usdg-evidence.md), reviewed 2026-08-26. |
| Public testnet deployment and source verification | BLOCKED | Checked-in Foundry broadcast, generated Wagmi address, exact source pages, and independent operator verification. |
| Public testnet lifecycle | BLOCKED | Factory deployment, creator tier, payment, allocation, claim, refund, natural expiry, sync, creator ownership transfer, child verification, and production web build. |
| Unassisted public testnet creator/supporter pilot | BLOCKED | Completed [pilot record](../pilots/testnet-pilot.md), participant consent, issues/disposition. |
| Brand and name launch readiness | BLOCKED | Every item in the [brand checklist](../brand/backed-by-fans-launch-readiness.md) has professional evidence. |
| Artifact freeze | OPEN | Signed commit, source/dependency digests, standard JSON, compiler/build settings, web build digest. Depends on resolved pilot/reviews. |
| Independent accounting review | BLOCKED | Signed report over the frozen factory-created tier, scripts, immutables, rounding and USDG assumptions; exact artifact digest; findings/dispositions. |
| Independent security audit | BLOCKED | Signed final report over that same scope/artifact; every high/critical closed and each medium explicitly approved; retest evidence. |
| Reproducible build | OPEN | Two independent clean builds match frozen creation/runtime and web artifact digests. Cannot pass before freeze. |
| Production Safe configuration/rehearsal | BLOCKED | Owners/threshold/modules/guard/fallback and rehearsal evidence from [Safe runbook](safe.md). |
| Production deployment identities | BLOCKED | Protocol owner, fee recipient, deployer, operational roles and separation approved. |
| Independent RPC/explorer operations | BLOCKED | Two RPC providers, source verifier, monitoring and incident responders rehearsed. |
| Deployment-day USDG facts | BLOCKED | Proxy, implementation, authority, code hashes, decimals, pause state and one observation block/hash. |
| Production operations | BLOCKED | Incident contacts/policy, RPCs, Vercel project/host, launch creator and public supersession wording. |
| Mainnet authorization | BLOCKED | Named approvers sign explicit GO after all prior gates PASS. |

## Environment boundary

Robinhood Chain mainnet is chain ID `4663`; testnet is `46630`. The official
mainnet USDG address currently recorded by Robinhood is
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. Paxos publishes the official
Robinhood testnet USDG proxy as
`0x7E955252E15c84f5768B83c41a71F9eba181802F`. Revalidate both values and the
deployment-day authority inventory from the linked official sources in
[deployment.md](deployment.md) on execution day. A local mock is test evidence
only and must never appear in a public Foundry broadcast or generated address map.

## Final decision

A GO record must identify the frozen commit and artifacts, checked-in mainnet
Foundry broadcast, generated address, chain/token, Safe identities,
audit/accounting reports, pilot evidence, reproducibility evidence, monitoring
owners, incident plan, approvers, and UTC decision time. Any mismatch is NO-GO
and requires a newly frozen and reviewed candidate.
