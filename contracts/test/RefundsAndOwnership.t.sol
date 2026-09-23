// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {cancelPayout} from "./helpers/CancellationAssertions.sol";

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {MembershipModel} from "./models/MembershipModel.sol";

function retiredCreditScaled(MembershipTier tier, address beneficiary) view returns (uint256) {
    (uint256 raw, uint256 fractional) = tier.claimableRetiredReward(beneficiary);
    return raw * (1 << 128) + fractional;
}

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
        tier = MembershipTestConfig.deployTier(
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
        MembershipTypes.CancellationPreview memory quote =
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25);
        assertTrue(quote.complete);
        assertEq(quote.ownerRefund, 15_000_000);
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            sum += quote.fundingScaled[i];
        }
        assertEq(sum, quote.ownerRefund * (1 << 128));
        vm.prank(member);
        assertEq(cancelPayout(tier, id, member, quote.ownerRefund, 25), quote.ownerRefund);
        assertEq(paymentToken.balanceOf(member), 95_000_000);
        assertApproxEqAbs(tier.creatorProceeds(), 4_700_000, 1);
        assertApproxEqAbs(retiredCreditScaled(tier, member) / (1 << 128), 250_000, 1);
        assertEq(tier.totalProtectedLiability(), 5_000_000);
        assertEq(tier.lifetimeGross(), 20_000_000);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.occupiedSupply(), 0);
        _assertBurned(id);
    }

    function test_immediateRefundUsesOnlyThisMembershipReservedFunding() public {
        uint256 id = _purchase(member, 1, address(0));
        uint256 ownerBalance = paymentToken.balanceOf(creator);
        vm.prank(creator);
        paymentToken.approve(address(tier), 0);
        vm.prank(member);
        cancelPayout(tier, id, member, 10_000_000, 25);
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
        tier.claimReward(id, 25);
        vm.prank(referrer);
        tier.claimReferral();
        tier.releaseProtocolFees();
        uint256 ownerBalance = paymentToken.balanceOf(creator);
        vm.prank(creator);
        assertTrue(paymentToken.transfer(payer, ownerBalance));
        vm.prank(creator);
        paymentToken.approve(address(tier), 0);
        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(member);
        assertEq(cancelPayout(tier, id, member, 15_000_000, 25), 15_000_000);
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

    function test_addedFundingImprovesCancellationAboveReviewedMinimum() public {
        _purchase(payer, 2, address(0));
        uint256 id = _purchase(member, 1, address(0));
        uint256 minimum =
            tier.previewCancellation(id, uint64(block.timestamp + 120), 25).minOwnerRefund;
        vm.prank(member);
        tier.renewMembership(id, 1, address(0), 25);
        vm.prank(member);
        assertEq(cancelPayout(tier, id, member, minimum, 25), 20_000_000);
        _assertBurned(id);
    }

    function test_refundRejectsExpectedOwnerMismatchWithoutPaymentOrRetirement() public {
        uint256 id = _purchase(member, 1, address(0));
        bytes32 before = keccak256(
            abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
        );
        uint256 memberBalance = paymentToken.balanceOf(member);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.MembershipOwnerMismatch.selector, id, payer, member
            )
        );
        cancelPayout(tier, id, payer, 0, 25);
        assertEq(
            keccak256(
                abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
            ),
            before
        );
        assertEq(tier.ownerOf(id), member);
        assertEq(tier.occupiedSupply(), 1);
        assertEq(tier.sharesOf(id), 10_000_000);
        assertEq(paymentToken.balanceOf(member), memberBalance);
        assertEq(retiredCreditScaled(tier, member), 0);
    }

    function test_giftOwnerCanCancelButOriginalPayerAndCreatorCannot() public {
        vm.prank(payer);
        uint256 id = tier.giftMembership(member, 1, 25);
        address[2] memory unauthorized = [creator, payer];
        for (uint256 i; i < unauthorized.length; ++i) {
            vm.prank(unauthorized[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IERC721Errors.ERC721InsufficientApproval.selector, unauthorized[i], id
                )
            );
            cancelPayout(tier, id, member, 0, 25);
            vm.prank(unauthorized[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IERC721Errors.ERC721InsufficientApproval.selector, unauthorized[i], id
                )
            );
            tier.cancelSubscription(id);
        }
        uint256 before = paymentToken.balanceOf(member);
        vm.prank(member);
        cancelPayout(tier, id, member, 0, 25);
        assertEq(paymentToken.balanceOf(member) - before, 10_000_000);
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_fullyVestedRetirementKeepsEntitlementsAndRejectsFurtherCancellation() public {
        uint256 id = _purchase(member, 1, referrer);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        uint256 credit = retiredCreditScaled(tier, member);
        assertGt(credit, 0);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        cancelPayout(tier, id, member, 0, 25);
        assertEq(tier.creatorProceeds(), 9_300_000);
        assertEq(retiredCreditScaled(tier, member), credit);
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.protocolFeeEarnedHeld(), 100_000);
        assertEq(paymentToken.balanceOf(address(tier)), 10_000_000);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_unsolicitedSurplusIsNotRefundFundingOrBeneficiaryCash() public {
        uint256 id = _purchase(member, 1, address(0));
        paymentToken.mint(address(tier), 2_000_000);
        assertEq(
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25).ownerRefund, 10_000_000
        );
        vm.prank(member);
        cancelPayout(tier, id, member, 10_000_000, 25);
        assertEq(paymentToken.balanceOf(address(tier)), 2_000_000);
        assertEq(tier.totalProtectedLiability(), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(id), 0);
    }

    function test_refundPermanentlyRetiresPositionAndReleasesCapacityAndAssociation() public {
        uint256 tokenId = _purchase(member, 1, referrer);
        vm.prank(creator);
        tier.addGrantTime(tokenId, member, 1, 25);
        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        _assertBurned(tokenId);
        assertEq(tier.balanceOf(member), 0);
        assertEq(tier.sharesOf(tokenId), 0);
        assertEq(tier.claimableReward(tokenId), 0);
        assertFalse(tier.rewardEligible(tokenId));
        assertEq(tier.totalRewardShares(), 0);
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertEq(tier.allocationLots(tokenId, 0, 0, 10)[0].gross, 10_000_000);
        assertEq(tier.processExpirations(25).retiredCount, 0);
        uint256 fresh = _purchase(member, 1, address(0));
        assertGt(fresh, tokenId);
        assertEq(tier.sharesOf(fresh), 10_000_000);
        assertEq(tier.lifetimeGross(), 20_000_000);
    }

    function test_giftsFromMultiplePayersRefundOnlyTheRecipient() public {
        vm.prank(payer);
        uint256 tokenId = tier.giftMembership(member, 1, 25);
        address secondPayer = makeAddr("secondPayer");
        _fundAndApprove(secondPayer, 100_000_000);
        vm.prank(secondPayer);
        tier.giftRenewal(tokenId, member, 2, MembershipTypes.ReferralStatus.Unset, address(0), 25);

        vm.warp(_START + 45 days);
        tier.processAccounting(25);
        uint256 grossRefund =
            tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25).ownerRefund;
        assertEq(grossRefund, 15_000_000);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(member);
        cancelPayout(tier, tokenId, member, grossRefund, 25);
        assertEq(paymentToken.balanceOf(member) - memberBefore, 15_000_000);
        assertEq(paymentToken.balanceOf(payer), 90_000_000);
        assertEq(paymentToken.balanceOf(secondPayer), 80_000_000);
    }

    function test_pauseDoesNotBlockCanonicalRefundOrCancellationAdapter() public {
        uint256 tokenId = _purchase(member, 2, address(0));
        vm.prank(creator);
        tier.setPaused(true);

        vm.prank(member);
        tier.cancelSubscription(tokenId);
        assertEq(tier.balanceOf(member), 0);

        vm.prank(creator);
        tier.setPaused(false);
        tokenId = _purchase(member, 1, address(0));
        vm.prank(creator);
        tier.setPaused(true);
        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        assertEq(tier.balanceOf(member), 0);
    }

    function test_cancellationAdapterAllowsFullExecutionTimeRefundWithoutCeilings() public {
        uint256 id = _purchase(member, 1, address(0));
        assertEq(
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25).ownerRefund, 10_000_000
        );
        vm.prank(member);
        tier.renewMembership(id, 1, address(0), 25);
        uint256 ownerBefore = paymentToken.balanceOf(creator);
        vm.prank(member);
        tier.cancelSubscription(id);
        assertEq(paymentToken.balanceOf(creator), ownerBefore);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
        assertEq(tier.balanceOf(member), 0);
    }

    function test_cancellationRejectsNativeValueBeforeAuthorityCheck() public {
        uint256 tokenId = _purchase(member, 1, address(0));

        vm.deal(payer, 1 ether);
        vm.prank(payer);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        tier.cancelSubscription{value: 1}(tokenId);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC721Errors.ERC721InsufficientApproval.selector, payer, tokenId
            )
        );
        tier.cancelSubscription(tokenId);
    }

    function test_administrationTransferMovesEarningsButDoesNotAuthorizeCancellation() public {
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
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, creator, id)
        );
        cancelPayout(tier, id, member, 0, 25);
        vm.prank(nextCreator);
        paymentToken.approve(address(tier), 0);
        uint256 ownerBefore = paymentToken.balanceOf(nextCreator);
        vm.prank(member);
        cancelPayout(tier, id, member, 5_000_000, 25);
        assertEq(paymentToken.balanceOf(nextCreator), ownerBefore);
        assertEq(tier.creatorProceeds(), earned);
        vm.prank(nextCreator);
        assertEq(tier.withdrawCreatorProceeds(), earned);
        assertEq(paymentToken.balanceOf(nextCreator), ownerBefore + earned);
    }

    function test_transferredGiftRefundAndEarnedCreditBelongToCurrentNftOwner() public {
        address recipient = makeAddr("transferred gift recipient");
        vm.prank(payer);
        uint256 id = tier.giftMembership(member, 2, 25);
        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        uint256 earned = tier.claimableReward(id);
        uint256 originalMemberBalance = paymentToken.balanceOf(member);
        uint256 originalPayerBalance = paymentToken.balanceOf(payer);
        uint256 creatorBalance = paymentToken.balanceOf(creator);
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        MembershipTypes.CancellationPreview memory quote =
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25);
        assertEq(quote.owner, recipient);
        assertEq(quote.ownerRefund, 15_000_000);
        vm.prank(recipient);
        assertEq(cancelPayout(tier, id, recipient, quote.ownerRefund, 25), 15_000_000);
        assertEq(paymentToken.balanceOf(recipient), 15_000_000);
        assertEq(paymentToken.balanceOf(member), originalMemberBalance);
        assertEq(paymentToken.balanceOf(payer), originalPayerBalance);
        assertEq(paymentToken.balanceOf(creator), creatorBalance);
        assertEq(retiredCreditScaled(tier, recipient) / (1 << 128), earned);
        assertEq(retiredCreditScaled(tier, member), 0);
        assertEq(retiredCreditScaled(tier, payer), 0);
        assertEq(tier.lifetimeGross(), 20_000_000);
        _assertBurned(id);
    }

    function test_transferInvalidatesPinnedRefundRecipientWithoutChangingRefundQuoteEconomics()
        public
    {
        address recipient = makeAddr("refund quote recipient");
        uint256 id = _purchase(member, 2, referrer);
        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        MembershipTypes.CancellationPreview memory oldQuote =
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25);
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        MembershipTypes.CancellationPreview memory freshQuote =
            tier.previewCancellation(id, uint64(block.timestamp + 1), 25);
        assertEq(oldQuote.owner, member);
        assertEq(freshQuote.owner, recipient);
        assertEq(freshQuote.ownerRefund, oldQuote.ownerRefund);
        assertEq(freshQuote.generation, oldQuote.generation);
        assertTrue(freshQuote.complete);
        bytes32 before = keccak256(
            abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
        );
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.MembershipOwnerMismatch.selector, id, member, recipient
            )
        );
        cancelPayout(tier, id, oldQuote.owner, oldQuote.ownerRefund, 25);
        assertEq(
            keccak256(
                abi.encode(tier.allocationState(id), tier.reserveState(), tier.accountingStatus())
            ),
            before
        );
        assertEq(tier.ownerOf(id), recipient);
        assertEq(retiredCreditScaled(tier, recipient), 0);
        vm.prank(freshQuote.owner);
        assertEq(
            cancelPayout(tier, id, freshQuote.owner, freshQuote.ownerRefund, 25),
            freshQuote.ownerRefund
        );
    }

    function test_transferredNftOwnerAndOperatorsCanCancelAndFormerOwnerCannot() public {
        address recipient = makeAddr("cancellation recipient");
        address operator = makeAddr("cancellation operator");
        uint256 id = _purchase(member, 1, address(0));
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        vm.prank(recipient);
        tier.approve(payer, id);
        vm.prank(recipient);
        tier.setApprovalForAll(operator, true);
        vm.prank(member);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, member, id)
        );
        tier.cancelSubscription(id);
        uint256 snapshot = vm.snapshotState();
        address[3] memory authorized = [recipient, payer, operator];
        for (uint256 i; i < authorized.length; ++i) {
            vm.prank(authorized[i]);
            cancelPayout(tier, id, recipient, 10_000_000, 25);
            assertEq(paymentToken.balanceOf(recipient), 10_000_000);
            _assertBurned(id);
            assertTrue(vm.revertToState(snapshot));
        }
    }

    function test_memberCancellationAdapterUsesExecutionTimeOwnerAfterTransfer() public {
        address recipient = makeAddr("cancel adapter recipient");
        uint256 id = _purchase(member, 1, address(0));
        uint256 memberBalance = paymentToken.balanceOf(member);
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        vm.prank(creator);
        tier.setPaused(true);
        vm.prank(recipient);
        tier.cancelSubscription(id);
        assertEq(paymentToken.balanceOf(recipient), 10_000_000);
        assertEq(paymentToken.balanceOf(member), memberBalance);
        assertEq(tier.balanceOf(recipient), 0);
        _assertBurned(id);
    }

    function test_sponsorshipRequiresFreshOwnerAndReferralSnapshotsAfterTransfer() public {
        address recipient = makeAddr("sponsored transfer recipient");
        _fundAndApprove(recipient, 100_000_000);
        vm.prank(payer);
        uint256 id = tier.giftMembership(member, 1, 25);
        (MembershipTypes.ReferralStatus oldStatus, address oldReferrer) = tier.referralOf(id);
        assertEq(uint256(oldStatus), uint256(MembershipTypes.ReferralStatus.Unset));
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        uint256 payerBefore = paymentToken.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.MembershipOwnerMismatch.selector, id, member, recipient
            )
        );
        tier.giftRenewal(id, member, 1, oldStatus, oldReferrer, 25);
        assertEq(paymentToken.balanceOf(payer), payerBefore);
        assertEq(tier.expiresAt(id), _START + _PERIOD);
        vm.prank(recipient);
        tier.renewMembership(id, 1, referrer, 25);
        vm.prank(payer);
        vm.expectRevert(MembershipTier.ReferralStateMismatch.selector);
        tier.giftRenewal(id, recipient, 1, oldStatus, oldReferrer, 25);
        assertEq(paymentToken.balanceOf(payer), payerBefore);
        assertEq(tier.expiresAt(id), _START + 2 * _PERIOD);
        (MembershipTypes.ReferralStatus status, address currentReferrer) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(currentReferrer, referrer);
        vm.prank(payer);
        tier.giftRenewal(id, recipient, 1, status, currentReferrer, 25);
        assertEq(tier.ownerOf(id), recipient);
        assertEq(tier.expiresAt(id), _START + 3 * _PERIOD);
        assertEq(paymentToken.balanceOf(payer), payerBefore - 10_000_000);
    }

    function test_fixedPreviewAtLastLiveSecond() public {
        testFuzz_fixedPreviewMatchesSlowTimeModel(1, _PERIOD - 1, 0);
    }

    function test_fixedPreviewAtExactExpiry() public {
        testFuzz_fixedPreviewMatchesSlowTimeModel(1, _PERIOD, 0);
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
            tier.addGrantTime(tokenId, member, grantPeriods, 25);
        }

        uint256 paidDuration = uint256(periods) * _PERIOD;
        uint256 elapsed = bound(rawElapsed, 0, paidDuration + uint256(grantPeriods) * _PERIOD);
        vm.warp(_START + elapsed);
        uint256 remainingPaid = elapsed >= paidDuration ? 0 : paidDuration - elapsed;

        uint256 expected = MembershipModel.fixedRefund(remainingPaid, 10_000_000, _PERIOD);
        tier.processAccounting(25);
        if (elapsed == paidDuration + uint256(grantPeriods) * _PERIOD) {
            _assertBurned(tokenId);
            MembershipTypes.CancellationPreview memory retired =
                tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25);
            assertFalse(retired.cancellationEligible);
            assertEq(
                uint256(retired.lifecycle), uint256(MembershipTypes.MembershipLifecycle.Retired)
            );
            assertEq(expected, 0);
        } else if (elapsed + 1 == paidDuration + uint256(grantPeriods) * _PERIOD) {
            vm.expectRevert(MembershipTier.InvalidCancellationDeadline.selector);
            tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25);
            assertEq(tier.allocationState(tokenId).refundableGross, expected);
        } else {
            assertEq(
                tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25).ownerRefund,
                expected
            );
        }
    }

    function _purchase(address account, uint64 periods, address referralChoice)
        private
        returns (uint256 tokenId)
    {
        vm.prank(account);
        tokenId = tier.createMembership(periods, referralChoice, 25);
    }

    function _fundAndApprove(address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function _assertBurned(uint256 tokenId) private {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId)
        );
        tier.ownerOf(tokenId);
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
        uint256 tokenId = _createContribution(0);
        _renewContribution(tokenId, 10_000_000);
        assertEq(
            tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25).ownerRefund,
            10_000_000
        );
        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        uint256 fresh = _createContribution(10_000_000);
        _renewContribution(fresh, 0);
        assertGt(fresh, tokenId);
        assertEq(
            tier.previewCancellation(fresh, uint64(block.timestamp + 1), 25).ownerRefund, 10_000_000
        );
        assertEq(tier.lifetimeGross(), 20_000_000);
    }

    function test_partialCurrentLotPlusLaterFullLotsUsesCumulativePrefixRange() public {
        uint256 tokenId = _createContribution(12_000_000);
        _renewContribution(tokenId, 3_000_000);
        _renewContribution(tokenId, 5_000_000);
        vm.warp(_START + 15 days);
        tier.processAccounting(25);

        uint256 grossRefund =
            tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25).ownerRefund;
        assertEq(grossRefund, 14_000_000);

        uint256 memberBefore = paymentToken.balanceOf(member);
        vm.prank(member);
        cancelPayout(tier, tokenId, member, grossRefund, 25);
        assertEq(paymentToken.balanceOf(member) - memberBefore, grossRefund);
    }

    function test_refundThenRejoinUsesFreshIdentityWithoutOldPrefixesOrWeight() public {
        uint256 tokenId = _createContribution(4_000_000);
        _renewContribution(tokenId, 2_000_000);
        vm.warp(_START + 15 days);
        assertEq(_grossPreview(tokenId), 4_000_000);
        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        uint256 fresh = _createContribution(3_000_000);
        assertGt(fresh, tokenId);
        assertEq(tier.sharesOf(tokenId), 0);
        assertEq(tier.sharesOf(fresh), 3_000_000);
        assertEq(tier.lifetimeGross(), 9_000_000);
        vm.warp(block.timestamp + 15 days);
        assertEq(_grossPreview(fresh), 1_500_000);
        vm.prank(member);
        cancelPayout(tier, fresh, member, 0, 25);
        assertEq(tier.balanceOf(member), 0);
        assertFalse(tier.previewCancellation(fresh, uint64(block.timestamp + 1), 25).quoteAvailable);
        assertEq(tier.lifetimeGross(), 9_000_000);
    }

    function test_paidTimeConsumptionAdvancesLotsBeforeGrantTime() public {
        uint256 tokenId = _createContribution(8_000_000);
        vm.prank(creator);
        tier.addGrantTime(tokenId, member, 1, 25);

        vm.warp(_START + 15 days);
        assertEq(_grossPreview(tokenId), 4_000_000);
        vm.warp(_START + 30 days);
        assertEq(_grossPreview(tokenId), 0);
        vm.warp(_START + 45 days);
        assertEq(_grossPreview(tokenId), 0);

        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
    }

    function test_prorationRoundsDownInPaymentTokenBaseUnits() public {
        uint256 tokenId = _createContribution(1);
        assertEq(_grossPreview(tokenId), 1);
        vm.warp(_START + 1);
        assertEq(_grossPreview(tokenId), 0);
    }

    function test_previewMatchesOracleAtLotBoundaries() public {
        uint256 tokenId = _createContribution(_PERIOD);
        _renewContribution(tokenId, 2 * _PERIOD);
        _renewContribution(tokenId, 3 * _PERIOD);

        vm.warp(_START + _PERIOD - 1);
        assertEq(_grossPreview(tokenId), 5 * _PERIOD + 1);
        vm.warp(_START + _PERIOD);
        assertEq(_grossPreview(tokenId), 5 * _PERIOD);
        vm.warp(_START + 2 * _PERIOD);
        assertEq(_grossPreview(tokenId), 3 * _PERIOD);
        vm.warp(_START + 3 * _PERIOD);
        assertEq(_grossPreview(tokenId), 0);
    }

    function test_thousandsOfZeroContributionRenewalsDoNotIncreaseRefundExecutionGas() public {
        uint256 tokenId = _createContribution(0);
        uint256 gasBefore = gasleft();
        vm.prank(member);
        cancelPayout(tier, tokenId, member, 0, 25);
        uint256 singleLotGas = gasBefore - gasleft();

        uint256 fresh = _createContribution(0);
        for (uint256 i = 1; i < 2000; ++i) {
            _renewContribution(fresh, 0);
        }
        gasBefore = gasleft();
        vm.prank(member);
        cancelPayout(tier, fresh, member, 0, 25);
        uint256 manyLotGas = gasBefore - gasleft();

        assertLe(manyLotGas, singleLotGas + 10_000);
    }

    function test_variablePreviewAtLastLiveSecond() public {
        uint96[8] memory amounts = [uint96(2), 3, 5, 7, 11, 13, 17, 19];
        testFuzz_previewMatchesSlowLotOracleAcrossTimeAndInterleavedGrants(
            amounts, 10 * _PERIOD - 1
        );
    }

    function test_variablePreviewAtExactExpiry() public {
        uint96[8] memory amounts = [uint96(2), 3, 5, 7, 11, 13, 17, 19];
        testFuzz_previewMatchesSlowLotOracleAcrossTimeAndInterleavedGrants(amounts, 10 * _PERIOD);
    }

    function testFuzz_previewMatchesSlowLotOracleAcrossTimeAndInterleavedGrants(
        uint96[8] memory rawGross,
        uint64 rawElapsed
    ) public {
        uint256[] memory grossLots = new uint256[](rawGross.length);
        uint256 tokenId;
        for (uint256 i; i < rawGross.length; ++i) {
            grossLots[i] = bound(rawGross[i], 0, 10_000_000);
            if (i == 0) tokenId = _createContribution(grossLots[i]);
            else _renewContribution(tokenId, grossLots[i]);
            if (i == 2 || i == 5) {
                vm.prank(creator);
                tier.addGrantTime(tokenId, member, 1, 25);
            }
        }

        uint256 totalPaidSeconds = grossLots.length * _PERIOD;
        uint256 elapsed = bound(rawElapsed, 0, totalPaidSeconds + 2 * _PERIOD);
        vm.warp(_START + elapsed);
        uint256 consumedPaid = elapsed > totalPaidSeconds ? totalPaidSeconds : elapsed;

        uint256 expected = MembershipModel.variableRefund(grossLots, _PERIOD, consumedPaid);
        assertEq(_grossPreview(tokenId), expected);
    }

    function _deployZeroTier() private returns (MembershipTier zeroTier) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        config.pricePerPeriod = 0;
        config.maxPrepaidPeriods = 0;
        zeroTier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(makeAddr("zeroFactory"), address(paymentToken)),
            paymentToken,
            config
        );
    }

    function test_contributionRenewalAndRefundFollowTransferredPositionOwner() public {
        uint256 id = _createContribution(12_000_000);
        address recipient = makeAddr("contribution transfer recipient");
        address operator = makeAddr("contribution transfer operator");
        paymentToken.mint(recipient, 5_000_000);
        vm.prank(recipient);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(member);
        tier.transferFrom(member, recipient, id);
        vm.prank(recipient);
        tier.setApprovalForAll(operator, true);
        vm.prank(member);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.renewContributionMembership(id, 1_000_000, address(0), 25);
        vm.prank(operator);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.renewContributionMembership(id, 1_000_000, address(0), 25);
        vm.prank(recipient);
        tier.renewContributionMembership(id, 5_000_000, address(0), 25);
        assertEq(tier.sharesOf(id), 17_000_000);
        assertEq(tier.previewCancellation(id, uint64(block.timestamp + 1), 25).owner, recipient);
        vm.prank(recipient);
        cancelPayout(tier, id, recipient, 17_000_000, 25);
        assertEq(paymentToken.balanceOf(recipient), 17_000_000);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.lifetimeGross(), 17_000_000);
    }

    function _createContribution(uint256 gross) private returns (uint256 tokenId) {
        vm.prank(member);
        return tier.createContributionMembership(gross, address(0), 25);
    }

    function _renewContribution(uint256 tokenId, uint256 gross) private {
        vm.prank(member);
        tier.renewContributionMembership(tokenId, gross, address(0), 25);
    }

    function _grossPreview(uint256 tokenId) private returns (uint256 grossRefund) {
        uint64 expiration = tier.expiresAt(tokenId);
        tier.processAccounting(25);
        // The local test clock deliberately selects the exact expiry branch.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= expiration) {
            MembershipTypes.CancellationPreview memory retired =
                tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25);
            assertFalse(retired.quoteAvailable);
            assertEq(
                uint256(retired.lifecycle), uint256(MembershipTypes.MembershipLifecycle.Retired)
            );
            return 0;
        }
        // The test clock deliberately exercises the last second without a future quote window.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp + 1 == expiration) {
            vm.expectRevert(MembershipTier.InvalidCancellationDeadline.selector);
            tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25);
            return tier.allocationState(tokenId).refundableGross;
        }
        grossRefund = tier.previewCancellation(tokenId, uint64(block.timestamp + 1), 25).ownerRefund;
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
        cancelPayout(_tier, tokenId, _member, 0, 25);
    }

    function reenterGrant() external {
        _tier.grantMembership(_member, 1, 25);
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
        tier = MembershipTestConfig.deployTier(
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
        tier.createMembership(1, address(0), 25);
    }

    function test_refundNeverPullsFromAFrozenOwnerWithBrokenTransferFrom() public {
        paymentToken.setFrozen(creator, true);
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.prank(member);
        cancelPayout(tier, 1, member, 10_000_000, 25);
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
        vm.prank(member);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        cancelPayout(tier, 1, member, 0, 25);
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
        vm.prank(member);
        assertEq(cancelPayout(tier, 1, member, 10_000_000, 25), 10_000_000);
        assertEq(paymentToken.balanceOf(newOwner), 0);
        assertEq(paymentToken.balanceOf(member), 100_000_000);
    }

    function test_failedRefundDeliveryRollsBackCatchUpBurnCreditAndExpirationRemoval() public {
        vm.warp(block.timestamp + 15 days);
        bytes32 before = _refundFingerprint();
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.ShortTransfer);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InexactTokenTransfer.selector);
        cancelPayout(tier, 1, member, 5_000_000, 25);
        assertEq(_refundFingerprint(), before);
        assertEq(tier.ownerOf(1), member);
        assertEq(retiredCreditScaled(tier, member), 0);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        vm.prank(member);
        assertEq(cancelPayout(tier, 1, member, 5_000_000, 25), 5_000_000);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        tier.ownerOf(1);
        assertGt(retiredCreditScaled(tier, member), 0);
        assertEq(tier.sharesOf(1), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
        assertEq(tier.lifetimeGross(), 10_000_000);
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

        vm.prank(member);
        tier.approve(address(refundOwner), 1);
        refundOwner.refund(1);

        assertEq(paymentToken.callbackAttempts(), 1);
        assertFalse(paymentToken.lastCallbackSucceeded());
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(1);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertEq(tier.balanceOf(member), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.sharesOf(1), 0);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
    }

    function _expectFailedDelivery(AdversarialERC20.Behavior behavior, bytes memory revertData)
        private
    {
        paymentToken.setTransferBehavior(behavior);
        vm.prank(member);
        vm.expectRevert(revertData);
        cancelPayout(tier, 1, member, 0, 25);
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
        assertEq(
            tier.previewCancellation(1, uint64(block.timestamp + 1), 25).ownerRefund, 10_000_000
        );
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertTrue(tier.rewardEligible(1));
        assertEq(tier.ownerOf(1), member);
        assertEq(tier.balanceOf(member), 1);
        assertEq(tier.sharesOf(1), 10_000_000);
        assertEq(tier.occupiedSupply(), 1);
        assertEq(tier.accountingStatus().scheduledExpirations, 1);
        assertEq(retiredCreditScaled(tier, member), 0);
    }

    function _refundFingerprint() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.allocationState(1),
                tier.reserveState(),
                tier.accountingStatus(),
                tier.ownerOf(1),
                tier.expiresAt(1),
                tier.occupiedSupply(),
                tier.sharesOf(1),
                tier.lifetimeGross(),
                tier.claimableReward(1),
                retiredCreditScaled(tier, member),
                paymentToken.balanceOf(member),
                paymentToken.balanceOf(address(tier))
            )
        );
    }
}
