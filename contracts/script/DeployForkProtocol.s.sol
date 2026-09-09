// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IPonsBondingCurve, IPonsLaunchFactory} from "../src/interfaces/external/IPons.sol";
import {ISafeL2, ISafeProxy, ISafeProxyFactoryV150} from "./CreateSafe.s.sol";
import {
    MembershipFactory,
    OnchainMediaStoreFactory,
    OnchainMetadataRenderer,
    ProtocolDeployment,
    RendererPreviewHarness
} from "./DeployDirectProtocol.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console2} from "forge-std/console2.sol";

/// @notice Fresh local-fork bootstrap; no public-chain deployment entrypoint.
/// @dev Invoke with --rpc-url on the guarded loopback endpoint and put Foundry
/// broadcast output in the run's disposable directory, never public broadcast/.
contract DeployForkProtocol is ProtocolDeployment {
    IPonsLaunchFactory internal constant PONS =
        IPonsLaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address internal constant SAFE_SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;
    address internal constant SAFE_FACTORY = 0x14F2982D601c9458F93bd70B218933A6f8165e7b;
    address internal constant SAFE_HANDLER = 0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    struct Deployment {
        address developer;
        address safe;
        address protocolToken;
        address curve;
        uint256 launchFee;
        uint256 developerETHSpent;
        uint256 developerTokensPurchased;
        MembershipFactory factory;
        OnchainMediaStoreFactory mediaStoreFactory;
        OnchainMetadataRenderer renderer;
        RendererPreviewHarness previewHarness;
    }

    error LocalForkOnly();
    error ExternalIdentityMismatch();
    error InvalidLaunchTerms();

    function run() external returns (Deployment memory deployment) {
        _validateForkDependencies();
        // These must be disposable test keys supplied by the local harness.
        uint256 developerKey = vm.envUint("BBF_FORK_DEVELOPER_KEY");
        address developer = vm.addr(developerKey);
        bool singleOwner = vm.envOr("BBF_FORK_SINGLE_OWNER", false);
        address[] memory owners = new address[](singleOwner ? 1 : 3);
        owners[0] = vm.addr(vm.envUint("BBF_FORK_SAFE_KEY_A"));
        if (!singleOwner) {
            owners[1] = vm.addr(vm.envUint("BBF_FORK_SAFE_KEY_B"));
            owners[2] = vm.addr(vm.envUint("BBF_FORK_SAFE_KEY_C"));
        }
        bytes32 salt = keccak256(bytes(vm.envString("BBF_FORK_RUN_ID")));
        uint256 initialBuy = vm.envUint("BBF_FORK_INITIAL_BUY_WEI");
        if (initialBuy == 0 || initialBuy > 0.01 ether) revert InvalidLaunchTerms();
        vm.startBroadcast(developerKey);
        deployment = _deployFork(developer, owners, salt, initialBuy);
        vm.stopBroadcast();
        _checkDeployment(
            deployment.mediaStoreFactory,
            deployment.renderer,
            deployment.previewHarness,
            deployment.factory,
            _singletonPaymentToken(USDG),
            deployment.safe,
            deployment.protocolToken
        );
        console2.log("Fork developer", developer);
        console2.log("Fork protocol Safe", deployment.safe);
        console2.log("Pons curve", deployment.curve);
        console2.log("Pons launch fee", deployment.launchFee);
        console2.log("Developer ETH purchase", deployment.developerETHSpent);
        console2.log("Purchased developer holdings", deployment.developerTokensPurchased);
        _logDeployment(
            deployment.mediaStoreFactory,
            deployment.renderer,
            deployment.previewHarness,
            deployment.factory
        );
        _writeBootstrap(deployment);
    }

    /// @dev This is a deployment fragment, not a successful run manifest. The
    /// harness must attach actual receipts and verify postconditions separately.
    function _writeBootstrap(Deployment memory result) private {
        string memory runId = vm.envString("BBF_FORK_RUN_ID");
        bytes memory id = bytes(runId);
        if (id.length == 0 || id.length > 64) revert InvalidLaunchTerms();
        for (uint256 i; i < id.length; ++i) {
            bytes1 c = id[i];
            bool alphanumeric =
                (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
            if (!alphanumeric && (i == 0 || (c != 0x2d && c != 0x5f))) revert InvalidLaunchTerms();
        }
        string memory object = "fork-bootstrap";
        vm.serializeString(object, "runId", runId);
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeString(object, "scope", "deployment-fragment-awaiting-receipts");
        vm.serializeAddress(object, "developer", result.developer);
        vm.serializeAddress(object, "safe", result.safe);
        vm.serializeAddress(object, "safeOwners", ISafeL2(result.safe).getOwners());
        vm.serializeUint(object, "safeThreshold", ISafeL2(result.safe).getThreshold());
        vm.serializeAddress(object, "ponsFactory", address(PONS));
        vm.serializeAddress(object, "protocolToken", result.protocolToken);
        vm.serializeAddress(object, "curve", result.curve);
        vm.serializeString(object, "launchFeeWei", vm.toString(result.launchFee));
        vm.serializeString(object, "developerPurchaseWei", vm.toString(result.developerETHSpent));
        vm.serializeString(
            object, "developerTokensPurchased", vm.toString(result.developerTokensPurchased)
        );
        vm.serializeAddress(object, "factory", address(result.factory));
        vm.serializeAddress(object, "buybackVault", result.factory.buybackVault());
        vm.serializeAddress(object, "mediaStoreFactory", address(result.mediaStoreFactory));
        vm.serializeAddress(object, "renderer", address(result.renderer));
        string memory output =
            vm.serializeAddress(object, "previewHarness", address(result.previewHarness));
        string memory directory =
            string.concat(vm.projectRoot(), "/deployments/protocol-fork/", runId);
        vm.createDir(directory, true);
        vm.writeJson(output, string.concat(directory, "/bootstrap.json"));
    }

    function _deployFork(
        address developer,
        address[] memory owners,
        bytes32 salt,
        uint256 initialBuy
    ) internal virtual returns (Deployment memory result) {
        _validateForkDependencies();
        if (
            (owners.length != 1 && owners.length != 3) || developer == address(0) || initialBuy == 0
                || initialBuy > 0.01 ether
        ) revert InvalidLaunchTerms();
        for (uint256 i; i < owners.length; i++) {
            if (owners[i] == address(0) || owners[i] == developer) revert InvalidLaunchTerms();
            for (uint256 j; j < i; j++) {
                if (owners[i] == owners[j]) revert InvalidLaunchTerms();
            }
        }
        result.developer = developer;
        bytes32 economics = PONS.previewLaunchEconomics(0, address(0));
        if (economics == bytes32(0) || !PONS.canLaunch(developer)) revert InvalidLaunchTerms();
        IPonsLaunchFactory.TokenParams memory params = IPonsLaunchFactory.TokenParams({
            name: "Backed By Fans Fork Protocol",
            symbol: "BBFFORK",
            logo: "",
            description: "Disposable authentic Backed By Fans protocol",
            socials: IPonsLaunchFactory.Socials("", "", "", "", ""),
            creatorFeeRecipient: developer,
            creatorTaxBps: 0,
            buybackEnabled: true,
            expectedEconomics: economics,
            salt: salt
        });
        result.launchFee = PONS.launchFee();
        (result.protocolToken, result.curve) =
            PONS.launchToken{value: result.launchFee}(params, 0, address(0));
        IPonsBondingCurve curve = IPonsBondingCurve(result.curve);
        IERC20 token = IERC20(result.protocolToken);
        if (token.balanceOf(developer) != 0 || curve.currentSnipeTaxBps(developer) != 0) {
            revert InvalidLaunchTerms();
        }
        uint256 net = initialBuy - initialBuy * curve.feeBps() / 10_000;
        uint256 minimum = net * curve.tokenReserve() / (curve.quoteReserve() + net);
        if (minimum == 0) revert InvalidLaunchTerms();
        result.developerTokensPurchased =
            curve.buy{value: initialBuy}(initialBuy, minimum, developer);
        result.developerETHSpent = initialBuy;
        if (
            result.developerTokensPurchased != token.balanceOf(developer)
                || result.developerTokensPurchased < minimum || curve.readyToGraduate()
        ) revert InvalidLaunchTerms();
        result.safe = _deploySafe(owners, salt);
        _validateLocalToken(USDG, result.safe, result.protocolToken);
        (result.mediaStoreFactory, result.renderer, result.previewHarness, result.factory) =
            _deployLocal(USDG, result.safe, result.protocolToken);
        if (
            result.factory.owner() != result.safe
                || result.factory.protocolToken() != result.protocolToken
        ) revert DeploymentInvariantFailed();
    }

    function _deploySafe(address[] memory owners, bytes32 salt) internal returns (address safe) {
        uint256 threshold = owners.length == 1 ? 1 : 2;
        bytes memory initializer = abi.encodeCall(
            ISafeL2.setup,
            (
                owners,
                threshold,
                address(0),
                bytes(""),
                SAFE_HANDLER,
                address(0),
                0,
                payable(address(0))
            )
        );
        safe = ISafeProxyFactoryV150(SAFE_FACTORY)
            .createProxyWithNonceL2(SAFE_SINGLETON, initializer, uint256(salt));
        if (
            ISafeProxy(safe).masterCopy() != SAFE_SINGLETON
                || ISafeL2(safe).getThreshold() != threshold || ISafeL2(safe).nonce() != 0
                || keccak256(abi.encode(ISafeL2(safe).getOwners())) != keccak256(abi.encode(owners))
        ) revert ExternalIdentityMismatch();
    }

    function _validateForkDependencies() internal view {
        if (block.chainid != 31_337) revert LocalForkOnly();
        if (
            address(PONS).codehash
                    != 0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84
                || SAFE_SINGLETON.codehash
                    != 0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc
                || SAFE_FACTORY.codehash
                    != 0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529
                || SAFE_HANDLER.codehash
                    != 0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc
        ) revert ExternalIdentityMismatch();
    }
}
