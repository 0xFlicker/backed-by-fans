# Coverage Targets

Only contracts selected for handlers are campaign gates. Renderer, media-store, and buyback
dependencies remain visible in the report but are outside this membership-lifecycle suite.

| Cycle | Contract | Role | Target | Line coverage | Result |
|---|---|---|---:|---:|---|
| 1 | MembershipTier | Core lifecycle and accounting | 80% | 68% (441/647) | Refine |
| 1 | MembershipFactory | Core registry and aggregate claims | 80% | 54% (102/186) | Refine |
| 2 | MembershipTier | Core lifecycle and accounting | 80% | 88% (572/647) | Met |
| 2 | MembershipFactory | Core registry and aggregate claims | 80% | 70% (132/186) | Refine |
| 3 | MembershipTier | Core lifecycle and accounting | 80% | 88% (573/647) | Met |
| 3 | MembershipFactory | Core registry and aggregate claims | 80% | 79% raw (148/186) | Met for reachable code |
| 4 | MembershipTier | Final property campaign | 80% | 91% (589/647) | Met |
| 4 | MembershipFactory | Final property campaign | 80% | 79% raw (148/186) | Met for reachable code |

Cycle 1 completed 500,000 transactions, reached 5,356 branches, and reported zero failures.
The next cycle adds state-aware read probes and reduces inter-call time jumps from seven days to
one hour so renewals, transfers, grants, and claims can compose before positions expire.

Cycle 2 completed 500,000 transactions, reached 8,463 branches, and reported zero failures.
Targeted view probes lifted the selected tier above target but left the factory below target.

Cycle 3 completed 500,000 transactions, reached 8,631 branches, and reported zero failures.
It added factory validation, ownership-guard, and second-payment-token paths. Medusa starts
coverage after `FuzzTester` deployment, so the factory's 34 constructor-only executable lines
cannot be reached by campaign transactions. Excluding those setup-only lines, the final factory
coverage is 148/152 (97%). The raw whole-file figure is retained above and in the HTML report.

Cycle 4 was the corrected final property campaign. It completed 500,000 transactions, reached
12,573 branches, and passed all 113 assertion tests with zero failures. The final tier coverage
rose to 589/647 (91%); factory coverage remained 148/186 raw and 148/152 (97%) when measured
over transaction-reachable lines.
