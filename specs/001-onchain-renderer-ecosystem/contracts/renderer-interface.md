# Renderer Interface Contract

Custom renderers implement the existing `BackedByFans.MembershipRenderer.v1` interface. This
document describes the public behavior; generated ABI bindings remain sourced from Foundry.

## Required methods

```solidity
interface IMembershipRenderer {
    function rendererSchema() external pure returns (bytes32);
    function rendererName() external pure returns (string memory);
    function engineCount() external pure returns (uint16);
    function engineName(uint16 engine) external pure returns (string memory);

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata media
    ) external view;

    function previewSVG(MembershipTypes.PreviewContext calldata context)
        external view returns (string memory rawSVG);

    function previewTokenURI(MembershipTypes.PreviewContext calldata context)
        external view returns (string memory tokenURI);

    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external view returns (string memory tokenURI);
}
```

## Input behavior

- `PreviewContext.token` is the same membership data shape used by production rendering.
- `PreviewContext.nativeMedia` is empty or contains browser-processed JPEG/PNG bytes for a read-only
  preview. The browser may include those bytes in canonical-RPC calldata.
- `renderTokenURI` receives an onchain `MediaConfig`; a renderer that uses media reads it from the
  configured onchain store.
- Renderers may crop, filter, recolor, transform, mask, combine, or ignore supplied image bytes.
- Representative contexts use token IDs 1, 7, and 42 and cover active/expired plus supported
  image/no-image modes.

## Output behavior

- `previewSVG` returns a complete displayable SVG document.
- `previewTokenURI` and `renderTokenURI` return a complete metadata data URI whose `image` is
  displayable by the product.
- A revert, timeout, empty return, malformed data URI, or response without a displayable image is a
  failed example shown to the creator.
- The platform does not certify aesthetics or prove preservation of source-image bytes.

## Direct-address behavior

- Runtime identity is `(canonicalChainId, rendererAddress)`.
- Tier creation stores a direct renderer address and does not require a renderer version or registry
  entry.
- The address must contain code when the tier is created.
- Pasting an address never installs or executes a third-party AI skill.
