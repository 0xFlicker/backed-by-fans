// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {ProtocolBuybacksForkTest} from "./ProtocolBuybacks.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @notice Injected failures are isolated and removed before recovery proof.
contract ProtocolExternalFailuresForkTest is ProtocolBuybacksForkTest {
    uint64 private activeRevision;

    function _pendingUSDG() private returns (uint256 amount) {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        amount = _acquire(USDG, trader, 0.001 ether) / 4;
        vm.prank(trader);
        assertTrue(IERC20(USDG).transfer(address(vault), amount));
        vault.syncDonation(USDG);
        _repairLimits();
    }

    function _repairLimits() private {
        _memberLimits(USDG);
        activeRevision = vault.revision(USDG);
    }

    function _processUSDG(uint256 amount) private {
        vm.prank(trader);
        vault.process(
            USDG,
            BuybackTypes.SourceBucket.Donation,
            amount,
            activeRevision,
            uint64(block.timestamp)
        );
    }

    function _independentTokenBurn() private {
        vm.prank(developer);
        assertTrue(token.transfer(address(vault), 123));
        vault.syncDonation(address(token));
        uint256 supply = token.totalSupply();
        vm.prank(trader);
        vault.process(
            address(token), BuybackTypes.SourceBucket.Donation, 123, 0, uint64(block.timestamp)
        );
        assertEq(token.totalSupply(), supply - 123);
    }

    function test_labeledFrozenVaultTransferStaysPendingWithoutRescueAndRecoversWhenIssuerAllows()
        public
    {
        uint256 amount = _pendingUSDG();
        vm.mockCallRevert(
            USDG,
            abi.encodeCall(IERC20.transfer, (vault.executor(), amount)),
            abi.encodeWithSignature("InjectedIssuerFreeze()")
        );
        for (uint256 i; i < 3; ++i) {
            vm.expectRevert();
            _processUSDG(amount);
            assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, amount);
            assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).totalSpent, 0);
        }
        _independentTokenBurn();
        vm.prank(trader);
        assertTrue(IERC20(USDG).transfer(developer, 1));
        vm.clearMockedCalls();
        uint256 supply = token.totalSupply();
        _processUSDG(amount);
        assertLt(token.totalSupply(), supply);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function test_standingLimitsContinueAfterMultipleDaysWithoutRenewal() public {
        uint256 amount = _pendingUSDG();
        vm.warp(block.timestamp + 7 days);
        _memberBurn(address(token));
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function test_labeledMissingLiquidityAndMalformedRouterAreIsolated() public {
        uint256 amount = _pendingUSDG();
        bytes memory code = Integration.ROUTER.code;
        // Deliberately change only the external router runtime identity.
        vm.etch(Integration.ROUTER, hex"60006000fd");
        vm.expectRevert();
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, amount);
        _independentTokenBurn();
        vm.etch(Integration.ROUTER, code);
        // Deliberate manager availability failure; actual pool state is untouched.
        vm.mockCallRevert(
            Integration.POOL_MANAGER,
            bytes(""),
            abi.encodeWithSignature("InjectedMissingLiquidity()")
        );
        vm.expectRevert();
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).totalSpent, 0);
        _independentTokenBurn();
        vm.clearMockedCalls();
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function test_realPriceMovementNeedsNoReplacementAuthorization() public {
        uint256 amount = _pendingUSDG();
        _buy(trader, 0.05 ether);
        uint64 beforeRevision = vault.revision(USDG);
        _processUSDG(amount);
        assertEq(vault.revision(USDG), beforeRevision);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function test_realInitializedEmptyPoolKeepsInventoryPendingUntilRouteRepair() public {
        uint256 amount = _pendingUSDG();
        PoolKey memory key = _usdPool();
        key.fee = 12_345;
        vm.prank(trader);
        IPoolManager(Integration.POOL_MANAGER).initialize(key, uint160(1 << 96));
        assertEq(
            StateLibrary.getLiquidity(
                IPoolManager(Integration.POOL_MANAGER), PoolIdLibrary.toId(key)
            ),
            0
        );
        BuybackTypes.ExecutionLimits memory limits = vault.limits(USDG);
        BuybackTypes.TypedRoute memory route;
        route.pools = new PoolKey[](1);
        route.pools[0] = key;
        vault.setRoute(USDG, route);
        vault.setLimits(USDG, limits);
        activeRevision = vault.revision(USDG);
        vm.expectRevert();
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).totalSpent, 0);
        _independentTokenBurn();
        _repairLimits();
        _processUSDG(amount);
        assertEq(vault.inventory(USDG, BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function test_stoppedExternalSweepOperatorDoesNotGateMembershipBuys() public {
        uint256 pending = curve.buybackQuoteBalance();
        assertGt(pending, 0);
        vm.prank(developer);
        vm.expectRevert(bytes4(keccak256("InternalSwapRequiresOperator()")));
        curve.sweepFees(1);
        _memberBurn(USDG);
        assertGt(curve.buybackQuoteBalance(), pending);
        assertEq(nativeVault.totalLocked(address(token)), 0);
    }
}
