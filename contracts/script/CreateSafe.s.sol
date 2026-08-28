// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/// @dev Exact Safe v1.5.0 surface used by the creation script.
interface ISafeL2 {
    function VERSION() external view returns (string memory);

    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

    function getOwners() external view returns (address[] memory);

    function getThreshold() external view returns (uint256);

    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory modules, address next);

    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);

    function nonce() external view returns (uint256);
}

/// @dev Safe v1.5.0 L2 factory entrypoint. The L2 variant emits the initializer and salt.
interface ISafeProxyFactoryV150 {
    function createProxyWithNonceL2(
        address singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external returns (address proxy);

    function proxyCreationCode() external pure returns (bytes memory);
}

interface ISafeProxy {
    function masterCopy() external view returns (address);
}

/// @notice Creates the same Safe v1.5.0 L2 account on supported Robinhood chains.
contract CreateRobinhoodSafe is Script {
    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    address public constant APPROVED_DEPLOYER = 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027;

    // Safe v1.5.0 canonical deployments from safe-global/safe-deployments.
    address public constant SAFE_L2_SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;
    bytes32 public constant SAFE_L2_SINGLETON_CODE_HASH =
        0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc;
    address public constant SAFE_PROXY_FACTORY = 0x14F2982D601c9458F93bd70B218933A6f8165e7b;
    bytes32 public constant SAFE_PROXY_FACTORY_CODE_HASH =
        0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529;
    address public constant COMPATIBILITY_FALLBACK_HANDLER =
        0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    bytes32 public constant COMPATIBILITY_FALLBACK_HANDLER_CODE_HASH =
        0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc;

    // The non-chain-specific L2 entrypoint makes the Safe address identical on both chains.
    bytes32 public constant SAFE_SALT = keccak256("Backed By Fans protocol Safe v1");
    address public constant EXPECTED_SAFE_ADDRESS = 0xeAA4B38A99f766117C1D493a21012fec25f70505;

    bytes32 private constant _SAFE_VERSION_HASH = keccak256("1.5.0");
    address private constant _SENTINEL_MODULES = address(0x1);
    bytes32 private constant _FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
    bytes32 private constant _GUARD_STORAGE_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    error CanonicalSafeContractMismatch(address target, bytes32 expected, bytes32 observed);
    error InvalidSafeOwner(address observed);
    error MainnetConfirmationRequired(uint256 provided);
    error SafeAddressMismatch(address expected, address observed);
    error SafeInvariantFailed(bytes32 invariant);
    error SafeVersionMismatch(string observed);
    error UnsupportedRobinhoodChain(uint256 chainId);

    function run() external returns (address safe) {
        address owner = APPROVED_DEPLOYER;
        validateMainnetConfirmation(vm.envOr("CONFIRM_MAINNET_SAFE_CREATION", uint256(0)));
        validatePublicInputs(owner);

        uint256 saltNonce = uint256(SAFE_SALT);
        address expectedSafe = predictSafeAddress(owner, saltNonce);
        if (expectedSafe != EXPECTED_SAFE_ADDRESS) {
            revert SafeAddressMismatch(EXPECTED_SAFE_ADDRESS, expectedSafe);
        }

        console2.log("Backed By Fans Safe owner", owner);
        console2.log("Backed By Fans predicted Safe", expectedSafe);

        if (expectedSafe.code.length != 0) {
            _validateCreatedSafe(expectedSafe, owner);
            console2.log("Backed By Fans Safe already exists", expectedSafe);
            return expectedSafe;
        }

        vm.startBroadcast();
        safe = _create(owner, saltNonce);
        vm.stopBroadcast();

        if (safe != expectedSafe) revert SafeAddressMismatch(expectedSafe, safe);
        _validateCreatedSafe(safe, owner);
        console2.log("Backed By Fans Safe", safe);
    }

    function validatePublicInputs(address owner) public view {
        if (owner != APPROVED_DEPLOYER) revert InvalidSafeOwner(owner);
        if (
            block.chainid != ROBINHOOD_MAINNET_CHAIN_ID
                && block.chainid != ROBINHOOD_TESTNET_CHAIN_ID
        ) {
            revert UnsupportedRobinhoodChain(block.chainid);
        }

        _requireCodeHash(SAFE_L2_SINGLETON, SAFE_L2_SINGLETON_CODE_HASH);
        _requireCodeHash(SAFE_PROXY_FACTORY, SAFE_PROXY_FACTORY_CODE_HASH);
        _requireCodeHash(COMPATIBILITY_FALLBACK_HANDLER, COMPATIBILITY_FALLBACK_HANDLER_CODE_HASH);

        string memory observedVersion = ISafeL2(SAFE_L2_SINGLETON).VERSION();
        if (keccak256(bytes(observedVersion)) != _SAFE_VERSION_HASH) {
            revert SafeVersionMismatch(observedVersion);
        }
    }

    function validateMainnetConfirmation(uint256 confirmation) public view {
        if (block.chainid == ROBINHOOD_MAINNET_CHAIN_ID && confirmation != block.chainid) {
            revert MainnetConfirmationRequired(confirmation);
        }
    }

    function safeInitializer(address owner) public pure returns (bytes memory) {
        if (owner != APPROVED_DEPLOYER) revert InvalidSafeOwner(owner);

        address[] memory owners = new address[](1);
        owners[0] = owner;
        return abi.encodeCall(
            ISafeL2.setup,
            (
                owners,
                1,
                address(0),
                bytes(""),
                COMPATIBILITY_FALLBACK_HANDLER,
                address(0),
                0,
                payable(address(0))
            )
        );
    }

    function predictSafeAddress(address owner, uint256 saltNonce)
        public
        pure
        returns (address predicted)
    {
        bytes memory initializer = safeInitializer(owner);
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        bytes memory deploymentData = abi.encodePacked(
            ISafeProxyFactoryV150(SAFE_PROXY_FACTORY).proxyCreationCode(),
            uint256(uint160(SAFE_L2_SINGLETON))
        );
        bytes32 digest = keccak256(
            abi.encodePacked(bytes1(0xff), SAFE_PROXY_FACTORY, salt, keccak256(deploymentData))
        );
        predicted = address(uint160(uint256(digest)));
    }

    function _create(address owner, uint256 saltNonce) internal returns (address safe) {
        safe = ISafeProxyFactoryV150(SAFE_PROXY_FACTORY)
            .createProxyWithNonceL2(SAFE_L2_SINGLETON, safeInitializer(owner), saltNonce);
    }

    function _validateCreatedSafe(address safe, address owner) internal view {
        ISafeL2 account = ISafeL2(safe);
        address[] memory owners = account.getOwners();
        (address[] memory modules, address nextModule) =
            account.getModulesPaginated(_SENTINEL_MODULES, 1);

        if (safe.code.length == 0) revert SafeInvariantFailed("code");
        if (ISafeProxy(safe).masterCopy() != SAFE_L2_SINGLETON) {
            revert SafeInvariantFailed("singleton");
        }
        if (keccak256(bytes(account.VERSION())) != _SAFE_VERSION_HASH) {
            revert SafeInvariantFailed("version");
        }
        if (owners.length != 1) revert SafeInvariantFailed("owners-length");
        if (owners[0] != owner) revert SafeInvariantFailed("owner");
        if (account.getThreshold() != 1) revert SafeInvariantFailed("threshold");
        if (account.nonce() != 0) revert SafeInvariantFailed("nonce");
        if (modules.length != 0) revert SafeInvariantFailed("modules");
        if (nextModule != _SENTINEL_MODULES) revert SafeInvariantFailed("module-sentinel");
        if (
            _readAddressSlot(account, _FALLBACK_HANDLER_STORAGE_SLOT)
                != COMPATIBILITY_FALLBACK_HANDLER
        ) {
            revert SafeInvariantFailed("fallback-handler");
        }
        if (_readAddressSlot(account, _GUARD_STORAGE_SLOT) != address(0)) {
            revert SafeInvariantFailed("guard");
        }
    }

    function _readAddressSlot(ISafeL2 safe, bytes32 slot) private view returns (address value) {
        bytes memory stored = safe.getStorageAt(uint256(slot), 1);
        if (stored.length != 32) revert SafeInvariantFailed("storage-read");
        assembly ("memory-safe") {
            value := mload(add(stored, 0x20))
        }
    }

    function _requireCodeHash(address target, bytes32 expected) private view {
        bytes32 observed = target.codehash;
        if (observed != expected) {
            revert CanonicalSafeContractMismatch(target, expected, observed);
        }
    }
}
