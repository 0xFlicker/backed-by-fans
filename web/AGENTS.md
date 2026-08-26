<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wallet and transaction guardrails

## Non-negotiable boundary

**THOU SHALT NEVER RE-IMPLEMENT WAGMI.** Wagmi and viem own wallet
connection, chain switching, contract simulation, transaction submission,
receipt waiting, confirmation handling, polling, replacement detection and
classification, cancellation and revert reporting, and query lifecycle. Use
their maintained hooks and actions directly.

If required behavior is missing or broken, first produce a minimal reproduction
against the pinned wagmi/viem release. Fix or extend wagmi/viem, or upgrade to a
release containing the fix. Do not build an application-local wallet or receipt
subsystem as a substitute. Any exception requires explicit user approval after
the upstream limitation and proposed scope are documented.

## Required implementation pattern

- Pass the request returned by `simulateContract` directly to the connected
  wagmi wallet client's `writeContract`. Do not reconstruct or shadow the
  request.
- Use wagmi or viem receipt primitives as the single source for pending,
  confirmed, reverted, cancelled, repriced, or replaced transaction status.
- In React code, prefer wagmi hooks and their TanStack Query integration. A
  direct viem action is acceptable in a framework-independent helper when it is
  a thin call to the library primitive rather than a new lifecycle engine.
- After wagmi/viem returns a successful receipt, application reconciliation may
  decode that receipt's logs with viem, invalidate or refetch the affected
  canonical contract reads, and verify the action-specific postcondition before
  showing product success.
- Keep application transaction UI state presentational. It may label library
  states and show domain-specific instructions, but it must not become a second
  transaction state machine.

## Forbidden application machinery

Do not add any of the following to this dapp:

- custom receipt polling, retry, backoff, confirmation, timeout, or drop
  detection;
- nonce tracking or same-nonce replacement inference;
- custom replacement, cancellation, revert, or receipt-status classification;
- manual receipt recovery loops around `getTransactionReceipt`;
- historical log scans used to rediscover or infer the outcome of a submitted
  wallet transaction;
- durable transaction or exact-intent journals in `localStorage`,
  `sessionStorage`, IndexedDB, cookies, a database, or an application API;
- Web Locks, cross-tab mutexes, broadcast coordination, or global write
  embargoes for pending wallet transactions;
- receipt-less reconstruction of whether an action succeeded;
- generalized wrappers that duplicate wagmi/viem transaction lifecycle,
  caching, or error behavior.

Do not persist pending transaction state merely to survive a reload. If reload
continuity is an explicit product requirement, use a wagmi/TanStack-supported
persistence approach and store only the minimum library input, such as a
transaction hash and chain ID. This still requires explicit approval; it must
not grow into intent journaling or receipt reconstruction.

## Meaning of reconciliation

In this repository, **reconciliation starts after wagmi/viem supplies a
successful receipt**. It means only:

1. decode relevant events from that supplied receipt when causal proof is
   necessary;
2. refetch the affected canonical onchain reads through the existing data
   layer; and
3. show success only when the expected domain postcondition is visible.

Reconciliation does not locate receipts, monitor mining, classify transaction
outcomes, reconstruct wallet history, or decide whether a different nonce
replacement is safe to retry. Those are wallet-library responsibilities.

## Review requirements

- Reject bespoke wallet, transaction, or receipt infrastructure even when it
  is described as extra safety, recovery, resilience, or race hardening.
- Before proposing transaction machinery, identify the exact wagmi/viem
  primitive that should own the behavior and verify its pinned API and types.
- Never report the absence of application-local polling, persistence, locking,
  nonce handling, or replacement inference as a defect.
- Tests must exercise the wagmi/viem integration boundary and domain
  postconditions, not create a parallel wallet implementation and then prove
  that implementation internally consistent.
- Reviewers must cite this section when rejecting or removing wallet-software
  reimplementation.
