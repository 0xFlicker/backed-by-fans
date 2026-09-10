// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Loads tier creation code from separately deployed immutable bytecode stores.
/// @dev The bound factory may deploy tiers, but this contract has no owner or tier authority.
contract MembershipTierDeployer {
    uint256 private constant _RUNTIME_LIMIT = 24_576;

    address public immutable factory;
    address public immutable creationCodeStoreA;
    address public immutable creationCodeStoreB;
    uint256 public immutable tierCreationCodeLength;
    bytes32 public immutable tierCreationCodeHash;
    bytes32 public immutable creationCodeStoreAHash;
    bytes32 public immutable creationCodeStoreBHash;

    error CreationCodeCorrupted();
    error CreationCodeTooLarge();
    error DeploymentFailed();
    error InvalidAddress();
    error OnlyFactory();

    constructor(address factory_, MembershipTypes.TierCodeConfig memory tierCode) {
        if (factory_ == address(0)) revert InvalidAddress();
        factory = factory_;
        uint256 codeLength = tierCode.creationCodeLength;
        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;
        if (codeLength < 2 || firstLength + 1 > _RUNTIME_LIMIT || secondLength + 1 > _RUNTIME_LIMIT)
        {
            revert CreationCodeTooLarge();
        }
        address firstStore = tierCode.storeA;
        address secondStore = tierCode.storeB;
        if (
            firstStore.code.length != firstLength + 1 || secondStore.code.length != secondLength + 1
        ) {
            revert CreationCodeCorrupted();
        }
        bytes memory creationCode = new bytes(codeLength);
        uint256 prefixes;
        assembly ("memory-safe") {
            extcodecopy(firstStore, 0, 0, 1)
            prefixes := byte(0, mload(0))
            extcodecopy(secondStore, 0, 0, 1)
            prefixes := or(prefixes, byte(0, mload(0)))
            extcodecopy(firstStore, add(creationCode, 32), 1, firstLength)
            extcodecopy(secondStore, add(add(creationCode, 32), firstLength), 1, secondLength)
        }
        if (prefixes != 0 || keccak256(creationCode) != tierCode.creationCodeHash) {
            revert CreationCodeCorrupted();
        }
        creationCodeStoreA = firstStore;
        creationCodeStoreB = secondStore;
        creationCodeStoreAHash = firstStore.codehash;
        creationCodeStoreBHash = secondStore.codehash;
        tierCreationCodeLength = codeLength;
        tierCreationCodeHash = tierCode.creationCodeHash;
    }

    function deploy(MembershipTypes.TierConfig calldata config) external returns (address tier) {
        if (msg.sender != factory) revert OnlyFactory();

        address firstStore = creationCodeStoreA;
        address secondStore = creationCodeStoreB;
        if (
            firstStore.codehash != creationCodeStoreAHash
                || secondStore.codehash != creationCodeStoreBHash
        ) {
            revert CreationCodeCorrupted();
        }
        uint256 codeLength = tierCreationCodeLength;
        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;

        bytes memory constructorArgs = abi.encode(factory, IERC20(config.paymentToken), config);
        bytes memory initCode = new bytes(codeLength + constructorArgs.length);
        bytes32 reconstructedHash;
        assembly ("memory-safe") {
            let data := add(initCode, 0x20)
            extcodecopy(firstStore, data, 1, firstLength)
            extcodecopy(secondStore, add(data, firstLength), 1, secondLength)
            reconstructedHash := keccak256(data, codeLength)
            mcopy(add(data, codeLength), add(constructorArgs, 0x20), mload(constructorArgs))
        }
        if (reconstructedHash != tierCreationCodeHash) revert CreationCodeCorrupted();

        assembly ("memory-safe") {
            tier := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (tier == address(0)) {
            assembly {
                if returndatasize() {
                    let pointer := mload(0x40)
                    returndatacopy(pointer, 0, returndatasize())
                    revert(pointer, returndatasize())
                }
            }
            revert DeploymentFailed();
        }
    }
}
