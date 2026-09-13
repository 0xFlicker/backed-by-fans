// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AuthenticAssetFixture} from "./helpers/AuthenticAssetFixture.sol";
import {ForkTierCodeFixture} from "./helpers/ForkTierCodeFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {
    IUniversalRouter
} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract ProtocolBuybacksForkTest is AuthenticAssetFixture {
    ProtocolBuybackVault internal vault;
    MembershipFactory internal bbf;

    function setUp() public override {
        super.setUp();
        new ForkTierCodeFixture().install();
        _launch(keccak256("protocol-buybacks"));
        _buy(developer, 0.01 ether);
        IERC20[] memory assets = new IERC20[](1);
        assets[0] = token;
        address media = deployCode("OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory");
        bbf = MembershipFactory(
            deployCode(
                "MembershipFactory.sol:MembershipFactory",
                abi.encode(
                    assets,
                    media,
                    address(this),
                    address(token),
                    MembershipTestConfig.implementation(),
                    MembershipTestConfig.minimumPayments(assets)
                )
            )
        );
        vault = ProtocolBuybackVault(payable(bbf.buybackVault()));
        vault.setBuybacksPaused(false);
    }

    function test_directBurnNeedsNoMarketLimitsAndDestroysOnlySelectedDonation() public {
        vm.prank(developer);
        assertTrue(token.transfer(address(vault), 1000));
        vault.syncDonation(address(token));
        uint256 supply = token.totalSupply();
        vm.prank(trader);
        vault.process(
            address(token), BuybackTypes.SourceBucket.Donation, 700, 0, uint64(block.timestamp)
        );
        assertEq(token.totalSupply(), supply - 700);
        assertEq(token.balanceOf(address(vault)), 300);
        assertEq(vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).available, 300);
    }

    function test_bondingBurnUsesOrdinaryFeesWithoutPonsOperator() public {
        BuybackTypes.TypedRoute memory route;
        vault.setRoute(address(0), route);
        uint256 input = 0.001 ether;
        uint256 net = input - input * curve.feeBps() / 10_000;
        uint256 expected = net * curve.tokenReserve() / (curve.quoteReserve() + net);
        vault.setLimits(address(0), BuybackTypes.ExecutionLimits(1, SafeCast.toUint128(input), 0));
        vm.deal(address(this), input);
        (bool sent,) = address(vault).call{value: input}("");
        assertTrue(sent);
        vault.syncDonation(address(0));
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 supply = token.totalSupply();
        uint256 fees = curve.quoteFeeBalance();
        vm.prank(trader);
        vault.process(
            address(0), BuybackTypes.SourceBucket.Donation, input, 2, uint64(block.timestamp)
        );
        assertEq(token.totalSupply(), supply - expected);
        assertEq(vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent, input);
        assertEq(address(vault).balance, 0);
        assertEq(token.balanceOf(address(vault)), 0);
        assertGt(curve.quoteFeeBalance(), fees);
        assertEq(
            nativeVault.totalLocked(address(token)),
            0,
            "membership-purpose donation burns never vest"
        );
    }

    function test_earnedWETHBurnAndReservedRefundAfterThreeOfTwelvePeriods() public {
        _memberBurn(Integration.WETH);
    }

    function test_earnedUSDGBurnAndReservedRefundAfterThreeOfTwelvePeriods() public {
        _memberBurn(USDG);
    }

    function test_earnedAuthenticStockBurnAndReservedRefundAfterThreeOfTwelvePeriods() public {
        _memberBurn(AMD);
    }

    function test_earnedProtocolTokenBurnNeedsNoCircularSwapAndPreservesRefund() public {
        _memberBurn(address(token));
    }

    function _memberBurn(address asset) internal {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 acquired;
        if (asset == address(token)) {
            acquired = 12_000;
            vm.prank(developer);
            assertTrue(token.transfer(trader, acquired));
        } else {
            acquired = _acquire(asset, trader, 0.001 ether);
        }
        bbf.setMinimumPayment(asset, 1);
        bbf.setPaymentTokenEnabled(asset, true);
        address renderer = deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer");
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, asset);
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = acquired / 12;
        config.periodDuration = 100;
        MembershipTier tier = MembershipTier(bbf.createTier(config));
        uint256 gross = config.pricePerPeriod * 12;
        vm.startPrank(trader);
        assertTrue(IERC20(asset).approve(address(tier), gross));
        uint256 id = tier.createMembership(12, address(0), 25);
        vm.stopPrank();
        vm.warp(block.timestamp + 300);
        vm.prank(developer);
        tier.processAccounting(25);
        vm.prank(developer);
        uint256 released = tier.releaseProtocolFees();
        // The per-second Q128 rate floors until END; three periods can leave a
        // fractional earned raw unit even when the ideal quarter is integral.
        // The protocol deliberately floors the Q128 rate before elapsed-time integration.
        // forge-lint: disable-next-line(divide-before-multiply)
        assertEq(released, (gross * tier.ACCOUNTING_SCALE() / 1200) * 300 / tier.ACCOUNTING_SCALE());
        assertEq(IERC20(asset).balanceOf(address(tier)), gross - released);
        _memberLimits(asset);
        uint256 routerBalance = Integration.ROUTER.balance;
        vm.deal(address(this), 7);
        IUniversalRouter(Integration.ROUTER).execute{value: 7}(
            hex"", new bytes[](0), block.timestamp
        );
        uint256 supply = token.totalSupply();
        uint64 revision = asset == address(token) ? 0 : vault.revision(asset);
        vm.prank(trader);
        vault.process(
            asset, BuybackTypes.SourceBucket.Membership, released, revision, uint64(block.timestamp)
        );
        assertEq(
            Integration.ROUTER.balance,
            routerBalance + 7,
            "pre-existing router ETH is not membership output"
        );
        uint256 burned =
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalBurned;
        assertGt(burned, 0);
        assertEq(supply - token.totalSupply(), burned);
        assertEq(vault.inventory(asset, BuybackTypes.SourceBucket.Membership).available, 0);
        assertEq(vault.inventory(asset, BuybackTypes.SourceBucket.Donation).totalReceived, 0);
        _assertReservedRefund(tier, asset, id, gross * 900 / 1200);
        _assertAllowancesCleared(asset);
        emit log_named_address("Authentic payment asset", asset);
        emit log_named_uint("Membership released raw input", released);
        emit log_named_uint("Measured protocol-token supply destroyed", burned);
    }

    function _assertAllowancesCleared(address asset) private view {
        if (asset != address(token) && asset != Integration.WETH) {
            assertEq(IERC20(asset).allowance(vault.executor(), Integration.PERMIT2), 0);
            (uint160 allowance, uint48 expiration,) = IAllowanceTransfer(Integration.PERMIT2)
                .allowance(vault.executor(), asset, Integration.ROUTER);
            assertEq(allowance, 0);
            assertEq(expiration, 1);
        }
    }

    function _assertReservedRefund(MembershipTier tier, address asset, uint256 id, uint256 expected)
        private
    {
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        uint256 refund = quote.grossRefund;
        assertEq(refund, expected);
        assertEq(quote.fundingScaled[3], refund * tier.ACCOUNTING_SCALE());
        assertEq(quote.fundingScaled[0] + quote.fundingScaled[1] + quote.fundingScaled[2], 0);
        uint256 beforeRefund = IERC20(asset).balanceOf(trader);
        uint256 heldBefore = IERC20(asset).balanceOf(address(tier));
        tier.refund(id, tier.ownerOf(id), refund, 25);
        assertEq(IERC20(asset).balanceOf(trader) - beforeRefund, refund);
        uint256 remainder = IERC20(asset).balanceOf(address(tier));
        assertEq(remainder, heldBefore - refund);
        assertEq(remainder, tier.totalProtectedLiability());
        assertLe(remainder, 1, "only protected fractional earned/cancellation residue remains");
        emit log_named_uint("Unused membership refunded from reserve", refund);
    }

    function _memberLimits(address asset) internal {
        if (asset == address(token)) return;
        uint256 count = asset == AMD ? 2 : asset == USDG ? 1 : 0;
        BuybackTypes.TypedRoute memory route;
        route.pools = new PoolKey[](count);
        if (asset == AMD) {
            route.pools[0] = _stockPool();
            route.pools[1] = _usdPool();
        } else if (asset == USDG) {
            route.pools[0] = _usdPool();
        }
        vault.setRoute(asset, route);
        uint128 cap = asset == AMD ? 5e15 : asset == USDG ? 2_400_000 : 1e15;
        vault.setLimits(asset, BuybackTypes.ExecutionLimits(1, cap, 0));
    }
}
