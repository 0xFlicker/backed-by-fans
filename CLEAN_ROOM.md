# Clean-room boundary

Backed By Fans is an original MIT-licensed implementation. The recovered
Hypersub and STP archive is research evidence, not an implementation base.

## Permitted inputs

Protocol code may be informed only by:

- the approved Backed By Fans requirements and implementation plan;
- public EIPs and their published interface signatures;
- official Robinhood Chain and USDG documentation;
- freshly installed, tagged dependencies with compatible licenses; and
- original project-authored designs, source, tests, and documentation.

Public product presentation may also follow the provisional Backed By Fans
brand direction. Brand material does not define contract behavior.

## Prohibited inputs

Do not read, copy, adapt, import, translate, or mechanically reproduce recovered
archive source, tests, comments, helpers, storage layouts, or generated output.
No contract, test, script, or build configuration may resolve an import through
an archive path. Similar behavior must be implemented independently from the
approved requirements and public standards.

If provenance is uncertain, stop and replace the material with an independently
authored implementation before continuing. Record new third-party dependencies,
their exact release and commit, and their license in
[`contracts/DEPENDENCIES.md`](contracts/DEPENDENCIES.md).

## Automated gate

From `contracts/`, run:

```sh
./scripts/check-clean-room.sh
```

The gate rejects archive imports and project-authored Solidity without an MIT
SPDX identifier. It complements review; it cannot prove independent authorship.
