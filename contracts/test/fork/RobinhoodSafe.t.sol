// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {ForkTierCodeFixture} from "./helpers/ForkTierCodeFixture.sol";

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {
    CreateRobinhoodSafe,
    ISafeL2,
    ISafeProxy,
    ISafeProxyFactoryV150
} from "../../script/CreateSafe.s.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {ISafe} from "../../src/interfaces/external/ISafe.sol";
import {BuybackIntegration} from "../../src/libraries/BuybackIntegration.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {PonsForkFixture} from "./helpers/PonsForkFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

contract CreateRobinhoodSafeHarness is CreateRobinhoodSafe {
    function createForTest(address owner, uint256 saltNonce) external returns (address safe) {
        validatePublicInputs(owner);
        validateMainnetConfirmation(0);

        address expectedSafe = predictSafeAddress(owner, saltNonce);
        if (expectedSafe.code.length != 0) {
            _validateCreatedSafe(expectedSafe, owner);
            return expectedSafe;
        }

        safe = _create(owner, saltNonce);
        if (safe != expectedSafe) revert SafeAddressMismatch(expectedSafe, safe);
        _validateCreatedSafe(safe, owner);
    }
}

/// @notice Opt-in integration gate against Safe's canonical Robinhood testnet contracts.
contract RobinhoodSafeForkTest is Test {
    function test_createsAndValidatesSafeV150L2WhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) {
            vm.skip(true, "set RUN_ROBINHOOD_FORK_TESTS=true");
        }

        string memory rpcUrl = vm.envString("ROBINHOOD_TESTNET_RPC_URL");
        vm.createSelectFork(rpcUrl);

        CreateRobinhoodSafeHarness creation = new CreateRobinhoodSafeHarness();
        address deployer = creation.APPROVED_DEPLOYER();
        assertEq(
            creation.predictSafeAddress(deployer, uint256(creation.SAFE_SALT())),
            0xeAA4B38A99f766117C1D493a21012fec25f70505
        );

        uint256 l2EventSalt = uint256(keccak256("Backed By Fans L2 factory event test"));
        bytes memory initializer = creation.safeInitializer(deployer);
        vm.recordLogs();
        address l2EventSafe = creation.createForTest(deployer, l2EventSalt);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _assertProxyCreationL2(
            logs,
            l2EventSafe,
            creation.SAFE_L2_SINGLETON(),
            initializer,
            l2EventSalt,
            creation.SAFE_PROXY_FACTORY()
        );

        uint256 saltNonce = uint256(creation.SAFE_SALT());
        address predicted = creation.predictSafeAddress(deployer, saltNonce);
        address safe =
            predicted.code.length == 0 ? creation.createForTest(deployer, saltNonce) : predicted;

        assertEq(block.chainid, creation.ROBINHOOD_TESTNET_CHAIN_ID());
        assertEq(safe, predicted);
        assertEq(ISafeProxy(safe).masterCopy(), creation.SAFE_L2_SINGLETON());
        assertEq(ISafeL2(safe).VERSION(), "1.5.0");
        assertEq(ISafeL2(safe).getOwners(), _oneAddress(deployer));
        assertEq(ISafeL2(safe).getThreshold(), 1);
        assertEq(ISafeL2(safe).nonce(), 0);
        assertEq(creation.run(), safe);
    }

    function _oneAddress(address value) private pure returns (address[] memory values) {
        values = new address[](1);
        values[0] = value;
    }

    function _assertProxyCreationL2(
        Vm.Log[] memory logs,
        address proxy,
        address singleton,
        bytes memory initializer,
        uint256 saltNonce,
        address factory
    ) private pure {
        bytes32 signature = keccak256("ProxyCreationL2(address,address,bytes,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == factory && logs[i].topics.length == 2
                    && logs[i].topics[0] == signature
                    && address(uint160(uint256(logs[i].topics[1]))) == proxy
            ) {
                (
                    address observedSingleton,
                    bytes memory observedInitializer,
                    uint256 observedSalt
                ) = abi.decode(logs[i].data, (address, bytes, uint256));
                assert(observedSingleton == singleton);
                assert(keccak256(observedInitializer) == keccak256(initializer));
                assert(observedSalt == saltNonce);
                return;
            }
        }
        revert("ProxyCreationL2 event missing");
    }
}

