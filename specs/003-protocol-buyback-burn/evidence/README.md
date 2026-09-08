# Retained implementation evidence

Reviewed dependency inputs, independent source-verification results, final review
and acceptance summaries, and the complete local-verification log are committed.
Generated run directories remain on the implementation machine, including full
receipts, manifests, artifact hashes, successful browser traces and screenshots.
They are intentionally ignored by Git; a fresh clone does not contain those raw
run artifacts.

Follow [the operator quickstart](../quickstart.md) to generate two new complete
runs and independently reconcile their artifacts. This requires private archive
access to the recorded origin, local test keys and loopback execution. It does not
require a mainnet transaction. The summary is a record of executed verification,
not a substitute for the raw artifacts required by the verifier.

Historical failed and partial runs are preserved locally and remain distinguished
from the final accepted pair. No generated directory is silently promoted or
overwritten. Evidence is excluded from the source snapshot so outputs cannot
change the identity of the source they measure.
