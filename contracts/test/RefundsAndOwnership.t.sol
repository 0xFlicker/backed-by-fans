// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {MembershipModel} from "./models/MembershipModel.sol";

contract FixedPriceRefundsAndOwnershipTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;

    address private creator;
    address private nextCreator;
    address private member;
    address private payer;
    address private referrer;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        creator = makeAddr("creator");
        nextCreator = makeAddr("nextCreator");
        member = makeAddr("member");
        payer = makeAddr("payer");
        referrer = makeAddr("referrer");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer));
        tier = new MembershipTier(makeAddr("factory"), paymentToken, config);
        _fundAndApprove(member, 100_000_000);
        _fundAndApprove(payer, 100_000_000);
        _fundAndApprove(creator, 100_000_000);
        _fundAndApprove(nextCreator, 100_000_000);
    }

    function test_fixedRefundProratesAllRemainingPaidSecondsAtImmutablePrice() public {
        uint256 tokenId = _purchase(member, 2, address(0));
        vm.warp(_START + 15 days);

        (uint256 preview, uint256 topUp) = tier.previewRefund(tokenId);
        assertEq(preview, 15_000_000);
        assertEq(topUp, 0);

        vm.prank(creator);
        (uint256 refunded, uint256 paidTopUp) = tier.refund(tokenId, preview, topUp);

        assertEq(refunded, preview);
        assertEq(paidTopUp, topUp);
        assertEq(paymentToken.balanceOf(member), 95_000_000);
        assertEq(tier.creatorProceeds(), 3_800_000);
        assertEq(tier.rewardReserve(), 1_000_000);
        assertEq(tier.totalProtectedLiability(), 1_000_000);
    }

    function test_immediateRefundUsesCreatorProceedsAndOnlyExactOwnerTopUp() public {
        uint256 tokenId = _purchase(member, 1, address(0));
        uint256 creatorBalanceBefore = paymentToken.balanceOf(creator);

        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        assertEq(grossRefund, 10_000_000);
        assertEq(ownerTopUp, 600_000);

        vm.prank(creator);
        tier.refund(tokenId, grossRefund, ownerTopUp);

        assertEq(paymentToken.balanceOf(creator), creatorBalanceBefore - ownerTopUp);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
        assertEq(paymentToken.balanceOf(address(tier)), 500_000);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.rewardReserve(), 500_000);
    }

    function test_refundRejectsOwnerTopUpAbovePreviewedMaximumWithoutChangingState() public {
        uint256 tokenId = _purchase(member, 1, address(0));
        (uint256 previewedRefund, uint256 previewedTopUp) = tier.previewRefund(tokenId);
        assertEq(previewedTopUp, 600_000);

        vm.prank(creator);
        tier.withdrawCreatorProceeds();

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.OwnerTopUpLimitExceeded.selector, previewedRefund, previewedTopUp
            )
        );
        tier.refund(tokenId, previewedRefund, previewedTopUp);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 0);
        assertEq(paymentToken.balanceOf(member), 90_000_000);
        assertEq(tier.creatorProceeds(), 0);
        (uint256 currentRefund, uint256 currentTopUp) = tier.previewRefund(tokenId);
        assertEq(currentRefund, previewedRefund);
        assertEq(currentTopUp, previewedRefund);
    }

    function test_refundRejectsPaidTimeAddedAfterPreviewEvenWhenCreatorProceedsAreAmple() public {
        _purchase(payer, 2, address(0));
        uint256 tokenId = _purchase(member, 1, address(0));
        (uint256 previewedRefund, uint256 previewedTopUp) = tier.previewRefund(tokenId);
        assertEq(previewedRefund, 10_000_000);
        assertEq(previewedTopUp, 0);

        _purchase(member, 1, address(0));
        (uint256 currentRefund, uint256 currentTopUp) = tier.previewRefund(tokenId);
        assertEq(currentRefund, 20_000_000);
        assertEq(currentTopUp, 0);

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.GrossRefundLimitExceeded.selector, currentRefund, previewedRefund
            )
        );
        tier.refund(tokenId, previewedRefund, previewedTopUp);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 2 * _PERIOD);
        assertEq(grantSeconds, 0);
        assertEq(tier.creatorProceeds(), 37_600_000);
    }

    function test_withdrawnProceedsRequireFullTopUpWithoutTouchingProtectedBalances() public {
        uint256 tokenId = _purchase(member, 1, referrer);
        vm.prank(creator);
        assertEq(tier.withdrawCreatorProceeds(), 9_300_000);

        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        assertEq(grossRefund, 10_000_000);
        assertEq(ownerTopUp, grossRefund);

        vm.prank(creator);
        tier.refund(tokenId, grossRefund, ownerTopUp);

        assertEq(paymentToken.balanceOf(address(tier)), 600_000);
        assertEq(tier.rewardReserve(), 500_000);
        assertEq(tier.totalReferralLiability(), 100_000);
        assertEq(tier.totalProtectedLiability(), 600_000);
    }

    function test_unsolicitedSurplusNeverReducesRequiredOwnerTopUp() public {
        uint256 tokenId = _purchase(member, 1, address(0));
        vm.prank(creator);
        tier.withdrawCreatorProceeds();
        paymentToken.mint(address(tier), 2_000_000);

        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        assertEq(grossRefund, 10_000_000);
        assertEq(ownerTopUp, grossRefund);

        vm.prank(creator);
        tier.refund(tokenId, grossRefund, ownerTopUp);
        assertEq(paymentToken.balanceOf(address(tier)), 2_500_000);
        assertEq(tier.rewardReserve(), 500_000);
    }

    function test_refundClearsTimeButPreservesIdentityIncentivesAndHeldOccupancy() public {
        uint256 tokenId = _purchase(member, 1, referrer);
        vm.prank(creator);
        tier.grantTime(member, 1);

        uint256 shares = tier.sharesOf(tokenId);
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertFalse(tier.isActive(member));
        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.sharesOf(tokenId), shares);
        assertEq(tier.claimableReward(tokenId), 500_000);
        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(lockedReferrer, referrer);
        assertTrue(tier.isOccupied(tokenId));

        vm.prank(payer);
        assertTrue(tier.synchronize(tokenId));
        assertFalse(tier.isOccupied(tokenId));
    }

    function test_giftsFromMultiplePayersRefundOnlyTheRecipient() public {
        vm.prank(payer);
        uint256 tokenId = tier.gift(member, 1, MembershipTypes.ReferralStatus.Unset, address(0));
        address secondPayer = makeAddr("secondPayer");
        _fundAndApprove(secondPayer, 100_000_000);
        vm.prank(secondPayer);
        tier.gift(member, 2, MembershipTypes.ReferralStatus.Unset, address(0));

        vm.warp(_START + 45 days);
        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        assertEq(grossRefund, 15_000_000);
        assertEq(ownerTopUp, 0);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(creator);
        tier.refund(tokenId, grossRefund, ownerTopUp);
        assertEq(paymentToken.balanceOf(member) - memberBefore, 15_000_000);
        assertEq(paymentToken.balanceOf(payer), 90_000_000);
        assertEq(paymentToken.balanceOf(secondPayer), 80_000_000);
    }

    function test_pauseDoesNotBlockCanonicalRefundOrCancellationAdapter() public {
        uint256 tokenId = _purchase(member, 2, address(0));
        vm.prank(creator);
        tier.setPaused(true);

        vm.prank(creator);
        tier.cancelSubscription(tokenId);
        assertFalse(tier.isActive(member));

        vm.prank(creator);
        tier.setPaused(false);
        _purchase(member, 1, address(0));
        vm.prank(creator);
        tier.setPaused(true);
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        assertFalse(tier.isActive(member));
    }

    function test_cancellationAdapterAllowsFullExecutionTimeRefundWithoutCeilings() public {
        uint256 tokenId = _purchase(member, 1, address(0));
        (uint256 previewedRefund, uint256 previewedTopUp) = tier.previewRefund(tokenId);
        assertEq(previewedRefund, 10_000_000);
        assertEq(previewedTopUp, 600_000);

        _purchase(member, 1, address(0));
        vm.prank(creator);
        tier.withdrawCreatorProceeds();
        uint256 creatorBalanceBefore = paymentToken.balanceOf(creator);

        vm.prank(creator);
        tier.cancelSubscription(tokenId);

        assertEq(creatorBalanceBefore - paymentToken.balanceOf(creator), 20_000_000);
        assertFalse(tier.isActive(member));
    }

    function test_cancellationRejectsNativeValueBeforeAuthorityCheck() public {
        uint256 tokenId = _purchase(member, 1, address(0));

        vm.deal(payer, 1 ether);
        vm.prank(payer);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        tier.cancelSubscription{value: 1}(tokenId);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        tier.cancelSubscription(tokenId);
    }

    function test_acceptedOwnershipMovesRefundAuthorityProceedsAndTopUpDuty() public {
        uint256 tokenId = _purchase(member, 1, address(0));
        vm.prank(creator);
        tier.transferOwnership(nextCreator);
        vm.prank(nextCreator);
        tier.acceptOwnership();

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        tier.refund(tokenId, type(uint256).max, type(uint256).max);

        uint256 nextBalanceBefore = paymentToken.balanceOf(nextCreator);
        vm.prank(nextCreator);
        (, uint256 topUp) = tier.refund(tokenId, type(uint256).max, type(uint256).max);

        assertEq(topUp, 600_000);
        assertEq(paymentToken.balanceOf(nextCreator), nextBalanceBefore - topUp);
        assertEq(tier.creatorProceeds(), 0);
    }

    function testFuzz_fixedPreviewMatchesSlowTimeModel(
        uint8 rawPeriods,
        uint64 rawElapsed,
        uint8 rawGrantPeriods
    ) public {
        uint64 periods = uint64(bound(rawPeriods, 1, 8));
        uint64 grantPeriods = uint64(bound(rawGrantPeriods, 0, 4));
        uint256 tokenId = _purchase(member, periods, address(0));
        if (grantPeriods != 0) {
            vm.prank(creator);
            tier.grantTime(member, grantPeriods);
        }

        uint256 paidDuration = uint256(periods) * _PERIOD;
        uint256 elapsed = bound(rawElapsed, 0, paidDuration + uint256(grantPeriods) * _PERIOD);
        vm.warp(_START + elapsed);
        uint256 remainingPaid = elapsed >= paidDuration ? 0 : paidDuration - elapsed;

        uint256 expected = MembershipModel.fixedRefund(remainingPaid, 10_000_000, _PERIOD);
        (uint256 actual,) = tier.previewRefund(tokenId);
        assertEq(actual, expected);
    }

    function _purchase(address account, uint64 periods, address referralChoice)
        private
        returns (uint256 tokenId)
    {
        vm.prank(account);
        tokenId = tier.purchase(periods, referralChoice);
    }

    function _fundAndApprove(address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(tier), type(uint256).max);
    }
}

