// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {IBuybackModule} from "../src/interfaces/IBuybackModule.sol";
import {BuybackIntegration} from "../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @dev A test-only fixed-price strategy with a distinct caller and bytes encoding.
contract FixedPriceTestModule is IBuybackModule {
    address public immutable override vault;
    address public immutable override protocolToken;
    address public immutable buyer;
    address public immutable seller;
    uint8 public fault;

    function setFault(uint8 value) external {
        fault = value;
    }

    constructor(address vault_, address token_, address buyer_, address seller_) {
        vault = vault_;
        protocolToken = token_;
        buyer = buyer_;
        seller = seller_;
    }

    function interfaceVersion() external pure returns (uint256) {
        return 1;
    }

    function moduleId() external pure returns (bytes32) {
        return keccak256("TEST.FixedPrice");
    }

    function moduleVersion() external pure returns (uint256) {
        return 1;
    }

    function trackedAssets(address, bytes calldata) external view returns (address[] memory) {
        if (fault == 6) {
            address[] memory assets = new address[](1);
            assets[0] = BuybackIntegration.WETH;
            return assets;
        }
        return new address[](0);
    }

    function execute(
        address caller,
        address asset,
        BuybackTypes.SourceBucket,
        uint256 amount,
        uint64,
        bytes calldata data
    ) external payable returns (Result memory result) {
        require(msg.sender == vault && caller == buyer, "unauthorized");
        require(keccak256(data) == keccak256(hex"1234"), "terms");
        if (asset == address(0)) {
            require(msg.value == amount, "value");
            (bool ok,) = seller.call{value: fault == 2 ? amount - 1 : amount}("");
            require(ok, "payment");
        } else {
            require(
                msg.value == 0 && IERC20(asset).transfer(seller, fault == 2 ? amount - 1 : amount),
                "payment"
            );
        }
        require(IERC20(protocolToken).transferFrom(seller, vault, amount * 2), "output");
        result.legs = new BuybackTypes.Leg[](fault == 6 ? 2 : 1);
        result.legs[0] = BuybackTypes.Leg(asset, protocolToken, amount, amount * 2);
        result.acquired = amount * 2;
        if (fault == 6) {
            require(
                IERC20(BuybackIntegration.WETH).transferFrom(seller, vault, 1), "wrapped output"
            );
            result.legs[1] = BuybackTypes.Leg(asset, BuybackIntegration.WETH, 0, 1);
        }
        if (fault == 1) ++result.acquired;
        if (fault == 3) MockUSDG(protocolToken).mint(vault, 1);
        if (fault == 4) {
            ProtocolBuybackVault(payable(vault))
                .process(
                    asset, BuybackTypes.SourceBucket.Donation, 1, 2, uint64(block.timestamp), data
                );
        }
        if (fault == 5) {
            require(IERC20(protocolToken).transferFrom(seller, address(this), 1), "residual");
        }

        result.context = keccak256("fixed price");
    }
}

    contract ModuleTestFactory {
        address public immutable owner;

        constructor(address authority) {
            owner = authority;
        }

        function deploy(address token) external returns (ProtocolBuybackVault) {
            return new ProtocolBuybackVault(address(this), token);
        }
    }

    contract BuybackModulesTest is Test {
        ProtocolBuybackVault private vault;
        MockUSDG private token;
        FixedPriceTestModule private replacement;
        address private first;
        address private constant BUYER = address(0xB0B);
        address private constant SELLER = address(0xA11CE);
        BuybackTypes.SourceBucket private constant DONATION = BuybackTypes.SourceBucket.Donation;

        function setUp() public {
            vm.warp(1000);
            token = new MockUSDG();
            SyntheticPonsBinding.bind(address(token));
            vault = new ModuleTestFactory(address(this)).deploy(address(token));
            first = vault.activeModule();
            replacement = new FixedPriceTestModule(address(vault), address(token), BUYER, SELLER);
            token.mint(SELLER, 1000);
            vm.prank(SELLER);
            token.approve(address(replacement), type(uint256).max);
            vm.deal(address(vault), 100);
            vault.syncDonation(address(0));
        }

        function _activate() private {
            vault.proposeBuybackModule(address(replacement));
            vm.warp(vault.moduleActivationAt());
            vault.activateBuybackModule();
        }

        function _buy() private {
            vm.prank(BUYER);
            vault.process(address(0), DONATION, 10, 2, uint64(block.timestamp), hex"1234");
        }

        function testFuzz_faultsRevertNativeAndTokenSettlementAtomically(
            uint8 faultSeed,
            bool erc20Input
        ) public {
            _activate();
            vault.setBuybacksPaused(false);
            uint8 fault = uint8(bound(faultSeed, 1, 5));
            replacement.setFault(fault);
            address asset;
            if (erc20Input) {
                MockUSDG input = new MockUSDG();
                input.mint(address(vault), 100);
                asset = address(input);
                vault.syncDonation(asset);
            }
            uint256 supply = token.totalSupply();
            uint256 sellerTokens = token.balanceOf(SELLER);
            uint256 sellerNative = SELLER.balance;
            vm.expectRevert();
            vm.prank(BUYER);
            vault.process(asset, DONATION, 10, 2, uint64(block.timestamp), hex"1234");
            assertEq(vault.inventory(asset, DONATION).available, 100);
            assertEq(vault.settlementSequence(), 0);
            assertEq(token.totalSupply(), supply);
            assertEq(token.balanceOf(SELLER), sellerTokens);
            assertEq(SELLER.balance, sellerNative);
            assertEq(token.balanceOf(address(vault)), 0);
            assertEq(token.balanceOf(address(replacement)), 0);
            if (erc20Input) {
                assertEq(IERC20(asset).balanceOf(address(vault)), 100);
                assertEq(IERC20(asset).balanceOf(address(replacement)), 0);
                assertEq(IERC20(asset).balanceOf(SELLER), 0);
            } else {
                assertEq(address(vault).balance, 100);
            }
        }

        function testFuzz_wrappedResidualCannotCreditNativeInventory(bool nativeSurplus) public {
            _activate();
            vault.setBuybacksPaused(false);
            replacement.setFault(6);
            MockUSDG input = new MockUSDG();
            input.mint(address(vault), 100);
            vault.syncDonation(address(input));
            // Synthetic wrapped currency: this tests custody normalization, not a venue.
            MockUSDG wrapped = new MockUSDG();
            vm.etch(BuybackIntegration.WETH, address(wrapped).code);
            wrapped = MockUSDG(BuybackIntegration.WETH);
            wrapped.mint(SELLER, 1);
            vm.prank(SELLER);
            wrapped.approve(address(replacement), 1);
            if (nativeSurplus) vm.deal(address(vault), 102);
            uint256 supply = token.totalSupply();
            vm.expectRevert(ProtocolBuybackVault.InexactSettlement.selector);
            vm.prank(BUYER);
            vault.process(address(input), DONATION, 10, 2, uint64(block.timestamp), hex"1234");
            assertEq(vault.inventory(address(0), DONATION).available, 100);
            assertEq(vault.inventory(address(input), DONATION).available, 100);
            assertEq(token.totalSupply(), supply);
            assertEq(wrapped.balanceOf(address(vault)), 0);
            assertEq(wrapped.balanceOf(SELLER), 1);
        }

        function test_initialModuleRevisionAndPausedIdentity() public view {
            assertEq(vault.moduleRevision(), 1);
            assertTrue(vault.buybacksPaused());
            assertEq(vault.activeModuleCodeHash(), first.codehash);
            assertEq(IBuybackModule(first).vault(), address(vault));
        }

        function test_replacementRequiresDelayAndPauseAndRemovesPreviousIdentity() public {
            vault.proposeBuybackModule(address(replacement));
            vm.warp(vault.moduleActivationAt() - 1);
            vm.expectRevert(ProtocolBuybackVault.DelayNotElapsed.selector);
            vault.activateBuybackModule();
            vm.warp(block.timestamp + 1);
            vault.setBuybacksPaused(false);
            vm.expectRevert(ProtocolBuybackVault.BuybacksMustBePaused.selector);
            vault.activateBuybackModule();
            vault.setBuybacksPaused(true);
            vault.activateBuybackModule();
            assertEq(vault.moduleRevision(), 2);
            assertEq(vault.activeModule(), address(replacement));
            assertTrue(vault.buybacksPaused());
            assertEq(vault.pendingModule(), address(0));
            vm.expectRevert(ProtocolBuybackVault.BuybacksArePaused.selector);
            _buy();
            vault.setBuybacksPaused(false);
            uint256 supply = token.totalSupply();
            _buy();
            assertEq(token.totalSupply(), supply - 20);
            assertEq(token.balanceOf(address(vault)), 0);
            assertEq(vault.inventory(address(0), DONATION).available, 90);
            assertEq(vault.inventory(address(token), DONATION).totalBurned, 20);
            assertEq(address(replacement).balance, 0);
        }

        function test_reproposalRestartsDelayAndCancellationClearsIt() public {
            vault.proposeBuybackModule(address(replacement));
            uint256 beforeDelay = vault.moduleActivationAt();
            vm.warp(block.timestamp + 1 hours);
            vault.proposeBuybackModule(address(replacement));
            assertEq(vault.moduleActivationAt(), beforeDelay + 1 hours);
            vault.cancelBuybackModule();
            assertEq(vault.moduleActivationAt(), 0);
            vm.expectRevert(ProtocolBuybackVault.DelayNotElapsed.selector);
            vault.activateBuybackModule();
        }

        function test_invalidBindingsCodeAndAuthorityFailClosed() public {
            vm.prank(BUYER);
            vm.expectRevert(ProtocolBuybackVault.OnlyProtocolAuthority.selector);
            vault.proposeBuybackModule(address(replacement));
            vm.expectRevert(ProtocolBuybackVault.InvalidModule.selector);
            vault.proposeBuybackModule(BUYER);
            FixedPriceTestModule wrong = new FixedPriceTestModule(
                BUYER, address(token), BUYER, SELLER
            );
            vm.expectRevert(ProtocolBuybackVault.InvalidModule.selector);
            vault.proposeBuybackModule(address(wrong));
            vault.proposeBuybackModule(address(replacement));
            vm.warp(vault.moduleActivationAt());
            vm.etch(address(replacement), hex"00");
            vm.expectRevert(ProtocolBuybackVault.InvalidModule.selector);
            vault.activateBuybackModule();
            assertEq(vault.activeModule(), first);
        }

        function test_rotationBackRequiresTheSameDelay() public {
            _activate();
            vault.proposeBuybackModule(first);
            vm.expectRevert(ProtocolBuybackVault.DelayNotElapsed.selector);
            vault.activateBuybackModule();
            vm.warp(vault.moduleActivationAt());
            vault.activateBuybackModule();
            assertEq(vault.activeModule(), first);
            assertEq(vault.moduleRevision(), 3);
        }

        function test_freezeAndReplacementProposalsAreMutuallyExclusiveAndCancellable() public {
            vault.proposeBuybackModule(address(replacement));
            vm.expectRevert(ProtocolBuybackVault.PendingGovernanceAction.selector);
            vault.proposeModuleReplacementFreeze();
            vault.cancelBuybackModule();
            vault.proposeModuleReplacementFreeze();
            vm.expectRevert(ProtocolBuybackVault.PendingGovernanceAction.selector);
            vault.proposeBuybackModule(address(replacement));
            vault.cancelModuleReplacementFreeze();
            assertEq(vault.moduleFreezeAt(), 0);
            vault.proposeBuybackModule(address(replacement));
        }

        function test_permanentFreezePreservesBurnAndEmergencyPause() public {
            _activate();
            vault.proposeModuleReplacementFreeze();
            vm.warp(vault.moduleFreezeAt() - 1);
            vm.expectRevert(ProtocolBuybackVault.DelayNotElapsed.selector);
            vault.finalizeModuleReplacementFreeze();
            vm.warp(block.timestamp + 1);
            vault.setBuybacksPaused(false);
            vm.expectRevert(ProtocolBuybackVault.BuybacksMustBePaused.selector);
            vault.finalizeModuleReplacementFreeze();
            vault.setBuybacksPaused(true);
            vault.finalizeModuleReplacementFreeze();
            assertTrue(vault.moduleReplacementFrozen());
            vm.expectRevert(ProtocolBuybackVault.ModuleReplacementFrozen.selector);
            vault.proposeBuybackModule(first);
            vm.expectRevert(ProtocolBuybackVault.ModuleReplacementFrozen.selector);
            vault.activateBuybackModule();
            vm.expectRevert(ProtocolBuybackVault.ModuleReplacementFrozen.selector);
            vault.cancelModuleReplacementFreeze();
            vault.setBuybacksPaused(false);
            _buy();
            vault.setBuybacksPaused(true);
            vm.expectRevert(ProtocolBuybackVault.BuybacksArePaused.selector);
            _buy();
        }

        function test_freezeRejectsChangedCodeAndUnauthorizedFinalization() public {
            _activate();
            vault.proposeModuleReplacementFreeze();
            vm.warp(vault.moduleFreezeAt());
            vm.prank(BUYER);
            vm.expectRevert(ProtocolBuybackVault.OnlyProtocolAuthority.selector);
            vault.finalizeModuleReplacementFreeze();
            vm.etch(address(replacement), hex"00");
            vm.expectRevert(ProtocolBuybackVault.InvalidModule.selector);
            vault.finalizeModuleReplacementFreeze();
            assertFalse(vault.moduleReplacementFrozen());
        }

        function test_alternateModuleSettlesTokenInputAndPreservesBaselines() public {
            _activate();
            MockUSDG input = new MockUSDG();
            input.mint(address(vault), 100);
            vault.syncDonation(address(input));
            input.mint(address(replacement), 3);
            token.mint(address(replacement), 7);
            vault.setBuybacksPaused(false);
            vm.prank(BUYER);
            vault.process(address(input), DONATION, 10, 2, uint64(block.timestamp), hex"1234");
            assertEq(input.balanceOf(address(replacement)), 3);
            assertEq(token.balanceOf(address(replacement)), 7);
            assertEq(input.balanceOf(SELLER), 10);
            assertEq(vault.inventory(address(input), DONATION).available, 90);
            assertEq(vault.inventory(address(token), DONATION).totalBurned, 20);
        }
    }
