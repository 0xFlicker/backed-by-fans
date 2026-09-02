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
| Testnet payment tokens | OPEN | Verify the external USDG, AMD, NFLX, PLTR, AMZN, and TSLA launch manifest, then complete the live product pilot using faucet-accessible assets. |
| Public testnet deployment and source verification | BLOCKED | Replacement expired-sync factory deployment, checked-in Foundry broadcast, generated Wagmi address, exact source pages, and independent operator verification. |
| Public testnet lifecycle | BLOCKED | Replacement factory deployment, creator tier, payment, allocation, claim, refund, natural expiry, owner batch sync/burn, accrued claim while burned, same-ID rejoin, creator ownership transfer, child verification, and production web build. |
| Unassisted public testnet creator/supporter pilot | BLOCKED | Completed [pilot record](../pilots/testnet-pilot.md), participant consent, issues/disposition. |
| Brand and name launch readiness | BLOCKED | Every item in the [brand checklist](../brand/backed-by-fans-launch-readiness.md) has professional evidence. |
| Artifact freeze | OPEN | Signed commit, source/dependency digests, standard JSON, compiler/build settings, web build digest. Depends on resolved pilot/reviews. |
| Independent accounting review | BLOCKED | Fresh signed report over the frozen factory-created tier, `totalRewardShares`, eligibility transitions, inactive-period exclusion, liabilities, scripts, immutables, rounding and USDG assumptions; exact artifact digest; findings/dispositions. The previous review does not cover the new denominator. |
| Independent security audit | BLOCKED | Fresh signed final report covering burn/remint, owner batch authority, capacity races, permanent claims, and the new reward denominator over that same scope/artifact; every high/critical closed and each medium explicitly approved; retest evidence. |
| Reproducible build | OPEN | Two independent clean builds match frozen creation/runtime and web artifact digests. Cannot pass before freeze. |
| Production Safe configuration/rehearsal | BLOCKED | Evidence from the [Safe runbook](safe.md) that owner, threshold, modules, guard, and fallback exactly match the approved 1-of-1 policy; explicit acceptance of sole-signer compromise/loss risk; and rehearsed custody, backup, recovery, transaction review, and incident response. |
| Production deployment identities | BLOCKED | Protocol owner, fee recipient, deployer, operational roles and separation approved. |
| Independent RPC/explorer operations | BLOCKED | Two RPC providers, source verifier, monitoring and incident responders rehearsed. |
| Mainnet deployment-day USDG facts | BLOCKED | Proxy, implementation, authority, code hashes, decimals, pause state and one observation block/hash. |
| Production operations | BLOCKED | Incident contacts/policy, RPCs, Vercel project/host, launch creator and public supersession wording. |
| Mainnet authorization | BLOCKED | Named approvers sign explicit GO after all prior gates PASS. |

## Environment boundary

Robinhood Chain mainnet is chain ID `4663`; testnet is `46630`. The current
mainnet release profile contains only USDG at
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. Revalidate that address and the
mainnet deployment-day authority inventory from official sources before a GO
decision. Testnet uses the six external contracts recorded in
[deployment.md](deployment.md). Those contracts and Stock Token behavior are
test infrastructure, not authorization to enable Stock Tokens on mainnet.

## Final decision

A GO record must identify the frozen commit and artifacts, checked-in mainnet
Foundry broadcast, generated address, chain/token, Safe identities,
audit/accounting reports, pilot evidence, reproducibility evidence, monitoring
owners, incident plan, approvers, and UTC decision time. Any mismatch is NO-GO
and requires a newly frozen and reviewed candidate.
