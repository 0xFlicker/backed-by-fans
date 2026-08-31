<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles: III. Clean-Room Provenance and Licensing ->
  III. MIT Licensed and Open Source
- Added sections: None
- Removed sections: None
- Follow-up TODOs: None
-->

# Backed By Fans Constitution

## Core Principles

### I. Creator Ownership and Durable Membership

Backed By Fans MUST center the creator-supporter relationship. Membership terms,
price, duration, renewal behavior, fees, and access rights MUST be understandable
before a person joins. Creators MUST control the membership terms and the
experiences attached to their tiers. Where the protocol provides a durable
onchain credential, the product MUST present it as a membership record, not as
proof that the holder personally paid or participated. The product MUST NOT
describe a membership as equity, an investment, yield, dividends, passive income,
guaranteed returns, or a promise of appreciation.

Rationale: The product's value is creator ownership and durable participation;
misleading financial framing damages users and creates avoidable legal risk.

### II. Onchain Contract Fidelity and Chain-Scoped Identity

Deployed contract behavior, verified source, ABIs, events, and documented
postconditions MUST be treated as the source of truth for onchain behavior. Every
chain read or write MUST identify the chain ID first. Addresses MUST be keyed by
chain ID, protocol version, and role; an address MUST NOT be treated as globally
unique. Non-upgradeable deployments MUST be treated as immutable, with replacement
and migration handled explicitly when required. Wallet connection, transaction
submission, receipt polling, replacement, cancellation, and revert reporting MUST
remain with the established wallet/transaction lifecycle; application logic begins
only after a successful receipt is supplied.

Rationale: Membership ownership and economics are protocol state. Reimplementing
wallet lifecycle or collapsing chain identity can create incorrect or irreversible
user outcomes.

### III. MIT Licensed and Open Source

This project is MIT licensed and open source.

### IV. Plain Language and Honest UX

Public and transactional interfaces MUST lead with customer value: create a
membership, join, renew, and support a creator. Wallet, chain, address, fee, and
protocol language MUST appear at the action where it matters and MUST use plain
explanations before raw technical detail. Permanent choices, payment splits,
transaction states, failures, and limitations MUST be visible without euphemism.
The public name MUST be written as **Backed By Fans**; technical identifiers MAY use
`backed-by-fans` or `BackedByFans` only where syntax requires them.

Rationale: Progressive disclosure lets non-technical supporters make informed
decisions without hiding the technical facts that affect ownership and payment.

### V. Smallest Complete Slice and Evidence-Bounded Quality

Work MUST grow from the smallest end-to-end product slice that satisfies the
current requirement. The project MUST NOT add speculative compatibility layers,
feature flags, migrations, or abstractions without an approved need. Every
substantive change MUST have focused validation appropriate to its risk, and
claims MUST distinguish source inspection, local tests, browser replay, chain
state, authenticated production proof, and hardware proof. An audit or test result
MUST be scoped to the exact commit, environment, and behavior it covers. A local
success, plan, build, or pull request MUST NOT be reported as live deployment or
production approval.

Rationale: Layered delivery preserves a working product while preventing weak
evidence from becoming an inaccurate release or safety claim.

## Product and Protocol Boundaries

- The preserved Hypersub material is an archive and reconstruction aid, not proof
  that the former SaaS application, backend, indexer, payment system, or media
  pipeline is recoverable.
- A crypto-only successor MAY be planned as a new product around existing public
  protocol deployments. Recurring card billing, creator identity, discovery,
  notifications, social automation, and durable media storage require separate
  requirements and approval.
- Deployment, production configuration, authenticated actions, chain writes,
  wallet signatures, and external communications require explicit authorization.
- Website moderation MAY remove offensive presentation from the website, but it
  MUST NOT silently mutate an immutable onchain record.
- Creator-provided media and metadata MUST have an explicit ownership, storage,
  permanence, and migration policy before being presented as durable.

## Development Workflow

- Substantive feature work MUST use the Spec Kit flow:
  `specify -> clarify -> plan -> checklist -> tasks -> analyze -> implement -> converge`.
  `clarify` and `checklist` MAY be omitted only when the feature's scope makes
  their absence clear in the artifacts.
- Requirements MUST be settled in a feature specification before implementation.
  Plans MUST identify affected principles, external dependencies, and the evidence
  required for each acceptance claim.
- Tasks MUST be dependency-ordered and MUST include validation tasks. The
  cross-artifact analysis MUST run after task generation and before implementation;
  convergence MUST run after implementation to identify remaining work.
- Source, local, browser, chain, authenticated production, and hardware evidence
  MUST be recorded separately when more than one evidence class is relevant.
- Dirty user work MUST be preserved. Scope changes, deployment, merge, push, and
  destructive cleanup MUST NOT be inferred from a request to implement or inspect.

## Governance

This constitution is the highest-level project governance document. When another
instruction conflicts with it, the conflict MUST be surfaced and resolved before
implementation. Every feature specification, plan, analysis, and convergence
report MUST check the applicable principles and record any approved deviation.

Amendments require a written rationale in the Sync Impact Report, an updated
semantic version, and current amendment date. Version changes follow semantic
versioning: MAJOR for incompatible governance or principle changes, MINOR for new
principles or materially expanded obligations, and PATCH for clarifications that
do not change obligations. A constitution amendment does not authorize application
code changes, deployment, or external coordination by itself.

The initial constitution is ratified for the Backed By Fans project on the date
below. Compliance is reviewed at the `analyze` and `converge` gates, and unresolved
violations MUST remain visible as tasks or explicitly approved exceptions.

**Version**: 2.0.0 | **Ratified**: 2026-08-31 | **Last Amended**: 2026-08-31