contract ZeroPriceRefundsTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;

    address private creator;
    address private member;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        creator = makeAddr("zeroCreator");
        member = makeAddr("zeroMember");
        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = _deployZeroTier();
        paymentToken.mint(member, 1_000_000_000);
        paymentToken.mint(creator, 1_000_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(creator);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_mixedZeroAndPositiveLotsRefundInBothOrders() public {
        _contribute(0);
        uint256 tokenId = _contribute(10_000_000);
        (uint256 zeroFirstRefund, uint256 zeroFirstTopUp) = tier.previewRefund(tokenId);
        assertEq(zeroFirstRefund, 10_000_000);
        assertEq(zeroFirstTopUp, 600_000);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);

        _contribute(10_000_000);
        _contribute(0);
        (uint256 positiveFirstRefund, uint256 positiveFirstTopUp) = tier.previewRefund(tokenId);
        assertEq(positiveFirstRefund, 10_000_000);
        assertEq(positiveFirstTopUp, 600_000);
    }

    function test_partialCurrentLotPlusLaterFullLotsUsesCumulativePrefixRange() public {
        uint256 tokenId = _contribute(12_000_000);
        _contribute(3_000_000);
        _contribute(5_000_000);
        vm.warp(_START + 15 days);

        (uint256 grossRefund, uint256 topUp) = tier.previewRefund(tokenId);
        assertEq(grossRefund, 14_000_000);
        assertEq(topUp, 0);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(creator);
        tier.refund(tokenId, grossRefund, topUp);
        assertEq(paymentToken.balanceOf(member) - memberBefore, grossRefund);
    }

    function test_refundThenRejoinNeverExposesOldPrefixes() public {
        uint256 tokenId = _contribute(4_000_000);
        _contribute(2_000_000);
        vm.warp(_START + 15 days);
        assertEq(_grossPreview(tokenId), 4_000_000);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);

        _contribute(3_000_000);
        vm.warp(block.timestamp + 15 days);
        assertEq(_grossPreview(tokenId), 1_500_000);
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        assertEq(_grossPreview(tokenId), 0);
    }

    function test_paidTimeConsumptionAdvancesLotsBeforeGrantTime() public {
        uint256 tokenId = _contribute(8_000_000);
        vm.prank(creator);
        tier.grantTime(member, 1);

        vm.warp(_START + 15 days);
        assertEq(_grossPreview(tokenId), 4_000_000);
        vm.warp(_START + 30 days);
        assertEq(_grossPreview(tokenId), 0);
        vm.warp(_START + 45 days);
        assertEq(_grossPreview(tokenId), 0);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
    }

    function test_prorationRoundsDownInPaymentTokenBaseUnits() public {
        uint256 tokenId = _contribute(1);
        assertEq(_grossPreview(tokenId), 1);
        vm.warp(_START + 1);
        assertEq(_grossPreview(tokenId), 0);
    }

    function test_previewMatchesOracleAtLotBoundaries() public {
        uint256 tokenId = _contribute(_PERIOD);
        _contribute(2 * _PERIOD);
        _contribute(3 * _PERIOD);

        vm.warp(_START + _PERIOD - 1);
        assertEq(_grossPreview(tokenId), 5 * _PERIOD + 1);
        vm.warp(_START + _PERIOD);
        assertEq(_grossPreview(tokenId), 5 * _PERIOD);
        vm.warp(_START + 2 * _PERIOD);
        assertEq(_grossPreview(tokenId), 3 * _PERIOD);
        vm.warp(_START + 3 * _PERIOD);
        assertEq(_grossPreview(tokenId), 0);
    }

    function test_thousandsOfLotsDoNotIncreaseRefundExecutionGas() public {
        uint256 tokenId = _contribute(0);
        uint256 gasBefore = gasleft();
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        uint256 singleLotGas = gasBefore - gasleft();

        for (uint256 i; i < 2000; ++i) {
            _contribute(0);
        }
        gasBefore = gasleft();
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        uint256 manyLotGas = gasBefore - gasleft();

        assertLe(manyLotGas, singleLotGas + 10_000);
    }

    function testFuzz_previewMatchesSlowLotOracleAcrossTimeAndInterleavedGrants(
        uint96[8] memory rawGross,
        uint64 rawElapsed
    ) public {
        uint256[] memory grossLots = new uint256[](rawGross.length);
        for (uint256 i; i < rawGross.length; ++i) {
            grossLots[i] = bound(rawGross[i], 0, 10_000_000);
            _contribute(grossLots[i]);
            if (i == 2 || i == 5) {
                vm.prank(creator);
                tier.grantTime(member, 1);
            }
        }

        uint256 totalPaidSeconds = grossLots.length * _PERIOD;
        uint256 elapsed = bound(rawElapsed, 0, totalPaidSeconds + 2 * _PERIOD);
        vm.warp(_START + elapsed);
        uint256 consumedPaid = elapsed > totalPaidSeconds ? totalPaidSeconds : elapsed;

        uint256 expected = MembershipModel.variableRefund(grossLots, _PERIOD, consumedPaid);
        assertEq(_grossPreview(tier.tokenOf(member)), expected);
    }

    function _deployZeroTier() private returns (MembershipTier zeroTier) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer));
        config.pricePerPeriod = 0;
        config.maxPrepaidPeriods = 0;
        zeroTier = new MembershipTier(makeAddr("zeroFactory"), paymentToken, config);
    }

    function _contribute(uint256 gross) private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.contribute(gross, address(0));
    }

    function _grossPreview(uint256 tokenId) private view returns (uint256 grossRefund) {
        (grossRefund,) = tier.previewRefund(tokenId);
    }
}

