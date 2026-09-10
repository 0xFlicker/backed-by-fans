// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

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
        new LinkedVestingFixture().install();
        vm.warp(_START);
        creator = makeAddr("creator");
        nextCreator = makeAddr("nextCreator");
        member = makeAddr("member");
        payer = makeAddr("payer");
        referrer = makeAddr("referrer");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("factory"), address(paymentToken)),
            paymentToken,
            config
        );
        _fundAndApprove(member, 100_000_000);
        _fundAndApprove(payer, 100_000_000);
        _fundAndApprove(creator, 100_000_000);
        _fundAndApprove(nextCreator, 100_000_000);
    }

    function test_fixedRefundProratesAllRemainingPaidSecondsAtImmutablePrice() public {
        uint256 id = _purchase(member, 2, address(0));
        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        assertTrue(quote.complete);
        assertEq(quote.grossRefund, 15_000_000);
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            sum += quote.fundingScaled[i];
        }
        assertEq(sum, quote.grossRefund * (1 << 128));
        vm.prank(creator);
        assertEq(tier.refund(id, quote.grossRefund), quote.grossRefund);
        assertEq(paymentToken.balanceOf(member), 95_000_000);
        assertApproxEqAbs(tier.creatorProceeds(), 4_700_000, 1);
        assertApproxEqAbs(tier.claimableReward(id), 250_000, 1);
        assertEq(tier.totalProtectedLiability(), 5_000_000);
        assertEq(tier.lifetimeGross(), 20_000_000);
        assertEq(tier.sharesOf(id), 20_000_000);
    }

    function test_immediateRefundUsesOnlyThisMembershipReservedFunding() public {
        uint256 id = _purchase(member, 1, address(0));
        uint256 ownerBalance = paymentToken.balanceOf(creator);
        vm.prank(creator);
        paymentToken.approve(address(tier), 0);
        vm.prank(creator);
        tier.refund(id, 10_000_000);
        assertEq(paymentToken.balanceOf(creator), ownerBalance);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
        assertEq(paymentToken.balanceOf(address(tier)), 0);
        assertEq(tier.totalProtectedLiability(), 0);
        assertEq(tier.claimableReward(id), 0);
        assertEq(tier.creatorProceeds(), 0);
    }

    function test_partialRefundAfterAllClaimsNeedsNoOwnerBalanceOrAllowance() public {
        uint256 id = _purchase(member, 2, referrer);
        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        vm.prank(creator);
        tier.withdrawCreatorProceeds();
        vm.prank(member);
        tier.claimReward(id);
        vm.prank(referrer);
        tier.claimReferral();
        tier.releaseProtocolFees();
        uint256 ownerBalance = paymentToken.balanceOf(creator);
        vm.prank(creator);
        assertTrue(paymentToken.transfer(payer, ownerBalance));
        vm.prank(creator);
        paymentToken.approve(address(tier), 0);
        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(creator);
        assertEq(tier.refund(id, 15_000_000), 15_000_000);
        assertEq(paymentToken.balanceOf(member), memberBefore + 15_000_000);
        assertEq(paymentToken.balanceOf(creator), 0);
        assertEq(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
        uint256 retained = paymentToken.balanceOf(address(tier));
        vm.warp(_START + 90 days);
        tier.processAccounting(25);
        assertEq(paymentToken.balanceOf(address(tier)), retained);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(id), 0);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
    }

    function test_refundRejectsPaidTimeAddedAfterPreviewAtomically() public {
        _purchase(payer, 2, address(0));
        uint256 id = _purchase(member, 1, address(0));
        uint256 preview = tier.previewRefund(id).grossRefund;
        _purchase(member, 1, address(0));
        bytes32 before = keccak256(
            abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
        );
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.GrossRefundLimitExceeded.selector, 20_000_000, preview
            )
        );
        tier.refund(id, preview);
        assertEq(
            keccak256(
                abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
            ),
            before
        );
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.sharesOf(id), 20_000_000);
    }

    function test_fullyVestedCancellationKeepsAllEarnedEntitlements() public {
        uint256 id = _purchase(member, 1, referrer);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        assertEq(tier.creatorProceeds(), 9_300_000);
        uint256 credit = tier.claimableReward(id);
        vm.prank(creator);
        assertEq(tier.refund(id, 0), 0);
        assertEq(tier.creatorProceeds(), 9_300_000);
        assertEq(tier.claimableReward(id), credit);
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.protocolFeeEarnedHeld(), 100_000);
        assertEq(paymentToken.balanceOf(address(tier)), 10_000_000);
    }

    function test_unsolicitedSurplusIsNotRefundFundingOrBeneficiaryCash() public {
        uint256 id = _purchase(member, 1, address(0));
        paymentToken.mint(address(tier), 2_000_000);
        assertEq(tier.previewRefund(id).grossRefund, 10_000_000);
        vm.prank(creator);
        tier.refund(id, 10_000_000);
        assertEq(paymentToken.balanceOf(address(tier)), 2_000_000);
        assertEq(tier.totalProtectedLiability(), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(id), 0);
    }

    function test_refundClearsTimeButPreservesIdentityIncentivesAndHeldOccupancy() public {
        uint256 tokenId = _purchase(member, 1, referrer);
        vm.prank(creator);
        tier.grantTime(member, 1);

        uint256 shares = tier.sharesOf(tokenId);
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertFalse(tier.isActive(member));
        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.sharesOf(tokenId), shares);
        assertEq(tier.claimableReward(tokenId), 0);
        assertFalse(tier.rewardEligible(tokenId));
        assertEq(tier.totalRewardShares(), 0);
        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(lockedReferrer, referrer);
        assertTrue(tier.isOccupied(tokenId));

        vm.prank(creator);
        assertEq(_sync(tokenId), 1);
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
        tier.processAccounting(25);
        uint256 grossRefund = tier.previewRefund(tokenId).grossRefund;
        assertEq(grossRefund, 15_000_000);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(creator);
        tier.refund(tokenId, grossRefund);
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
        tier.refund(tokenId, type(uint256).max);
        assertFalse(tier.isActive(member));
    }

    function test_cancellationAdapterAllowsFullExecutionTimeRefundWithoutCeilings() public {
        uint256 id = _purchase(member, 1, address(0));
        assertEq(tier.previewRefund(id).grossRefund, 10_000_000);
        _purchase(member, 1, address(0));
        uint256 ownerBefore = paymentToken.balanceOf(creator);
        vm.prank(creator);
        tier.cancelSubscription(id);
        assertEq(paymentToken.balanceOf(creator), ownerBefore);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
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

    function test_acceptedOwnershipMovesRefundAuthorityAndAllUnclaimedCreatorEarnings() public {
        uint256 id = _purchase(member, 1, address(0));
        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        uint256 earned = tier.creatorProceeds();
        vm.prank(creator);
        tier.transferOwnership(nextCreator);
        vm.prank(nextCreator);
        tier.acceptOwnership();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        tier.refund(id, type(uint256).max);
        vm.prank(nextCreator);
        paymentToken.approve(address(tier), 0);
        uint256 ownerBefore = paymentToken.balanceOf(nextCreator);
        vm.prank(nextCreator);
        tier.refund(id, 5_000_000);
        assertEq(paymentToken.balanceOf(nextCreator), ownerBefore);
        assertEq(tier.creatorProceeds(), earned);
        vm.prank(nextCreator);
        assertEq(tier.withdrawCreatorProceeds(), earned);
        assertEq(paymentToken.balanceOf(nextCreator), ownerBefore + earned);
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
        tier.processAccounting(25);
        uint256 actual = tier.previewRefund(tokenId).grossRefund;
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

    function _sync(uint256 tokenId) private returns (uint256 burnedCount) {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        burnedCount = tier.synchronizeExpiredMemberships(tokenIds);
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
        new LinkedVestingFixture().install();
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
        uint256 zeroFirstRefund = tier.previewRefund(tokenId).grossRefund;
        assertEq(zeroFirstRefund, 10_000_000);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);

        _contribute(10_000_000);
        _contribute(0);
        uint256 positiveFirstRefund = tier.previewRefund(tokenId).grossRefund;
        assertEq(positiveFirstRefund, 10_000_000);
    }

    function test_partialCurrentLotPlusLaterFullLotsUsesCumulativePrefixRange() public {
        uint256 tokenId = _contribute(12_000_000);
        _contribute(3_000_000);
        _contribute(5_000_000);
        vm.warp(_START + 15 days);
        tier.processAccounting(25);

        uint256 grossRefund = tier.previewRefund(tokenId).grossRefund;
        assertEq(grossRefund, 14_000_000);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(creator);
        tier.refund(tokenId, grossRefund);
        assertEq(paymentToken.balanceOf(member) - memberBefore, grossRefund);
    }

    function test_refundThenRejoinNeverExposesOldPrefixes() public {
        uint256 tokenId = _contribute(4_000_000);
        _contribute(2_000_000);
        vm.warp(_START + 15 days);
        assertEq(_grossPreview(tokenId), 4_000_000);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);

        _contribute(3_000_000);
        vm.warp(block.timestamp + 15 days);
        assertEq(_grossPreview(tokenId), 1_500_000);
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);
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
        tier.refund(tokenId, type(uint256).max);
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
        tier.refund(tokenId, type(uint256).max);
        uint256 singleLotGas = gasBefore - gasleft();

        for (uint256 i; i < 2000; ++i) {
            _contribute(0);
        }
        gasBefore = gasleft();
        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);
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
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        config.pricePerPeriod = 0;
        config.maxPrepaidPeriods = 0;
        zeroTier = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("zeroFactory"), address(paymentToken)),
            paymentToken,
            config
        );
    }

    function _contribute(uint256 gross) private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.contribute(gross, address(0));
    }

    function _grossPreview(uint256 tokenId) private returns (uint256 grossRefund) {
        tier.processAccounting(25);
        grossRefund = tier.previewRefund(tokenId).grossRefund;
    }
}

