# Cancellation and refill accessibility (T049)

## Browser evidence

Chromium desktop journeys exercise native labeled fields, semantic regions, status/error messages and keyboard activation. The cancellation confirmation checkbox is focused and toggled with Space; Tab reaches the cancel button and Enter submits the actual onchain action. The refill target field tabs past its disabled locked-referral field to Update refill target, with a visible focus ring.

- Cancellation: `artifacts/protocol-fork/feature006-refill-20260923a/browser-controls3/` approved-operator journey passed, including 390×844 axe and overflow checks.
- Refill: `artifacts/protocol-fork/feature006-refill-20260923a/browser-controls4/` shared-coverage journey passed at 390×844 and 768×1024, with zero scoped axe violations and no horizontal page overflow. Both full-page screenshots were visually inspected. Controls stack on the phone, text/addresses wrap, and target/stop actions precede payment approval controls.
- Desktop browser base viewport: Playwright Desktop Chrome, 1280×720. Transaction, keyboard and state assertions also run at that size.

Component tests cover unavailable reads, visible stale cached values with disabled mutations, pending actions, generic stopped state, unsaved target changes, local expiration and ownership/selection invalidation. An obsolete in-flight review cannot leave the form busy or overwrite a changed selection. Whole-period collection is separate from fractional balance/allowance estimates; unlimited allowance has a concise label.

Scope: automated Chromium/axe, keyboard action checks and visual inspection of retained screenshots. No claim of manual screen-reader, physical-device or exhaustive cross-browser accessibility certification.

## Fresh post-recovery acceptance

`feature006-gate-20260923e` passes all six cancellation/refill desktop journeys, including their keyboard, scoped axe and overflow assertions. The current 390×844 and 768×1024 full-page refill screenshots were visually inspected: fields and controls remain within the viewport, wallet allowance actions remain distinct from position enrollment, and focused target controls remain visible. Screenshots are retained under `artifacts/protocol-fork/feature006-gate-20260923e/browser/test-results/periodic-refill--anvil-sha-a7b8d-ontrols-preserve-enrollment-desktop/`. This refresh supersedes the older candidate for these scenarios; the full browser gate is recorded separately in local-verification.md.
