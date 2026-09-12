// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

contract TransferStateTier is MembershipTier {
    constructor(address factory_, IERC20 token, MembershipTypes.TierConfig memory config)
        MembershipTier(factory_, token, config)
    {}

    function storedTime(uint256 id) external view returns (MembershipTypes.MembershipState memory) {
        return _membershipStates[id];
    }

    function expirationScheduleHash() external view returns (bytes32) {
        bytes32 positions;
        for (uint256 i; i < _expirations.nodes.length; ++i) {
            uint256 id = _expirations.nodes[i].tokenId;
            positions = keccak256(abi.encode(positions, id, _expirations.position[id]));
        }
        return keccak256(abi.encode(_expirations.nodes, positions));
    }
}

contract TransferableMembershipsTest is Test {
    uint64 private constant START = 1_000_000;
    uint64 private constant PERIOD = 7;
    uint256 private constant PRICE = 10_000;
    uint256 private constant Q = 1 << 128;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant SPENDER = address(0x5EED);
    address private constant REFERRER = address(0xCAFE);
    TransferStateTier private tier;
    MockUSDG private paymentToken;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(START);
        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = PRICE;
        config.periodDuration = PERIOD;
        config.rewardBps = 2000;
        config.referralBps = 500;
        config.protocolFeeBps = 100;
        config.maxPrepaidPeriods = 0;
        tier = new TransferStateTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        _fund(ALICE);
        _fund(BOB);
        _fund(REFERRER);
    }

    function test_ownerTransferPreservesEntirePositionWithoutSettlingOrPayingSender() public {
        uint256 id = _create(ALICE, 2, REFERRER);
        tier.addGrantTime(id, ALICE, 1);
        vm.warp(START + 3);
        tier.processAccounting(25);
        assertGt(tier.claimableReward(id), 0);
        vm.warp(START + 4);
        bytes32 economics = _economicDigest(id);
        bytes32 accounting = _globalDigest();
        uint256 aliceBalance = paymentToken.balanceOf(ALICE);
        uint256 bobBalance = paymentToken.balanceOf(BOB);
        vm.prank(ALICE);
        tier.transferFrom(ALICE, BOB, id);
        assertEq(_economicDigest(id), economics);
        assertEq(_globalDigest(), accounting);
        assertEq(paymentToken.balanceOf(ALICE), aliceBalance);
        assertEq(paymentToken.balanceOf(BOB), bobBalance);
        assertEq(tier.ownerOf(id), BOB);
        assertTrue(tier.isActiveToken(id));
        assertEq(tier.balanceOf(ALICE), 0);
        assertEq(tier.balanceOf(BOB), 1);
    }

    function test_tokenApprovedTransferClearsApprovalAndCannotBeReused() public {
        uint256 id = _create(ALICE, 1, address(0));
        vm.prank(ALICE);
        tier.approve(SPENDER, id);
        assertEq(tier.getApproved(id), SPENDER);
        vm.prank(SPENDER);
        tier.transferFrom(ALICE, BOB, id);
        assertEq(tier.getApproved(id), address(0));
        assertEq(tier.ownerOf(id), BOB);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, SPENDER, id)
        );
        vm.prank(SPENDER);
        tier.transferFrom(BOB, ALICE, id);
        assertEq(tier.ownerOf(id), BOB);
    }

    function test_ownerWideOperatorTransfersButDoesNotGainRecipientAuthority() public {
        uint256 id = _create(ALICE, 1, address(0));
        vm.prank(ALICE);
        tier.setApprovalForAll(SPENDER, true);
        vm.prank(SPENDER);
        tier.transferFrom(ALICE, BOB, id);
        assertTrue(tier.isApprovedForAll(ALICE, SPENDER));
        assertFalse(tier.isApprovedForAll(BOB, SPENDER));
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, SPENDER, id)
        );
        vm.prank(SPENDER);
        tier.transferFrom(BOB, ALICE, id);
    }

    function test_unauthorizedCallerCannotTransferLivePosition() public {
        uint256 id = _create(ALICE, 1, address(0));
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, SPENDER, id)
        );
        vm.prank(SPENDER);
        tier.transferFrom(ALICE, BOB, id);
        assertEq(tier.ownerOf(id), ALICE);
    }

    function test_selfTransferClearsTokenApprovalWithoutChangingEconomicsOrEnumeration() public {
        uint256 first = _create(ALICE, 1, REFERRER);
        _create(ALICE, 2, address(0));
        vm.prank(ALICE);
        tier.approve(SPENDER, first);
        bytes32 economics = _economicDigest(first);
        bytes32 accounting = _globalDigest();
        bytes32 ownership = keccak256(abi.encode(tier.tokensOfOwner(ALICE, 0, 100)));
        vm.prank(ALICE);
        tier.transferFrom(ALICE, ALICE, first);
        assertEq(tier.getApproved(first), address(0));
        assertEq(tier.ownerOf(first), ALICE);
        assertEq(tier.balanceOf(ALICE), 2);
        assertEq(keccak256(abi.encode(tier.tokensOfOwner(ALICE, 0, 100))), ownership);
        assertEq(_economicDigest(first), economics);
        assertEq(_globalDigest(), accounting);
    }

    function test_safeTransferOverloadsMoveToExistingMemberWithoutMergingPositions() public {
        uint256 first = _create(ALICE, 1, REFERRER);
        uint256 second = _create(ALICE, 2, address(0));
        uint256 existing = _create(BOB, 3, address(0));
        bytes32 existingEconomics = _economicDigest(existing);
        vm.prank(ALICE);
        tier.safeTransferFrom(ALICE, BOB, first);
        vm.prank(ALICE);
        tier.safeTransferFrom(ALICE, BOB, second, hex"1234");
        assertEq(tier.ownerOf(first), BOB);
        assertEq(tier.ownerOf(second), BOB);
        assertEq(tier.ownerOf(existing), BOB);
        assertEq(tier.balanceOf(BOB), 3);
        assertEq(tier.balanceOf(ALICE), 0);
        assertEq(_economicDigest(existing), existingEconomics);
        MembershipTypes.PositionPage memory page = tier.tokensOfOwner(BOB, 0, 100);
        assertEq(page.tokenIds.length, 3);
        assertEq(page.tokenIds[0], existing);
        assertEq(page.tokenIds[1], first);
        assertEq(page.tokenIds[2], second);
        assertTrue(page.complete);
        assertEq(tier.totalMinted(), 3);
    }

    function test_liveTransferWithMoreThan25FundingAndExpiryEventsDoesNoAccounting() public {
        _assertBackloggedTransfer(false);
    }

    function test_pausedLiveTransferWithMoreThan25FundingAndExpiryEventsDoesNoAccounting() public {
        _assertBackloggedTransfer(true);
    }

    function test_pausedApprovalAndSafeOperatorTransferIgnoreGrantOnlyExpiryBacklog() public {
        uint256 live = tier.grantMembership(ALICE, 3);
        for (uint256 i; i < 30; ++i) {
            tier.grantMembership(_backlogOwner(i), 1);
        }
        vm.warp(START + PERIOD);
        tier.setPaused(true);
        vm.prank(ALICE);
        tier.approve(SPENDER, live);
        vm.prank(ALICE);
        tier.setApprovalForAll(SPENDER, true);
        bytes32 accounting = _globalDigest();
        bytes32 economics = _economicDigest(live);
        vm.prank(SPENDER);
        tier.safeTransferFrom(ALICE, BOB, live, hex"aabb");
        assertEq(_globalDigest(), accounting);
        assertEq(_economicDigest(live), economics);
        assertEq(tier.ownerOf(live), BOB);
        assertEq(tier.getApproved(live), address(0));
        assertEq(tier.accountingStatus().scheduledExpirations, 31);
        assertFalse(tier.accountingStatus().complete);
    }

    function test_transferSucceedsOneSecondBeforeExpiration() public {
        uint256 id = _create(ALICE, 1, address(0));
        vm.warp(tier.expiresAt(id) - 1);
        vm.prank(ALICE);
        tier.transferFrom(ALICE, BOB, id);
        assertEq(tier.ownerOf(id), BOB);
        assertTrue(tier.isActiveToken(id));
    }

    function test_everyTransferRouteRejectsAtAndAfterExpiryEvenForApprovedCaller() public {
        uint256 id = _create(ALICE, 1, address(0));
        uint64 end = tier.expiresAt(id);
        vm.prank(ALICE);
        tier.approve(SPENDER, id);
        vm.prank(ALICE);
        tier.setApprovalForAll(SPENDER, true);
        for (uint64 offset; offset < 2; ++offset) {
            vm.warp(end + offset);
            for (uint256 route; route < 3; ++route) {
                vm.expectRevert(
                    abi.encodeWithSelector(MembershipTier.MembershipExpired.selector, id, end)
                );
                vm.prank(SPENDER);
                if (route == 0) tier.transferFrom(ALICE, BOB, id);
                else if (route == 1) tier.safeTransferFrom(ALICE, BOB, id);
                else tier.safeTransferFrom(ALICE, BOB, id, hex"1234");
            }
            assertEq(tier.ownerOf(id), ALICE);
            assertEq(tier.getApproved(id), SPENDER);
            assertEq(tier.sharesOf(id), PRICE);
            assertEq(tier.occupiedSupply(), 1);
            assertFalse(tier.isActiveToken(id));
        }
    }

    function test_transferToLockedReferrerPreservesChoiceAndFutureFundingBeneficiary() public {
        uint256 id = _create(ALICE, 1, REFERRER);
        vm.prank(ALICE);
        tier.transferFrom(ALICE, REFERRER, id);
        (MembershipTypes.ReferralStatus status, address beneficiary) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(beneficiary, REFERRER);
        vm.prank(REFERRER);
        tier.renewMembership(id, 1, REFERRER);
        MembershipTypes.AllocationLot[] memory lots = tier.allocationLots(id, 0, 0, 100);
        assertEq(lots.length, 2);
        assertEq(lots[0].referrer, REFERRER);
        assertEq(lots[1].referrer, REFERRER);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        vm.prank(REFERRER);
        tier.renewMembership(id, 1, BOB);
    }

    function test_delayedRetirementCreditsFinalOwnerIncludingPretransferEarnings() public {
        uint256 id = _create(ALICE, 1, address(0));
        vm.warp(START + 3);
        tier.processAccounting(25);
        assertGt(tier.claimableReward(id), 0);
        vm.prank(ALICE);
        tier.transferFrom(ALICE, BOB, id);
        vm.warp(START + 10 * PERIOD);
        tier.processAccounting(25);
        (uint256 aliceRaw, uint256 aliceFraction) = tier.claimableRetiredReward(ALICE);
        (uint256 bobRaw, uint256 bobFraction) = tier.claimableRetiredReward(BOB);
        assertEq(aliceRaw, 0);
        assertEq(aliceFraction, 0);
        assertGt(bobRaw, 0);
        MembershipTypes.ReserveState memory reserve = tier.reserveState();
        assertEq(
            bobRaw * Q + bobFraction + reserve.distributionDustScaled + reserve.indexCarryScaled
                + reserve.unassignedMemberScaled,
            PRICE * 2000 / 10_000 * Q
        );
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.balanceOf(BOB), 0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        tier.ownerOf(id);
        uint256 beforeBalance = paymentToken.balanceOf(BOB);
        vm.prank(BOB);
        assertEq(tier.claimRetiredRewards(), bobRaw);
        assertEq(paymentToken.balanceOf(BOB), beforeBalance + bobRaw);
        (, uint256 remainingFraction) = tier.claimableRetiredReward(BOB);
        assertEq(remainingFraction, bobFraction);
    }

    function _assertBackloggedTransfer(bool paused) private {
        uint256 live = _create(ALICE, 3, REFERRER);
        tier.addGrantTime(live, ALICE, 1);
        uint256[] memory expired = new uint256[](30);
        for (uint256 i; i < expired.length; ++i) {
            address holder = _backlogOwner(i);
            _fund(holder);
            expired[i] = _create(holder, 1, address(0));
        }
        tier.processAccounting(25);
        vm.warp(START + PERIOD);
        if (paused) tier.setPaused(true);
        MembershipTypes.AccountingStatus memory status = tier.accountingStatus();
        assertEq(status.nextBoundary, START + PERIOD);
        assertEq(status.scheduledExpirations, 31);
        assertEq(status.scheduledMembers, 31);
        assertFalse(status.complete);
        bytes32 accounting = _globalDigest();
        bytes32 economics = _economicDigest(live);
        bytes32[] memory untouched = new bytes32[](expired.length);
        for (uint256 i; i < expired.length; ++i) {
            untouched[i] = _economicDigest(expired[i]);
        }
        vm.recordLogs();
        vm.prank(ALICE);
        tier.transferFrom(ALICE, BOB, live);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertNotEq(
                logs[i].topics[0],
                keccak256("AccountingProgress(uint64,uint256,bool,uint256,uint256)")
            );
            assertNotEq(
                logs[i].topics[0],
                keccak256("MembershipRetired(uint256,address,uint64,uint256,uint256)")
            );
            assertNotEq(
                logs[i].topics[0], keccak256("FundingLotCompleted(uint256,uint256,uint256,uint64)")
            );
        }
        assertEq(tier.ownerOf(live), BOB);
        assertEq(_economicDigest(live), economics);
        assertEq(_globalDigest(), accounting);
        for (uint256 i; i < expired.length; ++i) {
            assertEq(_economicDigest(expired[i]), untouched[i]);
            assertEq(tier.ownerOf(expired[i]), _backlogOwner(i));
        }
    }

    function _economicDigest(uint256 id) private view returns (bytes32) {
        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(id);
        bytes32 position = keccak256(
            abi.encode(
                tier.storedTime(id),
                tier.expiresAt(id),
                tier.sharesOf(id),
                tier.rewardEligible(id),
                status,
                referrer
            )
        );
        return keccak256(
            abi.encode(
                position,
                tier.allocationState(id),
                tier.allocationLots(id, 0, 0, 100),
                tier.previewAccounting(id, ALICE, referrer, 0).settled
            )
        );
    }

    function _globalDigest() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.accountingStatus(),
                tier.reserveState(),
                tier.expirationScheduleHash(),
                tier.totalRewardShares(),
                tier.rewardPerShare(),
                tier.occupiedSupply(),
                tier.totalMinted(),
                tier.lifetimeGross()
            )
        );
    }

    function _create(address owner, uint64 periods, address referralChoice)
        private
        returns (uint256)
    {
        vm.prank(owner);
        return tier.createMembership(periods, referralChoice);
    }

    function _fund(address owner) private {
        paymentToken.mint(owner, 100 * PRICE);
        vm.prank(owner);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function _backlogOwner(uint256 index) private pure returns (address) {
        return address(SafeCast.toUint160(0x10000 + index));
    }
}
