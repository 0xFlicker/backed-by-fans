# Protocol and membership design pass

September 10, 2026. Local presentation changes; no contract changes or deployment.

## Design audit

Preserve the established paper/ink palette, Instrument Serif display type, Geist body type, creator artwork, route structure, navigation, and existing focus treatment. This is an editorial product refinement, not a new marketing site. The skill's stock imagery, new theme, and marketing-section prescriptions do not apply to these transaction surfaces.

Direction: variance 6, motion 3, density 2. Retire repeated eyebrows, explanatory warnings in the default view, prominent raw addresses, nested accounting cards, and competing operations. Keep actual errors and recovery actions functional.

## Changes

- Protocol: concise introduction alongside the operation control, prominent available/burned balances, expandable per-currency records and actions, collapsed history/funding/configuration.
- Membership: quieter status facts, compact purchase summary, reward mechanics and accounting behind disclosures, prominent claimable amounts.
- Technical addresses use the existing copy/explorer component. Native ETH is labeled instead of displaying a zero address.
- Catch-up links open the accounting disclosure before navigating to it.
- No added packages, decorative assets, animation, or transaction behavior changes.

## Verification

- 645 frontend tests pass; TypeScript and ESLint pass.
- Live protocol inspected on desktop and at 390px, including expanded records.
- Membership inspected using a temporary sample-data route rendering the real component. The prior review tier cannot satisfy the current minimum-payment interface. No fork state was changed; the temporary route and its generated type references were removed.
- Desktop period edit 1 to 12: purchase preview stayed at y=1685.8359375, height=160px.
- Mobile blank to 12: purchase preview stayed at y=1907.8046875, height=192px. No horizontal document overflow at 390px.
- These measurements cover the tested form states, not a universal CLS guarantee. No new signed wallet transaction was performed.
- Lighthouse on the live development protocol page: accessibility 100, CLS 0. Performance 45 (LCP 22.9s, total blocking time 2,960ms). This dev-server run is not production performance acceptance; no production Core Web Vitals claim is made. Report: `/tmp/bbf-design-lighthouse.json`.
