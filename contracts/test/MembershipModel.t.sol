// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipModel} from "./models/MembershipModel.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipModelTest is Test {
    using MembershipModel for MembershipModel.PositionBook;

    uint256 private constant Q = 1 << 128;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant REFERRER = address(0xC0FFEE);
    MembershipModel.PositionBook private book;

    function setUp() public {
        book.boostBps = 10_000;
        book.rewardBps = 10_000;
    }

    function test_delayedRetirementUsesHistoricalWeightAndFundingTail() public {
        uint256 first = book.createPosition(ALICE, 100, _paid(3, 1));
        uint256 second = book.createPosition(BOB, 100, _paid(6, 1));
        book.advancePositions(200);

        // At 103 the first stream releases its full END tail, while the second
        // has recognized 3 * floor(Q / 6). Both are distributed before retirement.
        assertEq(book.positions[first].retiredAt, 103);
        assertEq(book.positions[second].retiredAt, 106);
        assertEq(book.retiredCreditScaled[ALICE], 3 * Q / 4 - 1);
        assertEq(book.retiredCreditScaled[BOB], 5 * Q / 4 + 1);
        assertEq(book.distributionDust, 0);
        assertEq(book.totalShares, 0);
        assertEq(book.occupied, 0);
        assertEq(book.memberLiabilityScaled(), 2 * Q);
        assertEq(book.accountedRewardScaled(), book.funding.earnedScaled[1]);
        assertEq(book.positions[first].shares, 0);
        assertEq(book.positions[first].owner, address(0));
        assertEq(book.positions[first].time.initialized, false);
        assertEq(book.funding.lots[first].length, 1);
        assertEq(book.lifetimeGross, 2);
        assertEq(book.accountedCashScaled(), book.lifetimeGross * Q);
    }

    function test_transferLeavesAccountingUntouchedAndRetiresToFinalOwner() public {
        uint256 expired = book.createPosition(ALICE, 100, _paid(2, 1));
        MembershipModel.PositionIncrease memory increase = _paid(10, 2);
        increase.referrer = REFERRER;
        uint256 live = book.createPosition(ALICE, 100, increase);
        bytes32 beforePosition = _positionEconomics(live);
        book.transferPosition(live, ALICE, BOB, 105);
        assertEq(_positionEconomics(live), beforePosition);
        assertEq(book.funding.accountedThrough, 100);
        assertEq(book.positions[expired].owner, ALICE);
        assertEq(book.positions[live].owner, BOB);
        book.advancePositions(110);
        assertGt(book.retiredCreditScaled[BOB], 0);
        assertEq(book.positions[live].owner, address(0));
        assertEq(book.positions[live].referrer, address(0));
        assertEq(book.funding.lots[live][0].referrer, REFERRER);
    }

    function test_expiredPendingCannotTransferOrExtendAtBoundary() public {
        uint256 id = book.createPosition(ALICE, 100, _paid(10, 2));
        vm.expectRevert(MembershipModel.PositionNotLive.selector);
        this.transferForTest(id, 110);
        vm.expectRevert(MembershipModel.PositionNotLive.selector);
        this.renewForTest(id, 110);
        assertEq(book.positions[id].owner, ALICE);
        assertEq(book.funding.accountedThrough, 100);
    }

    function test_renewBeforeExpiryThenReturnCreatesNewIdentityAtCurrentCurve() public {
        book.boostBps = 30_000;
        book.horizon = 100;
        uint256 first = book.createPosition(ALICE, 100, _paid(10, 50));
        assertEq(book.positions[first].shares, 125);
        book.increasePosition(first, 109, _paid(10, 50));
        assertEq(MembershipModel.expiration(book.positions[first].time), 120);
        assertEq(book.positions[first].shares, 200);
        uint256 next = book.createPosition(ALICE, 120, _paid(10, 50));
        assertEq(next, first + 1);
        assertEq(book.positions[first].retiredAt, 120);
        assertEq(book.positions[first].shares, 0);
        assertEq(book.positions[next].shares, 50);
        assertEq(book.lifetimeGross, 150);
        assertEq(book.occupied, 1);
    }

    function test_multiplePositionsCombineFractionsBeforeClaim() public {
        uint256 first = book.createPosition(ALICE, 100, _paid(10, 1));
        uint256 second = book.createPosition(ALICE, 100, _paid(10, 1));
        book.createPosition(BOB, 100, _paid(10, 2));
        book.advancePositions(105);
        book.refundPosition(first, 105);
        assertEq(book.claimRetiredPositionCredit(ALICE), 0);
        assertEq(book.retiredCreditScaled[ALICE], Q / 2 - 2);
        book.refundPosition(second, 105);
        assertEq(book.claimRetiredPositionCredit(ALICE), 0);
        book.advancePositions(110);
        // Remaining fractions can later combine with another independently
        // retired position without importing those fractions into its weight.
        uint256 fresh = book.createPosition(ALICE, 110, _paid(1, 1));
        book.advancePositions(111);
        assertEq(book.positions[fresh].shares, 0);
        assertEq(book.claimRetiredPositionCredit(ALICE), 1);
        assertEq(book.retiredCreditScaled[ALICE], Q - 4);
        assertEq(book.accountedRewardScaled(), book.funding.earnedScaled[1]);
    }

    function test_grantOnlyAndZeroContributionRetireAndReleaseOnce() public {
        MembershipModel.PositionIncrease memory grant;
        grant.grantSeconds = 3;
        uint256 first = book.createPosition(ALICE, 100, grant);
        uint256 second = book.createPosition(ALICE, 100, _paid(4, 0));
        assertEq(book.occupied, 2);
        book.advancePositions(104);
        assertEq(book.positions[first].retiredAt, 103);
        assertEq(book.positions[second].retiredAt, 104);
        assertEq(book.occupied, 0);
        book.advancePositions(200);
        assertEq(book.occupied, 0);
        assertEq(book.lifetimeGross, 0);
    }

    function test_revokeGrantPreservesPaidTimeAndFullRefundDestroysWeight() public {
        MembershipModel.PositionIncrease memory increase = _paid(10, 10);
        increase.grantSeconds = 10;
        uint256 id = book.createPosition(ALICE, 100, increase);
        book.revokePositionGrant(id, 105);
        assertEq(MembershipModel.expiration(book.positions[id].time), 110);
        assertEq(book.positions[id].shares, 10);
        assertEq(book.refundPosition(id, 106), 4);
        assertEq(book.positions[id].retiredAt, 106);
        assertEq(book.positions[id].shares, 0);
        assertEq(book.lifetimeGross, 10);
        assertEq(book.funding.generation[id], 1);
        assertEq(book.accountedRewardScaled(), book.funding.earnedScaled[1]);
        assertEq(book.accountedCashScaled(), book.lifetimeGross * Q);
    }

    function testFuzz_maintenanceFrequencyPreservesScaledConservation(uint8 interval) public {
        uint64 stride = uint64(bound(interval, 1, 12));
        book.createPosition(ALICE, 100, _paid(9, 7));
        book.createPosition(ALICE, 100, _paid(6, 2));
        book.createPosition(BOB, 100, _paid(12, 11));
        uint256 snapshot = vm.snapshotState();
        book.advancePositions(112);
        bytes32 punctual = _outcome();
        vm.revertToState(snapshot);
        for (uint64 timestamp = 100 + stride; timestamp < 112; timestamp += stride) {
            book.advancePositions(timestamp);
        }
        book.advancePositions(112);
        assertEq(_outcome(), punctual);
        assertEq(book.accountedRewardScaled(), book.funding.earnedScaled[1]);
        assertEq(book.accountedCashScaled(), book.lifetimeGross * Q);
    }

    function transferForTest(uint256 id, uint64 timestamp) external {
        book.transferPosition(id, ALICE, BOB, timestamp);
    }

    function renewForTest(uint256 id, uint64 timestamp) external {
        book.increasePosition(id, timestamp, _paid(10, 1));
    }

    function _outcome() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                book.retiredCreditScaled[ALICE],
                book.retiredCreditScaled[BOB],
                book.distributionDust,
                book.rewardCarry,
                book.unassigned,
                book.lifetimeGross,
                book.occupied,
                book.totalShares
            )
        );
    }

    function _positionEconomics(uint256 id) private view returns (bytes32) {
        MembershipModel.Position storage position = book.positions[id];
        return keccak256(
            abi.encode(
                position.time,
                position.shares,
                position.creditScaled,
                position.eligible,
                position.referralLocked,
                position.referrer,
                book.funding.lots[id],
                book.lifetimeGross
            )
        );
    }

    function _paid(uint64 duration, uint256 gross)
        private
        pure
        returns (MembershipModel.PositionIncrease memory increase)
    {
        increase.paidSeconds = duration;
        increase.gross = gross;
        increase.lockReferral = true;
    }
}
