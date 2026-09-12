# Foundation — T003–T008

Added lifecycle value types, indexed expiration heap, historical-boundary ledger advancement, permanent weight removal, exact retired-owner credit and withdrawal primitives. Extended the independent lifecycle model using absolute interval/expiry scans and eager reward distribution without production accounting/heap dependencies.

Red evidence: ExpirationSchedule import failed before its implementation; ledger harness advanceTo missing before ledger implementation; PositionBook missing before independent model implementation.

Green evidence on the feature working tree:
- ExpirationSchedule: 4/4, including 256 randomized scan comparisons, indexed updates/removals and deterministic ties.
- VestingLedger: 6/6, including historical retirement fractions and complete funding tails; existing cancellation fuzz remains 256 runs.
- MembershipModel: 8/8, including 256 delayed/frequent comparisons.
- VestingScheduler: 10/10; existing MembershipIdentity baseline: 6/6. These latter tests intentionally describe pre-tier-integration behavior and will be replaced in their owning phases.
- Linked leaf/consumer build passes. During parallel model test authoring, the full build temporarily excluded the intentionally red new model test; the model subsequently compiled and passed independently with the same current mapping.
- Existing LinkedVestingFixture, VestingFixtures and MembershipTierHarness remain compatible with these primitives; no fixture change is necessary yet. Identity/ledger tests exercise the exact newly linked library deployment.

Commands use the manifest-derived mapping, robinhood profile, and existing test-only `--code-size-limit 1000000 --gas-limit 1000000000` allowances where needed. Findings about production gas/bytecode remain deferred to T064/T065. Foundry signature-cache warnings do not affect successful checks. No browser or production evidence is claimed.
