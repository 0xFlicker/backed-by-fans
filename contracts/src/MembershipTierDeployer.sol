// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ImmutableCodeStore} from "./ImmutableCodeStore.sol";
import {MembershipTier} from "./MembershipTier.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Isolates full membership-tier creation code from the factory runtime.
/// @dev The bound factory may deploy tiers, but this contract has no owner or tier authority.
contract MembershipTierDeployer {
    uint256 private constant _RUNTIME_LIMIT = 24_576;

    address public immutable factory;
    address public immutable renderer;
    address public immutable creationCodeStoreA;
    address public immutable creationCodeStoreB;
    uint256 public immutable tierCreationCodeLength;
    bytes32 public immutable tierCreationCodeHash;

    error CreationCodeCorrupted();
    error CreationCodeTooLarge();
    error DeploymentFailed();
    error InvalidAddress();
    error OnlyFactory();

    constructor(address factory_, address renderer_) {
        if (factory_ == address(0) || renderer_ == address(0)) revert InvalidAddress();
        factory = factory_;
        renderer = renderer_;

        bytes memory creationCode = type(MembershipTier).creationCode;
        uint256 codeLength = creationCode.length;
        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;
        if (firstLength + 1 > _RUNTIME_LIMIT || secondLength + 1 > _RUNTIME_LIMIT) {
            revert CreationCodeTooLarge();
        }

        bytes memory firstChunk = new bytes(firstLength);
        bytes memory secondChunk = new bytes(secondLength);
        assembly ("memory-safe") {
            mcopy(add(firstChunk, 0x20), add(creationCode, 0x20), firstLength)
            mcopy(add(secondChunk, 0x20), add(add(creationCode, 0x20), firstLength), secondLength)
        }

        creationCodeStoreA = address(new ImmutableCodeStore(firstChunk));
        creationCodeStoreB = address(new ImmutableCodeStore(secondChunk));
        tierCreationCodeLength = codeLength;
        tierCreationCodeHash = keccak256(creationCode);
    }

    function deploy(IERC20 paymentToken, MembershipTypes.TierConfig calldata config)
        external
        returns (address tier)
    {
        if (msg.sender != factory) revert OnlyFactory();

        address firstStore = creationCodeStoreA;
        address secondStore = creationCodeStoreB;
        uint256 codeLength = tierCreationCodeLength;
        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;

        bytes memory constructorArgs = abi.encode(factory, paymentToken, renderer, config);
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