// The fixture below is separate from the public one-signer deployment policy.
// It creates an actual disposable 2-of-3 Safe on the pinned authentic mainnet fork.
contract ProtocolSafeForkTest is PonsForkFixture {
    address private constant SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;
    address private constant SAFE_FACTORY = 0x14F2982D601c9458F93bd70B218933A6f8165e7b;
    address private constant HANDLER = 0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    address private constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address private constant AMD = 0x86923f96303D656E4aa86D9d42D1e57ad2023fdC;
    ISafe private safe;
    MembershipFactory private bbf;
    ProtocolBuybackVault private bbfVault;

    function setUp() public override {
        super.setUp();
        new ForkTierCodeFixture().install();
        _launch(keccak256("threshold-safe-test"));
        safe = _createSafe(0xA000, 1);
        IERC20[] memory assets = new IERC20[](1);
        assets[0] = IERC20(USDG);
        bbf = new MembershipFactory(
            assets,
            address(new OnchainMediaStoreFactory()),
            address(safe),
            address(token),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(assets)
        );
        bbfVault = ProtocolBuybackVault(payable(bbf.buybackVault()));
        vm.prank(address(safe));
        bbf.setMinimumPayment(AMD, 1); // Registry authorization fixture minimum.
    }

    function test_thresholdSignedRegistryChangesAndFailedInnerCallHaveDistinctEvidence() public {
        assertTrue(
            _execute(
                safe, address(bbf), abi.encodeCall(bbf.setPaymentTokenEnabled, (AMD, true)), 0xA000
            )
        );
        assertTrue(bbf.isPaymentTokenEnabled(AMD));
        assertEq(safe.nonce(), 1);
        assertTrue(
            _execute(
                safe, address(bbf), abi.encodeCall(bbf.setPaymentTokenEnabled, (AMD, false)), 0xA000
            )
        );
        assertFalse(bbf.isPaymentTokenEnabled(AMD));
        assertTrue(bbf.isPaymentTokenListed(AMD));
        // Removed withdrawal selector: outer Safe transaction succeeds but its
        // inner call fails. The helper verifies the matching failure event.
        assertFalse(
            _execute(
                safe,
                address(bbf),
                abi.encodeWithSignature("withdrawProtocolFees(address)", USDG),
                0xA000
            )
        );
        assertEq(safe.nonce(), 3);
        assertEq(bbf.buybackVault(), address(bbfVault));
        vm.prank(developer);
        vm.expectRevert();
        bbf.setPaymentTokenEnabled(AMD, true);
        vm.prank(trader);
        vm.expectRevert();
        bbfVault.setBuybacksPaused(false);
    }

    function test_insufficientSignaturesAndReplayCannotSpendSafeNonce() public {
        bytes memory data = abi.encodeCall(bbf.setPaymentTokenEnabled, (AMD, true));
        bytes memory signatures = _signatures(safe, address(bbf), data, 0xA000);
        bytes memory oneSignature = new bytes(65);
        for (uint256 i; i < 65; ++i) {
            oneSignature[i] = signatures[i];
        }
        vm.expectRevert(bytes("GS020"));
        safe.execTransaction(
            address(bbf), 0, data, 0, 2_000_000, 0, 0, address(0), payable(address(0)), oneSignature
        );
        assertEq(safe.nonce(), 0);
        assertFalse(bbf.isPaymentTokenListed(AMD));
        assertTrue(_execute(safe, address(bbf), data, 0xA000));
        vm.expectRevert();
        safe.execTransaction(
            address(bbf), 0, data, 0, 2_000_000, 0, 0, address(0), payable(address(0)), signatures
        );
        assertEq(safe.nonce(), 1);
    }

    function test_validatedSuccessorTakesAllConfigurationAuthorityInTwoSignedSteps() public {
        ISafe successor = _createSafe(0xB000, 2);
        assertFalse(
            _execute(safe, address(bbf), abi.encodeCall(bbf.transferOwnership, (trader)), 0xA000)
        );
        assertTrue(
            _execute(
                safe,
                address(bbf),
                abi.encodeCall(bbf.transferOwnership, (address(successor))),
                0xA000
            )
        );
        assertEq(bbf.owner(), address(safe));
        assertEq(bbf.pendingOwner(), address(successor));
        assertFalse(
            _execute(
                successor,
                address(bbfVault),
                abi.encodeCall(bbfVault.setBuybacksPaused, (false)),
                0xB000
            )
        );
        assertTrue(
            _execute(successor, address(bbf), abi.encodeCall(bbf.acceptOwnership, ()), 0xB000)
        );
        assertEq(bbf.owner(), address(successor));
        assertEq(bbf.pendingOwner(), address(0));
        assertFalse(
            _execute(
                safe, address(bbfVault), abi.encodeCall(bbfVault.setBuybacksPaused, (false)), 0xA000
            )
        );
        assertTrue(
            _execute(
                successor,
                address(bbfVault),
                abi.encodeCall(bbfVault.setBuybacksPaused, (false)),
                0xB000
            )
        );
        assertFalse(bbfVault.buybacksPaused());
        assertEq(bbfVault.protocolToken(), address(token));
        assertFalse(
            _execute(successor, address(bbf), abi.encodeCall(bbf.renounceOwnership, ()), 0xB000)
        );
    }

    function test_safeConfigurationChangedWhilePendingIsRevalidatedAtAcceptance() public {
        ISafe successor = _createSafe(0xB000, 3);
        assertTrue(
            _execute(
                safe,
                address(bbf),
                abi.encodeCall(bbf.transferOwnership, (address(successor))),
                0xA000
            )
        );
        assertTrue(
            _execute(
                successor,
                address(successor),
                abi.encodeWithSignature("enableModule(address)", trader),
                0xB000
            )
        );
        assertFalse(
            _execute(successor, address(bbf), abi.encodeCall(bbf.acceptOwnership, ()), 0xB000)
        );
        assertEq(bbf.owner(), address(safe));
    }

    function test_actualV4PoolRoutesAndLimitBoundsRequireThresholdAuthorization() public {
        BuybackTypes.TypedRoute memory path;
        path.pools = new PoolKey[](2);
        path.pools[0] =
            PoolKey(Currency.wrap(USDG), Currency.wrap(AMD), 10_000, 200, IHooks(address(0)));
        path.pools[1] =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(USDG), 100, 1, IHooks(address(0)));
        assertTrue(
            _execute(
                safe, address(bbfVault), abi.encodeCall(bbfVault.setRoute, (AMD, path)), 0xA000
            )
        );
        assertEq(bbfVault.revision(AMD), 1);
        BuybackTypes.ExecutionLimits memory terms = BuybackTypes.ExecutionLimits(1, 1e14, 60);
        assertTrue(
            _execute(
                safe, address(bbfVault), abi.encodeCall(bbfVault.setLimits, (AMD, terms)), 0xA000
            )
        );
        assertEq(bbfVault.revision(AMD), 2);
        assertEq(bbfVault.limits(AMD).maxInput, 1e14);
        terms.minInput = terms.maxInput + 1;
        assertFalse(
            _execute(
                safe, address(bbfVault), abi.encodeCall(bbfVault.setLimits, (AMD, terms)), 0xA000
            )
        );
        assertEq(bbfVault.revision(AMD), 2);
        path.pools[0].hooks = IHooks(PONS.memeHook());
        assertFalse(
            _execute(
                safe, address(bbfVault), abi.encodeCall(bbfVault.setRoute, (AMD, path)), 0xA000
            )
        );
        assertEq(bbfVault.revision(AMD), 2);
        assertTrue(
            _execute(
                safe,
                address(bbfVault),
                abi.encodeCall(bbfVault.setAssetBuybacksPaused, (AMD, true)),
                0xA000
            )
        );
        assertTrue(bbfVault.assetBuybacksPaused(AMD));
        assertEq(bbfVault.limits(AMD).maxInput, 1e14);
    }

    function _createSafe(uint256 keyBase, uint256 salt) private returns (ISafe) {
        address[] memory owners = new address[](3);
        for (uint256 i; i < 3; ++i) {
            owners[i] = vm.addr(keyBase + i);
        }
        bytes memory initializer = abi.encodeCall(
            ISafeL2.setup,
            (owners, 2, address(0), bytes(""), HANDLER, address(0), 0, payable(address(0)))
        );
        address result = ISafeProxyFactoryV150(SAFE_FACTORY)
            .createProxyWithNonceL2(SINGLETON, initializer, salt);
        assertEq(ISafe(result).getThreshold(), 2);
        assertEq(ISafe(result).masterCopy(), SINGLETON);
        return ISafe(result);
    }

    function _signatures(ISafe account, address target, bytes memory data, uint256 keyBase)
        private
        view
        returns (bytes memory)
    {
        bytes32 digest = _transactionHash(account, target, data);
        uint256 first = keyBase;
        uint256 second = keyBase + 1;
        if (vm.addr(first) > vm.addr(second)) (first, second) = (second, first);
        return bytes.concat(_signature(first, digest), _signature(second, digest));
    }

    function _transactionHash(ISafe account, address target, bytes memory data)
        private
        view
        returns (bytes32)
    {
        uint256 nonce = account.nonce();
        return account.getTransactionHash(
            target, 0, data, 0, 2_000_000, 0, 0, address(0), address(0), nonce
        );
    }

    function _signature(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _execute(ISafe account, address target, bytes memory data, uint256 keyBase)
        private
        returns (bool success)
    {
        uint256 beforeNonce = account.nonce();
        bytes32 digest = _transactionHash(account, target, data);
        bytes memory signatures = _signatures(account, target, data, keyBase);
        vm.recordLogs();
        vm.prank(trader);
        success = account.execTransaction(
            target, 0, data, 0, 2_000_000, 0, 0, address(0), payable(address(0)), signatures
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 eventSignature = success
            ? keccak256("ExecutionSuccess(bytes32,uint256)")
            : keccak256("ExecutionFailure(bytes32,uint256)");
        bool observed;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(account) && logs[i].topics[0] == eventSignature) {
                assertEq(logs[i].topics[1], digest);
                assertEq(abi.decode(logs[i].data, (uint256)), 0);
                observed = true;
            }
        }
        assertTrue(observed, "missing inner Safe outcome");
        assertEq(account.nonce(), beforeNonce + 1);
    }
}
