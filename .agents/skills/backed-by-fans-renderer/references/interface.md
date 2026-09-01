# Renderer interface

Read this before editing the Solidity interface or deciding how a renderer uses membership media.

## Canonical source

The standalone source of truth is bundled in:

- `template/src/interfaces/IMembershipRenderer.sol`
- `template/src/types/MembershipTypes.sol`

Compile the renderer with Foundry and let `scripts/build-package.ts` copy the generated artifact ABI into the browser package. Do not maintain another handwritten ABI.

## Required calls

Every renderer implements schema `BackedByFans.MembershipRenderer.v1` and these methods:

```solidity
function rendererSchema() external pure returns (bytes32);
function rendererName() external pure returns (string memory);
function engineCount() external pure returns (uint16);
function engineName(uint16 engine) external pure returns (string memory);
function validateConfiguration(ArtConfig calldata art, MediaConfig calldata media) external view;
function previewSVG(PreviewContext calldata context) external view returns (string memory);
function previewTokenURI(PreviewContext calldata context) external view returns (string memory);
function renderTokenURI(TokenRenderData calldata data) external view returns (string memory);
```

`rendererSchema()` returns `keccak256("BackedByFans.MembershipRenderer.v1")`.

Mechanical compatibility means:

- the required methods exist;
- requested engine indexes are handled;
- configuration validation either returns or reverts clearly;
- `previewSVG` returns a complete SVG document;
- token URI methods return metadata containing a displayable image;
- rendering calls are read-only.

These checks do not establish that a renderer is safe, permanent, aesthetically successful, faithful to an art brief, or desirable. The creator judges the displayed results.

## Inputs

`TokenRenderData` contains tier text, tier identity, art controls, media configuration, token ID, expiration, and active state. Representative previews use tokens 1, 7, and 42 across active and expired states.

`PreviewContext.nativeMedia` may contain browser-selected JPEG or PNG bytes for an RPC preview. It may also be empty. When bytes are supplied, `TokenRenderData.media` identifies their MIME type, byte length, and digest; its store and runtime code hash are zero because the preview image has not been written onchain. A renderer should reject contradictory metadata clearly.

`MediaConfig` identifies permanent same-chain media for production rendering. Generated-only renderers may ignore media. Other renderers may crop, filter, recolor, mask, combine, reinterpret, or otherwise transform it.

When the creator asks to use an image, test with that actual image in `/render` and make its treatment visible enough for the creator to judge. Do not substitute an empty image slot and call the image design approved.

Do not require exact output-byte, palette, dimension, encoding, or recognizability preservation.

## Reuse

A renderer is reused as its contract address on Robinhood testnet (chain ID 46630). The membership Creator Studio calls that address directly. The optional registry helps the connected creator rediscover renderers they deployed; it is not a platform listing, compatibility approval, cross-chain lookup, or installer for third-party agent instructions.
