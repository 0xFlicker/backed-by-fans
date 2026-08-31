// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {ImmutableCodeStore} from "../ImmutableCodeStore.sol";
import {IOnchainMediaStoreFactory} from "../interfaces/IOnchainMediaStoreFactory.sol";
import {RendererPrimitives} from "../renderer/RendererPrimitives.sol";
import {MembershipTypes} from "../types/MembershipTypes.sol";
import {CodeStoreReader} from "./CodeStoreReader.sol";
import {ImageValidation} from "./ImageValidation.sol";

/// @notice Permissionless creator-scoped registry for immutable onchain raster media.
contract OnchainMediaStoreFactory is IOnchainMediaStoreFactory {
    uint256 public constant override maxCodeStorePayloadBytes = 98_303;
    uint256 public constant override maxRenderableMediaBytes =
        RendererPrimitives.MAX_RENDERABLE_MEDIA_BYTES;
    uint256 public constant override maxPageSize = 100;

    bytes32 private constant _MEDIA_SALT_DOMAIN = keccak256("BackedByFans.OnchainMediaStore.v1");

    struct StoredMedia {
        address creator;
        uint32 length;
        MembershipTypes.MediaMIME mime;
        bytes32 digest;
        bytes32 runtimeCodehash;
    }

    mapping(bytes32 key => address store_) private _mediaStores;
    mapping(address store_ => StoredMedia media) private _mediaRecords;
    mapping(address creator => address[] stores) private _creatorMedia;

    /// @inheritdoc IOnchainMediaStoreFactory
    function store(bytes calldata payload, MembershipTypes.MediaMIME mime)
        external
        override
        returns (address store_)
    {
        _validatePayload(payload, mime);

        uint32 payloadLength = uint32(payload.length);
        bytes32 digest = keccak256(payload);
        bytes32 key = _mediaKey(msg.sender, mime, payloadLength, digest);
        store_ = _mediaStores[key];

        if (store_ != address(0)) {
            StoredMedia storage existing = _mediaRecords[store_];
            _validateRecord(store_, existing, msg.sender, mime, payloadLength, digest);
            CodeStoreReader.readAndValidate(
                store_, existing.length, existing.digest, existing.runtimeCodehash
            );
            return store_;
        }

        address predicted = _predictStore(key, payload);
        if (predicted.code.length != 0) revert PredictedStoreOccupied(predicted);

        store_ = address(new ImmutableCodeStore{salt: key}(payload));
        if (store_ != predicted) revert StoreAddressMismatch(predicted, store_);

        bytes32 runtimeCodehash;
        assembly ("memory-safe") {
            runtimeCodehash := extcodehash(store_)
        }
        CodeStoreReader.readAndValidate(store_, payloadLength, digest, runtimeCodehash);

        _mediaRecords[store_] = StoredMedia({
            creator: msg.sender,
            length: payloadLength,
            mime: mime,
            digest: digest,
            runtimeCodehash: runtimeCodehash
        });
        _mediaStores[key] = store_;
        _creatorMedia[msg.sender].push(store_);

        emit MediaStored(msg.sender, store_, digest, mime, payloadLength, runtimeCodehash);
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function predictStore(address creator, bytes calldata payload, MembershipTypes.MediaMIME mime)
        external
        view
        override
        returns (address store_)
    {
        if (creator == address(0)) revert InvalidCreator();
        _validatePayload(payload, mime);
        bytes32 key = _mediaKey(creator, mime, uint32(payload.length), keccak256(payload));
        store_ = _predictStore(key, payload);
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function mediaKey(
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) external pure override returns (bytes32) {
        if (creator == address(0)) revert InvalidCreator();
        return _mediaKey(creator, mime, length, digest);
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function mediaStore(
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) external view override returns (address) {
        return _mediaStores[_mediaKey(creator, mime, length, digest)];
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function isRegisteredMedia(address store_) external view override returns (bool) {
        return _mediaRecords[store_].creator != address(0);
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function mediaRecord(address store_)
        external
        view
        override
        returns (MembershipTypes.MediaRecord memory)
    {
        StoredMedia storage stored = _mediaRecords[store_];
        if (stored.creator == address(0)) revert UnregisteredStore(store_);
        return _publicRecord(store_, stored);
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function creatorMediaCount(address creator) external view override returns (uint256) {
        return _creatorMedia[creator].length;
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function creatorMedia(address creator, uint256 offset, uint256 limit)
        external
        view
        override
        returns (MembershipTypes.MediaRecord[] memory page)
    {
        if (limit > maxPageSize) revert InvalidPageSize();

        address[] storage stores = _creatorMedia[creator];
        if (limit == 0 || offset >= stores.length) {
            return new MembershipTypes.MediaRecord[](0);
        }

        uint256 end = offset + limit;
        if (end > stores.length) end = stores.length;
        page = new MembershipTypes.MediaRecord[](end - offset);
        for (uint256 index; index < page.length; ++index) {
            address store_ = stores[offset + index];
            page[index] = _publicRecord(store_, _mediaRecords[store_]);
        }
    }

    /// @inheritdoc IOnchainMediaStoreFactory
    function validateOnchainMedia(address creator, MembershipTypes.MediaConfig calldata media)
        external
        view
        override
        returns (bool)
    {
        if (creator == address(0)) revert InvalidCreator();
        if (media.store == address(0)) revert UnregisteredStore(address(0));

        StoredMedia storage stored = _mediaRecords[media.store];
        if (stored.creator == address(0)) revert UnregisteredStore(media.store);
        if (stored.creator != creator) {
            revert MediaCreatorMismatch(media.store, creator, stored.creator);
        }
        if (stored.mime != media.mime) {
            revert MediaMIMEMismatch(media.store, stored.mime, media.mime);
        }
        if (stored.length != media.length) {
            revert MediaLengthMismatch(media.store, stored.length, media.length);
        }
        if (stored.digest != media.digest) {
            revert MediaDigestMismatch(media.store, stored.digest, media.digest);
        }
        if (stored.runtimeCodehash != media.runtimeCodehash) {
            revert MediaCodehashMismatch(media.store, stored.runtimeCodehash, media.runtimeCodehash);
        }

        CodeStoreReader.readAndValidate(
            media.store, media.length, media.digest, media.runtimeCodehash
        );
        return true;
    }

    function _validatePayload(bytes calldata payload, MembershipTypes.MediaMIME mime) private pure {
        uint256 length = payload.length;
        if (length == 0) revert EmptyMedia();
        if (length > maxRenderableMediaBytes) {
            revert MediaTooLarge(length, maxRenderableMediaBytes);
        }

        if (!ImageValidation.isValid(payload, mime)) revert InvalidMediaSignature(mime);
    }

    function _validateRecord(
        address store_,
        StoredMedia storage stored,
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) private view {
        if (stored.creator == address(0)) revert UnregisteredStore(store_);
        if (stored.creator != creator) {
            revert MediaCreatorMismatch(store_, creator, stored.creator);
        }
        if (stored.mime != mime) revert MediaMIMEMismatch(store_, stored.mime, mime);
        if (stored.length != length) revert MediaLengthMismatch(store_, stored.length, length);
        if (stored.digest != digest) revert MediaDigestMismatch(store_, stored.digest, digest);
    }

    function _publicRecord(address store_, StoredMedia storage stored)
        private
        view
        returns (MembershipTypes.MediaRecord memory)
    {
        return MembershipTypes.MediaRecord({
            store: store_,
            creator: stored.creator,
            mime: stored.mime,
            length: stored.length,
            digest: stored.digest,
            runtimeCodehash: stored.runtimeCodehash
        });
    }

    function _mediaKey(
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(_MEDIA_SALT_DOMAIN, creator, mime, length, digest));
    }

    function _predictStore(bytes32 salt, bytes calldata payload)
        private
        view
        returns (address predicted)
    {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(ImmutableCodeStore).creationCode, abi.encode(payload))
        );
        predicted = Create2.computeAddress(salt, initCodeHash, address(this));
    }
}
