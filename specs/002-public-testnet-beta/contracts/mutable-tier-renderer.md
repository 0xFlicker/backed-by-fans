# Contract: Mutable Tier Presentation

This contract gives the current tier owner control over membership artwork while preserving payment
terms, membership state, and accounting.

## Tier interface

```solidity
event PresentationUpdated(
    address indexed previousRenderer,
    address indexed newRenderer,
    bytes32 previousArtHash,
    bytes32 newArtHash,
    bytes32 previousMediaHash,
    bytes32 newMediaHash
);

function renderer() external view returns (address);
function artConfig() external view returns (MembershipTypes.ArtConfig memory);
function mediaConfig() external view returns (MembershipTypes.MediaConfig memory);

function setPresentation(
    address newRenderer,
    MembershipTypes.ArtConfig calldata newArt,
    MembershipTypes.MediaConfig calldata newMedia
) external;
```

The pre-release `setRenderer` mutation is removed rather than retained as a second update path.
Renderer-only changes use `setPresentation` with the currently stored art and media values.

## Authorization

- `setPresentation` is restricted by the tier's existing `onlyOwner` check.
- The initial tier creator remains the initial owner.
- After a completed `Ownable2Step` transfer, only the accepted current owner can update presentation.
- A pending owner, former owner, credential owner, factory owner, renderer deployer, and protocol fee
  recipient have no presentation-update authority unless they are also the current tier owner.
- Pause state does not change presentation authority.

## Proposed-presentation validation

Before changing storage, `setPresentation` must:

1. reject a zero renderer;
2. reject a renderer without deployed code;
3. call `rendererSchema()` and require the same schema exposed by the tier's factory;
4. validate `newMedia` using the same canonical media shape, store provenance, runtime-codehash, length,
   and digest rules used at tier creation;
5. call the renderer's `validateConfiguration(newArt, newMedia)` using the complete proposed values;
6. bubble a useful renderer validation reason when one is returned, otherwise use the tier's explicit
   renderer, schema, art, or media error.

The operation does not require a `RendererRegistry` entry, creator provenance record, platform list,
runtime codehash match for the renderer, or platform aesthetic approval.

All validation happens before assignment. Any revert therefore preserves the previous renderer, art,
and media together.

## Successful update

After validation:

1. capture hashes of the previous art and media configuration;
2. store `newRenderer`, `newArt`, and `newMedia` atomically;
3. emit `PresentationUpdated` with previous/new renderer addresses and configuration hashes;
4. if `totalMinted > 0`, emit the existing ERC-4906 `BatchMetadataUpdate(1, totalMinted)` event.

Every subsequent `tokenURI(tokenId)` call reads the current stored presentation and passes the tier
name, description, external URI, identity, token ID, expiration, and active state it uses today.

Submitting values identical to the stored presentation is a no-op and emits no metadata refresh.

## Image lifecycle

- Selecting an already deployed creator image stores its validated `MediaConfig` in the presentation
  update and requires no new media deployment.
- Removing an image stores the canonical empty `MediaConfig`.
- Changing image fit, focal point, scale, or renderer-specific image treatment updates `ArtConfig`.
- A new local image is first deployed through the existing `OnchainMediaStoreFactory` wallet flow.
  Its returned store configuration is then supplied to `setPresentation`.
- If media deployment succeeds but `setPresentation` is canceled, replaced, or reverted, the tier's
  previous presentation remains active and the new media store remains reusable.

## State-preservation postcondition

For a successful presentation update, these values must remain byte-for-byte or numerically unchanged
except for ordinary independent transactions:

- factory and tier identity;
- owner and pending owner;
- payment token and raw price;
- period, reward, referral, and protocol fee rates;
- supply cap, prepaid maximum, occupied supply, and total minted;
- token ownership and membership time;
- referral choices, shares, reward indexes, and claimable amounts;
- creator proceeds, reserves, and liabilities;
- paused state;
- tier name, symbol, description, and external URI.

The renderer, art configuration, and media configuration are the only mutable presentation values.

## Browser management contract

The creator management page:

- displays a compact current-artwork summary and an `Edit artwork` action;
- opens `/chains/{chainId}/tiers/{tierAddress}/manage/artwork` as a dedicated full-width page;
- initializes the complete Creator Studio from the tier's current renderer, engine, art configuration,
  media configuration, and selected onchain image;
- offers all engines exposed by the selected renderer, all applicable art controls, the owner's
  registry-deployed renderers, the default renderer, and a direct Custom address;
- supports selecting an existing onchain image, uploading and deploying a new image, removing the
  image, and changing every supported placement or sizing control;
- previews representative token IDs in active and afterglow states without locking controls after an
  RPC or renderer failure;
- says plainly that saving changes artwork for all existing and future membership tokens;
- lets the owner make the final aesthetic decision without platform approval, proof, or certification
  language;
- sequences a new media deployment before the presentation update only when required;
- submits wallet writes through the established wagmi/viem transaction lifecycle;
- refreshes tier presentation reads only after a supplied successful receipt.

If ownership changes while the page is open, the onchain owner check remains authoritative. A revert
refreshes the management snapshot and leaves the previous presentation visible.

## Required tests

- Initial renderer, art, and media read exactly as published.
- The dedicated artwork route restores the complete current studio state.
- Every engine exposed by the canonical renderer can be selected and previewed.
- Every art control can be changed, previewed, saved, and read back.
- Current owner can replace the complete presentation with an unregistered compatible renderer.
- Non-owner, credential owner, pending owner, and former owner cannot update presentation.
- Accepted two-step ownership transfer moves presentation-update authority.
- Zero, EOA, wrong-schema, reverting-schema, invalid-media, and configuration-rejecting proposals
  preserve the complete old presentation.
- Successful update emits exact old/new renderer and configuration identities plus the correct
  metadata refresh range.
- A tier with no minted credentials updates without an invalid `1..0` refresh event.
- Existing active, expired, and synchronized credentials use the new presentation on their next
  `tokenURI` read.
- Existing-image selection, new-image deployment, image removal, fit, focal point, and sizing changes
  are independently covered.
- A successful media deployment followed by a failed tier update leaves the old presentation active
  and the media reusable.
- The complete economic, accounting, identity, ownership, and membership snapshot remains unchanged.
- Renderer RPC or preview failure restores usable studio controls.
- Wallet cancellation, replacement, revert, and successful receipt behavior use existing transaction
  state handling rather than custom polling.