contract ReentrantRefundOwner {
    MembershipTier private immutable _tier;
    address private immutable _member;

    constructor(MembershipTier tier, address member) {
        _tier = tier;
        _member = member;
    }

    function accept() external {
        _tier.acceptOwnership();
    }

    function refund(uint256 tokenId) external {
        _tier.refund(tokenId, type(uint256).max);
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
        new LinkedVestingFixture().install();
        creator = makeAddr("adversarialCreator");
        member = makeAddr("adversarialMember");
        paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("adversarialFactory"), address(paymentToken)),
            paymentToken,
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken))
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

    function test_refundNeverPullsFromAFrozenOwnerWithBrokenTransferFrom() public {
        paymentToken.setFrozen(creator, true);
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.prank(creator);
        tier.refund(1, 10_000_000);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
        assertEq(paymentToken.balanceOf(creator), 100_000_000);
        assertEq(tier.creatorProceeds(), 0);
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
        tier.refund(1, type(uint256).max);
        _assertRefundStateUnchanged();
    }

    function test_unfundedNewOwnerCanRefundWithoutAllowance() public {
        address newOwner = makeAddr("unfundedOwner");
        vm.prank(creator);
        tier.transferOwnership(newOwner);
        vm.prank(newOwner);
        tier.acceptOwnership();
        assertEq(paymentToken.allowance(newOwner, address(tier)), 0);
        assertEq(paymentToken.balanceOf(newOwner), 0);
        vm.prank(newOwner);
        assertEq(tier.refund(1, 10_000_000), 10_000_000);
        assertEq(paymentToken.balanceOf(newOwner), 0);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
    }

    function test_deliveryCallbackCannotReenterGrantAfterRefundClearsTime() public {
        ReentrantRefundOwner refundOwner = new ReentrantRefundOwner(tier, member);
        vm.prank(creator);
        tier.transferOwnership(address(refundOwner));
        refundOwner.accept();
        paymentToken.mint(address(refundOwner), 600_000);
        paymentToken.setCallback(
            address(refundOwner), abi.encodeCall(ReentrantRefundOwner.reenterGrant, ())
        );
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Callback);

        refundOwner.refund(1);

        assertEq(paymentToken.callbackAttempts(), 1);
        assertFalse(paymentToken.lastCallbackSucceeded());
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(1);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
    }

    function _expectFailedDelivery(AdversarialERC20.Behavior behavior, bytes memory revertData)
        private
    {
        paymentToken.setTransferBehavior(behavior);
        vm.prank(creator);
        vm.expectRevert(revertData);
        tier.refund(1, type(uint256).max);
        _assertRefundStateUnchanged();
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
    }

    function _assertRefundStateUnchanged() private view {
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(1);
        assertEq(paidSeconds, 30 days);
        assertEq(grantSeconds, 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(1), 0);
        assertEq(paymentToken.balanceOf(address(tier)), 10_000_000);
        assertEq(tier.reserveState().unearnedScaled[0], 9_400_000 * (1 << 128));
        assertEq(tier.reserveState().unearnedScaled[1], 500_000 * (1 << 128));
        assertEq(tier.reserveState().unearnedScaled[3], 100_000 * (1 << 128));
        assertEq(tier.allocationState(1).generation, 0);
        assertEq(tier.previewRefund(1).grossRefund, 10_000_000);
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertTrue(tier.rewardEligible(1));
    }
}
