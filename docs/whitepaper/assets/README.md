# Whitepaper artwork

- `cover.png`: original generated cover artwork, 1024 × 1536. The upper space is reserved for the title during PDF layout.
- `membership-timeline.svg`: Figure 1, separate access, NFT custody and reward-weight states across live transfer, expiry, delayed maintenance and fresh return. Weight removal takes effect at expiry; custody ends when maintenance burns the old NFT. Event spacing is not a duration scale.
- `payment-flow.svg`: Figure 2, the draft's 100-unit, 30-day example shown halfway through the funded period. Percentages are illustrative.
- `reward-weight.svg`: Figure 3, an illustrative 1.5× starting boost tapering to 1× at 1,000 payment units. It plots marginal weight, not accumulated weight. Payment examples use six-decimal units and normalize shares to that same display scale: the first 100 units add 147.5 shares; 100 units after the threshold add 100 shares.

SVGs include accessible titles/descriptions and use portable Arial/Helvetica text. Keep them vector when rendering the PDF. Rebuild with `python3 docs/whitepaper/build_diagrams.py`; no third-party Python packages are required.

Palette follows the project brand direction: warm paper, charcoal, lime, and violet. The cover also uses coral. These assets do not establish token launch or deployment status.
