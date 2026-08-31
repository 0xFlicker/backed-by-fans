// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Domain-separated identity derivation for creator-approved tier artwork.
library TierIdentity {
    bytes32 private constant _TIER_IDENTITY_DOMAIN = keccak256("BackedByFans.TierIdentity.v1");

    function derive(address factory, address creator, bytes32 tierSalt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(_TIER_IDENTITY_DOMAIN, factory, creator, tierSalt));
    }
}
