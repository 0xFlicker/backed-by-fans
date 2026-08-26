# Safe configuration runbook

Status: **OPEN — production Safe selection and rehearsal are external gates**.

The protocol does not require Safe, but production protocol ownership, fee
custody, and creator operations should use independently reviewed organizational
controls appropriate to their risk. This document is a checklist, not evidence
that any Safe is configured.

For each proposed Safe, record and verify directly:

- chain and Safe address;
- owner addresses, organizational roles, independence, and recovery plan;
- signature threshold and the rationale for loss/compromise tolerance;
- every enabled module, guard, and fallback handler, including an explicit
  disposition when the list is empty;
- Safe singleton/version, runtime code, nonce, and official deployment source;
- transaction service dependence and a direct-chain signing fallback; and
- which address will be factory owner, fee recipient, or tier owner.

## Rehearsal gate

On a non-public local environment, rehearse receive, propose, independently
review, reject, execute, and recover for each required operation. Include
two-step ownership nomination/acceptance, fee withdrawal, creator withdrawal,
refund preview/top-up, pause/unpause, and cancellation of a mistaken pending
ownership nomination by replacing it with the intended nonzero nominee.

Before production acceptance, an operator other than the proposer must compare
the decoded calldata, target, value, chain ID, nonce, and expected post-state.
Record transaction hashes and direct post-state reads. Do not export seed phrases
or private keys into evidence.
