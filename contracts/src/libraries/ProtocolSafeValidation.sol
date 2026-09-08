// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ISafe} from "../interfaces/external/ISafe.sol";

/// @notice Checks successor authority at nomination and acceptance. Safe signer rotation stays in Safe.
/// @dev Runtime hashes come from independently compiled canonical Safe 1.5.0 sources.
library ProtocolSafeValidation {
    address internal constant SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;
    address internal constant HANDLER = 0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    bytes32 private constant FALLBACK_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
    bytes32 private constant GUARD_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    error InvalidProtocolSafe(address candidate);

    function validate(address candidate) internal view {
        if (
            candidate.codehash != 0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f
                || SINGLETON.codehash
                    != 0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc
                || HANDLER.codehash
                    != 0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc
        ) revert InvalidProtocolSafe(candidate);
        ISafe account = ISafe(candidate);
        if (
            account.masterCopy() != SINGLETON
                || keccak256(bytes(account.VERSION())) != keccak256("1.5.0")
        ) revert InvalidProtocolSafe(candidate);
        address[] memory owners = account.getOwners();
        uint256 threshold = account.getThreshold();
        (address[] memory modules, address next) = account.getModulesPaginated(address(1), 1);
        if (
            owners.length == 0 || threshold == 0 || threshold > owners.length || modules.length != 0
                || next != address(1)
                || _slot(account, FALLBACK_SLOT) != bytes32(uint256(uint160(HANDLER)))
                || _slot(account, GUARD_SLOT) != bytes32(0)
        ) revert InvalidProtocolSafe(candidate);
    }

    function _slot(ISafe account, bytes32 location) private view returns (bytes32) {
        bytes memory value = account.getStorageAt(uint256(location), 1);
        if (value.length != 32) revert InvalidProtocolSafe(address(account));
        return abi.decode(value, (bytes32));
    }
}
