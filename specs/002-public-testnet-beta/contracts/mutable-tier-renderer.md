# Contract: Mutable Tier Renderer

This contract changes presentation authority only. Payment terms, membership state, art configuration,
and media configuration remain unchanged.

## Tier interface

```solidity
event RendererUpdated(address indexed previousRenderer, address indexed newRenderer);

function renderer() external view returns (address);

function setRenderer(address newRenderer) external;
```

`renderer()` keeps the existing ABI shape but reads owner-controlled storage rather than an immutable.

## Authorization

- `setRenderer` is restricted by the tier's existing `onlyOwner` check.
- The initial tier creator remains the initial owner.
- After a completed `Ownable2Step` transfer, only the accepted current owner can update the renderer.
- A pending owner, former owner, credential owner, factory owner, renderer deployer, and protocol fee
  recipient have no renderer-update authority unless they are also the current tier owner.
- Pause state does not change presentation authority.

## Candidate validation

Before changing storage, `setRenderer` must:

1. reject the zero address;
2. reject an address without deployed code;
3. call `rendererSchema()` and require the same schema exposed by the tier's factory;
4. call `validateConfiguration` with the tier's currently stored `ArtConfig` and `MediaConfig`;
5. bubble a useful renderer validation reason when one is returned, otherwise use the tier's explicit
   invalid-renderer/schema error.

The operation does not require a `RendererRegistry` entry, creator provenance record, platform list,
runtime codehash match, or platform aesthetic approval.

All validation happens before assignment. Any revert therefore preserves the previous renderer.

## Successful update

After validation:

1. store `newRenderer`;
2. emit `RendererUpdated(previousRenderer, newRenderer)`;
3. if `totalMinted > 0`, emit the existing ERC-4906
   `BatchMetadataUpdate(1, totalMinted)` event.

Every subsequent `tokenURI(tokenId)` call reads the current stored renderer and passes the same tier
name, description, external URI, identity, art, media, token ID, expiration, and active state it uses
today.

## State-preservation postcondition

For a successful renderer update, these values must be byte-for-byte or numerically unchanged except
for ordinary independent transactions:

- factory and tier identity;
- owner and pending owner;
- payment token and raw price;
- period, reward, referral, and protocol fee rates;
- supply cap, prepaid maximum, occupied supply, and total minted;
- token ownership and membership time;
- referral choices, shares, reward indexes, and claimable amounts;
- creator proceeds, reserves, and liabilities;
- paused state;
- tier name, symbol, description, and external URI;
- art and media configuration.

## Browser management contract

The creator management page:

- displays the current renderer with copy-on-click treatment;
- offers the owner's registry-deployed renderers first, then the default set, then Custom address, in
  the same normal selector language as creation;
- previews a candidate using the tier's stored art/media and representative membership states;
- shows rendering failures without locking the rest of management;
- says plainly that updating changes artwork for all existing and future membership tokens;
- lets the owner make the final aesthetic decision without platform “approval,” proof, or
  certification language;
- submits `setRenderer` through the established wagmi/viem transaction lifecycle;
- refreshes tier/renderer reads only after a supplied successful receipt.

If ownership changes while the page is open, the onchain owner check remains authoritative. A revert
refreshes the management snapshot and leaves the previous renderer visible.

## Required tests

- Initial renderer reads exactly as before.
- Current owner can replace it with an unregistered compatible direct address.
- Non-owner, credential owner, pending owner, and former owner cannot replace it.
- Accepted two-step ownership transfer moves renderer-update authority.
- Zero, EOA, wrong-schema, reverting-schema, and configuration-rejecting candidates preserve the old
  renderer.
- Successful update emits exact old/new addresses and the correct metadata refresh range.
- A tier with no minted credentials updates without an invalid `1..0` refresh event.
- Existing active and expired credentials use the new renderer on their next `tokenURI` read.
- Art/media and the complete economic/accounting snapshot are unchanged.
- A renderer RPC/preview failure restores usable management controls.
- Wallet cancellation, replacement, revert, and successful receipt behavior use existing transaction
  state handling rather than custom polling.
