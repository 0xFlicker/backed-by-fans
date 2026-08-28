// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {MembershipFactory} from "./MembershipFactory.sol";
import {OnchainMetadataRenderer} from "./OnchainMetadataRenderer.sol";
import {RobinhoodProtocolDeploymentAuthority} from "./RobinhoodProtocolDeploymentAuthority.sol";

/// @notice Chain-neutral coordinator whose CREATE2 address fixes every child address across chains.
/// @dev The constructor has no arguments or chain-specific imports. The approved deployer supplies
/// reviewed per-chain configuration in a separate, atomic child-deployment transaction.
contract RobinhoodProtocolDeployment {
    address public constant APPROVED_DEPLOYER =
        RobinhoodProtocolDeploymentAuthority.APPROVED_DEPLOYER;
    address public constant INITIAL_PROTOCOL_AUTHORITY =
        RobinhoodProtocolDeploymentAuthority.INITIAL_PROTOCOL_AUTHORITY;
    address private constant _FACTORY_CODE_STORE_A = 0xeCA48C751f78fC33a13f181A682E6C27b739D935;
    address private constant _FACTORY_CODE_STORE_B = 0xF600B03145798bAf8A455491910252c95a0488E6;
    uint256 private constant _FACTORY_CREATION_CODE_LENGTH = 33_570;
    bytes32 private constant _FACTORY_CREATION_CODE_HASH =
        0x389052c13310342f2db6481e40c5c5c2ee6329edad918201536cc4d28d9f29ec;

    OnchainMetadataRenderer public renderer;
    MembershipFactory public factory;

    error AlreadyDeployed();
    error InvalidDeploymentConfiguration();
    error FactoryCreationCodeCorrupted();
    error FactoryDeploymentFailed();
    error UnauthorizedDeploymentCaller(address caller);
    error UnauthorizedDeploymentOrigin(address origin);

    constructor() {
        if (tx.origin != APPROVED_DEPLOYER) revert UnauthorizedDeploymentOrigin(tx.origin);
    }

    function deploy(address paymentToken)
        external
        returns (OnchainMetadataRenderer deployedRenderer, MembershipFactory deployedFactory)
    {
        if (msg.sender != APPROVED_DEPLOYER) {
            revert UnauthorizedDeploymentCaller(msg.sender);
        }
        if (address(renderer) != address(0) || address(factory) != address(0)) {
            revert AlreadyDeployed();
        }
        address authority = INITIAL_PROTOCOL_AUTHORITY;
        if (paymentToken.code.length == 0 || authority.code.length == 0) {
            revert InvalidDeploymentConfiguration();
        }

        deployedRenderer = new OnchainMetadataRenderer();
        deployedFactory =
            MembershipFactory(_deployFactory(paymentToken, address(deployedRenderer), authority));
        renderer = deployedRenderer;
        factory = deployedFactory;
    }

    function _deployFactory(address paymentToken, address deployedRenderer, address authority)
        private
        returns (address deployedFactory)
    {
        uint256 codeLength = _FACTORY_CREATION_CODE_LENGTH;
        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;
        bytes memory constructorArgs =
            abi.encode(IERC20Metadata(paymentToken), deployedRenderer, authority, authority);
        bytes memory initCode = new bytes(codeLength + constructorArgs.length);
        bytes32 reconstructedHash;
        address storeA = _FACTORY_CODE_STORE_A;
        address storeB = _FACTORY_CODE_STORE_B;
        assembly ("memory-safe") {
            let data := add(initCode, 0x20)
            extcodecopy(storeA, data, 1, firstLength)
            extcodecopy(storeB, add(data, firstLength), 1, secondLength)
            reconstructedHash := keccak256(data, codeLength)
            mcopy(add(data, codeLength), add(constructorArgs, 0x20), mload(constructorArgs))
        }
        if (reconstructedHash != _FACTORY_CREATION_CODE_HASH) {
            revert FactoryCreationCodeCorrupted();
        }

        assembly ("memory-safe") {
            deployedFactory := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (deployedFactory == address(0)) {
            assembly ("memory-safe") {
                if returndatasize() {
                    let pointer := mload(0x40)
                    returndatacopy(pointer, 0, returndatasize())
                    revert(pointer, returndatasize())
                }
            }
            revert FactoryDeploymentFailed();
        }
    }
}