contract ReentrantRefundOwner {
    AdversarialERC20 private immutable _paymentToken;
    MembershipTier private immutable _tier;
    address private immutable _member;

    constructor(AdversarialERC20 paymentToken, MembershipTier tier, address member) {
        _paymentToken = paymentToken;
        _tier = tier;
        _member = member;
    }

    function acceptAndApprove() external {
        _tier.acceptOwnership();
        _paymentToken.approve(address(_tier), type(uint256).max);
    }

    function refund(uint256 tokenId) external {
        _tier.refund(tokenId, type(uint256).max, type(uint256).max);
    }

    function reenterGrant() external {
        _tier.grantTime(_member, 1);
    }
}

contract AdversarialRefundsTest is Test {
    AdversarialERC20 private paymentToken;
    MembershipTier private tier;

    address private creator;
    address private member;

    function setUp() public {
        creator = makeAddr("adversarialCreator");
        member = makeAddr("adversarialMember");
        paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            makeAddr("adversarialFactory"),
            paymentToken,
            MembershipTestConfig.defaultConfig(creator, address(renderer))
        );
        paymentToken.mint(member, 100_000_000);
        paymentToken.mint(creator, 100_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(creator);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(member);
        tier.purchase(1, address(0));
    }

    function test_falseRevertingShortTaxedAndFrozenTopUpsLeaveRefundStateUnchanged() public {
        _expectFailedTopUp(
            AdversarialERC20.Behavior.ReturnFalse,
            abi.encodeWithSelector(
                SafeERC20.SafeERC20FailedOperation.selector, address(paymentToken)
            )
        );
        _expectFailedTopUp(
            AdversarialERC20.Behavior.RevertTransfer,
            abi.encodeWithSelector(AdversarialERC20.ForcedTransferRevert.selector)
        );
        _expectFailedTopUp(
            AdversarialERC20.Behavior.ShortTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );
        _expectFailedTopUp(
            AdversarialERC20.Behavior.TaxedTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );

        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(creator, true);
        vm.prank(creator);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();
    }

    function test_falseRevertingShortTaxedAndFrozenRefundDeliveryIsAtomic() public {
        _expectFailedDelivery(
            AdversarialERC20.Behavior.ReturnFalse,
            abi.encodeWithSelector(
                SafeERC20.SafeERC20FailedOperation.selector, address(paymentToken)
            )
        );
        _expectFailedDelivery(
            AdversarialERC20.Behavior.RevertTransfer,
            abi.encodeWithSelector(AdversarialERC20.ForcedTransferRevert.selector)
        );
        _expectFailedDelivery(
            AdversarialERC20.Behavior.ShortTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );
        _expectFailedDelivery(
            AdversarialERC20.Behavior.TaxedTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(member, true);
        vm.prank(creator);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();
    }

    function test_newOwnerAllowanceAndBalanceFailuresPreservePriorOwnerEconomics() public {
        address unfundedOwner = makeAddr("unfundedOwner");
        vm.prank(creator);
        tier.transferOwnership(unfundedOwner);
        vm.prank(unfundedOwner);
        tier.acceptOwnership();

        vm.prank(unfundedOwner);
        vm.expectRevert();
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();

        vm.prank(unfundedOwner);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(unfundedOwner);
        vm.expectRevert();
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();
    }

    function test_topUpCallbackCannotReenterGrantAfterRefundClearsTime() public {
        ReentrantRefundOwner refundOwner = new ReentrantRefundOwner(paymentToken, tier, member);
        vm.prank(creator);
        tier.transferOwnership(address(refundOwner));
        refundOwner.acceptAndApprove();
        paymentToken.mint(address(refundOwner), 600_000);
        paymentToken.setCallback(
            address(refundOwner), abi.encodeCall(ReentrantRefundOwner.reenterGrant, ())
        );
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Callback);

        refundOwner.refund(1);

        assertEq(paymentToken.callbackAttempts(), 1);
        assertFalse(paymentToken.lastCallbackSucceeded());
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(1);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
    }

    function _expectFailedTopUp(AdversarialERC20.Behavior behavior, bytes memory revertData)
        private
    {
        paymentToken.setTransferFromBehavior(behavior);
        vm.prank(creator);
        vm.expectRevert(revertData);
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
    }

    function _expectFailedDelivery(AdversarialERC20.Behavior behavior, bytes memory revertData)
        private
    {
        paymentToken.setTransferBehavior(behavior);
        vm.prank(creator);
        vm.expectRevert(revertData);
        tier.refund(1, type(uint256).max, type(uint256).max);
        _assertRefundStateUnchanged();
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
    }

    function _assertRefundStateUnchanged() private view {
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(1);
        assertEq(paidSeconds, 30 days);
        assertEq(grantSeconds, 0);
        assertEq(tier.creatorProceeds(), 9_400_000);
        assertEq(tier.rewardReserve(), 500_000);
        assertEq(paymentToken.balanceOf(address(tier)), 9_900_000);
        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(1);
        assertEq(grossRefund, 10_000_000);
        assertEq(ownerTopUp, 600_000);
    }
}
