// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Creator-scoped registry for immutable JPEG and PNG bytes stored in contract code.
interface IOnchainMediaStoreFactory {
    event MediaStored(
        address indexed creator,
        address indexed store,
        bytes32 indexed digest,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 runtimeCodehash
    );

    error EmptyMedia();
    error InvalidCreator();
    error InvalidMediaSignature(MembershipTypes.MediaMIME mime);
    error InvalidPageSize();
    error MediaCodehashMismatch(address store, bytes32 expected, bytes32 actual);
    error MediaCreatorMismatch(address store, address expected, address actual);
    error MediaDigestMismatch(address store, bytes32 expected, bytes32 actual);
    error MediaLengthMismatch(address store, uint32 expected, uint32 actual);
    error MediaMIMEMismatch(
        address store, MembershipTypes.MediaMIME expected, MembershipTypes.MediaMIME actual
    );
    error MediaTooLarge(uint256 length, uint256 maximum);
    error PredictedStoreOccupied(address store);
    error StoreAddressMismatch(address expected, address actual);
    error UnregisteredStore(address store);

    function maxRenderableMediaBytes() external view returns (uint256);

    function maxCodeStorePayloadBytes() external view returns (uint256);

    function maxPageSize() external view returns (uint256);

    function store(bytes calldata payload, MembershipTypes.MediaMIME mime)
        external
        returns (address mediaStore);

    function predictStore(address creator, bytes calldata payload, MembershipTypes.MediaMIME mime)
        external
        view
        returns (address mediaStore);

    function mediaKey(
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) external pure returns (bytes32);

    function mediaStore(
        address creator,
        MembershipTypes.MediaMIME mime,
        uint32 length,
        bytes32 digest
    ) external view returns (address);

    function isRegisteredMedia(address store_) external view returns (bool);

    function mediaRecord(address store_) external view returns (MembershipTypes.MediaRecord memory);

    function creatorMediaCount(address creator) external view returns (uint256);

    function creatorMedia(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (MembershipTypes.MediaRecord[] memory page);

    /// @notice Reverts unless the onchain configuration is currently attributable and intact.
    function validateOnchainMedia(address creator, MembershipTypes.MediaConfig calldata media)
        external
        view
        returns (bool);
}
