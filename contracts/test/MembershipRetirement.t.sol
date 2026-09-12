// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipRetirementTest is Test {
    uint64 private constant START = 1_000_000;
    uint64 private constant PERIOD = 7;
    uint256 private constant Q = 1 << 128;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant MAINTAINER = address(0xCAFE);
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;

    event MembershipRetired(
        uint256 indexed tokenId,
        address indexed owner,
        uint64 effectiveAt,
        uint256 removedShares,
        uint256 creditScaled
    );

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(START);
        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = _deploy(6);
        _fund(ALICE, tier);
        _fund(BOB, tier);
    }

    function test_delayedRetirementBurnsAtExpirationAndPreservesFundingHistory() public {
        uint256 id = _purchase(ALICE, 1);
        tier.processAccounting(25);
        MembershipTypes.AllocationLot[] memory beforeLots = tier.allocationLots(id, 0, 0, 100);
        assertEq(beforeLots.length, 1);
        assertEq(tier.occupiedSupply(), 1);

        vm.warp(START + 10 * PERIOD);
        assertFalse(tier.isActiveToken(id));
        assertFalse(tier.rewardEligible(id));
        assertEq(tier.ownerOf(id), ALICE);
        assertEq(tier.sharesOf(id), 6);

        vm.expectEmit(true, true, false, true, address(tier));
        emit MembershipRetired(id, ALICE, START + PERIOD, 6, 3 * Q);
        vm.prank(MAINTAINER);
        MembershipTypes.MaintenanceResult memory result = tier.processAccounting(25);
        assertTrue(result.complete);
        assertEq(result.retiredCount, 1);
        assertEq(result.processedSteps, 2);
        assertEq(result.accountedThrough, START + 10 * PERIOD);
        assertEq(result.earnedScaledDelta, 6 * Q);
        _assertBurned(tier, id, ALICE);
        assertEq(tier.sharesOf(id), 0);
        assertFalse(tier.rewardEligible(id));
        assertEq(tier.totalRewardShares(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.lifetimeGross(), 6);
        assertEq(_retiredScaled(tier, ALICE), 3 * Q);

        MembershipTypes.AllocationLot[] memory afterLots = tier.allocationLots(id, 0, 0, 100);
        assertEq(keccak256(abi.encode(afterLots)), keccak256(abi.encode(beforeLots)));
        MembershipTypes.AllocationState memory history = tier.allocationState(id);
        assertEq(history.allocatedScaled[1], 3 * Q);
        assertEq(history.earnedScaled[1], 3 * Q);
        assertEq(history.refundableGross, 0);

        result = tier.processExpirations(25);
        assertTrue(result.complete);
        assertEq(result.retiredCount, 0);
        assertEq(result.processedSteps, 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(_retiredScaled(tier, ALICE), 3 * Q);
    }

    function test_fundingEndAndRoundingTailFinishBeforeRetirementWithOneStep() public {
        uint256 id = _purchase(ALICE, 1);
        tier.processAccounting(25);
        vm.warp(START + PERIOD);

        MembershipTypes.MaintenanceResult memory funding = tier.processExpirations(1);
        assertEq(funding.processedSteps, 1);
        assertEq(funding.retiredCount, 0);
        assertFalse(funding.complete);
        assertEq(funding.accountedThrough, START + PERIOD);
        assertEq(tier.ownerOf(id), ALICE);
        assertEq(tier.sharesOf(id), 6);
        assertEq(tier.allocationState(id).earnedScaled[1], 3 * Q);
        assertEq(_retiredScaled(tier, ALICE), 0);
        assertFalse(tier.accountingStatus().complete);

        MembershipTypes.MaintenanceResult memory retirement = tier.processAccounting(1);
        assertEq(retirement.processedSteps, 1);
        assertEq(retirement.retiredCount, 1);
        assertTrue(retirement.complete);
        assertEq(retirement.earnedScaledDelta, 0);
        assertEq(_retiredScaled(tier, ALICE), 3 * Q);
        assertEq(tier.reserveState().unearnedScaled[1], 0);
        assertEq(tier.reserveState().indexCarryScaled, 0);
        _assertBurned(tier, id, ALICE);
    }

    function test_simultaneousGrantOnlyRetirementsPersistOneStepWhilePaused() public {
        uint256 count = 7;
        uint256[] memory ids = new uint256[](count);
        address[] memory owners = new address[](count);
        for (uint256 i; i < count; ++i) {
            owners[i] = makeAddr(string.concat("grant-owner-", vm.toString(i)));
            ids[i] = tier.grantMembership(owners[i], 1);
        }
        tier.setPaused(true);
        vm.warp(START + PERIOD + 100);
        for (uint256 i; i < count; ++i) {
            vm.prank(MAINTAINER);
            MembershipTypes.MaintenanceResult memory result =
                i % 2 == 0 ? tier.processExpirations(1) : tier.processAccounting(1);
            assertEq(result.processedSteps, 1);
            assertEq(result.retiredCount, 1);
            assertEq(result.complete, i + 1 == count);
            assertEq(tier.occupiedSupply(), count - i - 1);
            _assertBurned(tier, ids[i], owners[i]);
            if (i + 1 < count) assertEq(tier.ownerOf(ids[i + 1]), owners[i + 1]);
        }
        assertTrue(tier.paused());
        assertEq(tier.totalRewardShares(), 0);
        assertEq(tier.lifetimeGross(), 0);
        assertEq(tier.accountingStatus().accountedThrough, block.timestamp);
        assertTrue(tier.accountingStatus().complete);
    }

    function test_zeroContributionExpiresWithoutAnyFundingCheckpoints() public {
        MembershipTier freeTier = _deploy(0);
        vm.prank(ALICE);
        uint256 id = freeTier.createContributionMembership(0, address(0));
        assertEq(freeTier.sharesOf(id), 0);
        assertEq(freeTier.lifetimeGross(), 0);
        vm.warp(START + PERIOD);
        vm.prank(MAINTAINER);
        MembershipTypes.MaintenanceResult memory result = freeTier.processAccounting(1);
        assertTrue(result.complete);
        assertEq(result.processedSteps, 1);
        assertEq(result.retiredCount, 1);
        _assertBurned(freeTier, id, ALICE);
        assertEq(freeTier.occupiedSupply(), 0);
        assertEq(_retiredScaled(freeTier, ALICE), 0);
    }

    function test_maintenanceNeverPaysOrCallsAnOwner() public {
        uint256 id = _purchase(ALICE, 1);
        vm.warp(START + PERIOD);
        vm.mockCallRevert(
            address(paymentToken),
            abi.encodeWithSignature("transfer(address,uint256)", ALICE, 3),
            "payout blocked"
        );
        vm.mockCallRevert(ALICE, bytes(""), "owner callback blocked");
        assertTrue(tier.processAccounting(25).complete);
        _assertBurned(tier, id, ALICE);
        assertEq(_retiredScaled(tier, ALICE), 3 * Q);
    }

    function test_selectedClaimRetiresThenPaysButAlreadyBurnedSelectionRejects() public {
        uint256 id = _purchase(ALICE, 1);
        vm.warp(START + PERIOD);
        vm.prank(ALICE);
        assertEq(tier.claimReward(id), 3);
        _assertBurned(tier, id, ALICE);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        vm.prank(ALICE);
        tier.claimReward(id);
    }

    function test_retiredFractionsCombineAcrossFreshMembershipsBeforeRounding() public {
        MembershipTier fractionalTier = _deploy(3);
        _fund(ALICE, fractionalTier);
        vm.prank(ALICE);
        uint256 first = fractionalTier.createMembership(1, address(0));
        vm.warp(START + PERIOD);
        fractionalTier.processAccounting(25);
        assertEq(_retiredScaled(fractionalTier, ALICE), Q - 1);
        vm.prank(ALICE);
        assertEq(fractionalTier.claimRetiredRewards(), 0);
        assertEq(_retiredScaled(fractionalTier, ALICE), Q - 1);

        vm.prank(ALICE);
        uint256 second = fractionalTier.createMembership(1, address(0));
        assertGt(second, first);
        assertEq(fractionalTier.sharesOf(second), 3);
        assertEq(_retiredScaled(fractionalTier, ALICE), Q - 1);
        vm.warp(START + 2 * PERIOD);
        fractionalTier.processAccounting(25);
        assertEq(_retiredScaled(fractionalTier, ALICE), 2 * Q - 2);
        uint256 beforeBalance = paymentToken.balanceOf(ALICE);
        vm.prank(ALICE);
        assertEq(fractionalTier.claimRetiredRewards(), 1);
        assertEq(paymentToken.balanceOf(ALICE), beforeBalance + 1);
        assertEq(_retiredScaled(fractionalTier, ALICE), Q - 2);
        assertEq(fractionalTier.reserveState().distributionDustScaled, 2);
        assertEq(fractionalTier.lifetimeGross(), 6);
        assertEq(fractionalTier.totalRewardShares(), 0);
        assertEq(fractionalTier.balanceOf(ALICE), 0);
        assertTrue(fractionalTier.hasClaimInterest(ALICE));
        assertEq(
            Q + _retiredScaled(fractionalTier, ALICE)
                + fractionalTier.reserveState().distributionDustScaled,
            2 * Q
        );
    }

    function test_settledRetiredClaimDoesNotRequireCatchUpOrAnNFTWhilePaused() public {
        uint256 id = _purchase(ALICE, 1);
        for (uint256 i; i < 26; ++i) {
            tier.grantMembership(makeAddr(string.concat("later-grant-", vm.toString(i))), 2);
        }
        vm.warp(START + PERIOD);
        tier.processAccounting(25);
        _assertBurned(tier, id, ALICE);
        assertEq(_retiredScaled(tier, ALICE), 3 * Q);
        tier.setPaused(true);
        vm.warp(START + 2 * PERIOD);
        assertFalse(tier.accountingStatus().complete);
        bytes32 beforeStatus = keccak256(abi.encode(tier.accountingStatus()));
        uint256 beforeBalance = paymentToken.balanceOf(ALICE);
        vm.prank(ALICE);
        assertEq(tier.claimRetiredRewards(), 3);
        assertEq(paymentToken.balanceOf(ALICE), beforeBalance + 3);
        assertEq(_retiredScaled(tier, ALICE), 0);
        assertEq(keccak256(abi.encode(tier.accountingStatus())), beforeStatus);
        assertEq(tier.occupiedSupply(), 26);
    }

    function test_differentExpirationsMatchPunctualDelayedAndEveryBatchSize() public {
        uint256 first = _purchase(ALICE, 1);
        uint256 second = _purchase(BOB, 2);
        tier.processAccounting(25);
        uint256 initial = vm.snapshotState();
        vm.warp(START + PERIOD);
        tier.processAccounting(25);
        vm.warp(START + 2 * PERIOD);
        tier.processAccounting(25);
        bytes32 expected = _outcome();

        for (uint256 batch = 1; batch <= 25; ++batch) {
            assertTrue(vm.revertToState(initial));
            initial = vm.snapshotState();
            vm.warp(START + 2 * PERIOD);
            for (uint256 call; call < 8; ++call) {
                MembershipTypes.MaintenanceResult memory result = tier.processAccounting(batch);
                assertLe(result.processedSteps, batch);
                if (result.complete) break;
            }
            assertTrue(tier.accountingStatus().complete);
            assertEq(_outcome(), expected);
            _assertBurned(tier, first, ALICE);
            _assertBurned(tier, second, BOB);
        }
        MembershipTypes.ReserveState memory reserve = tier.reserveState();
        assertEq(
            _retiredScaled(tier, ALICE) + _retiredScaled(tier, BOB) + reserve.distributionDustScaled
                + reserve.indexCarryScaled + reserve.unassignedMemberScaled,
            9 * Q
        );
        assertEq(tier.lifetimeGross(), 18);
    }

    function _outcome() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                _retiredScaled(tier, ALICE),
                _retiredScaled(tier, BOB),
                tier.reserveState(),
                tier.occupiedSupply(),
                tier.totalRewardShares(),
                tier.lifetimeGross()
            )
        );
    }

    function _retiredScaled(MembershipTier target, address owner) private view returns (uint256) {
        (uint256 raw, uint256 fractionalScaled) = target.claimableRetiredReward(owner);
        return raw * Q + fractionalScaled;
    }

    function _assertBurned(MembershipTier target, uint256 id, address formerOwner) private {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        target.ownerOf(id);
        assertEq(target.balanceOf(formerOwner), 0);
        assertFalse(target.isActiveToken(id));
    }

    function _purchase(address member, uint64 periods) private returns (uint256) {
        vm.prank(member);
        return tier.createMembership(periods, address(0));
    }

    function _fund(address member, MembershipTier target) private {
        paymentToken.mint(member, 1000);
        vm.prank(member);
        paymentToken.approve(address(target), type(uint256).max);
    }

    function _deploy(uint256 price) private returns (MembershipTier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = price;
        config.periodDuration = PERIOD;
        config.protocolFeeBps = 100;
        config.rewardBps = 5000;
        config.referralBps = 0;
        config.maxPrepaidPeriods = 0;
        return new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
    }
}
