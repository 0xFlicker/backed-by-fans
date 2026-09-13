# Whitepaper evidence — T060–T061

Updated whitepaper/outline and generated figures describe whole-position live transfers, no checkpoint prerequisite including pause, permanent expiry, current-owner retired credit and fresh token IDs/current-curve weight. `python3 docs/whitepaper/build_diagrams.py` and `cd web && bun run whitepaper:build` passed. Chromium required execution outside the filesystem sandbox; rendering used only local Markdown, assets and fonts.

The tagged A4 PDF has 11 pages. Rendered every page to PNG with `pdftoppm -scale-to 1100 -png`; directly inspected changed lifecycle figure/page 4, reward-weight figure/page 8 and source-reference page 11. Text and diagrams are legible, within page bounds, with no overlaps or clipped labels. PDF text extraction confirms the new lifecycle and no obsolete restoration promises.

The builder records uncommitted contract/spec source SHA-256 plus base revision and prints local reference paths for a draft. It only creates revision-specific remote links when those sources are committed; it does not misrepresent current code as the older base commit. PDF: `web/public/backed-by-fans-whitepaper.pdf`; build log `/tmp/bbf-whitepaper-build.log`; scratch renders `/tmp/bbf-whitepaper-page-*.png`.

This is document rendering/visual inspection evidence, not application browser or deployed-contract evidence.
