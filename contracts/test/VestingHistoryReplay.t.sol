// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Differential replay of independently authored intervals, token cohorts
/// and owner credits. Neither the generator nor this reader reproduces the heap.
contract VestingHistoryReplayTest is Test {
    using SafeCast for uint256;
    uint256 private constant Q = 1 << 128;
    uint256 private constant ROW_LENGTH = 5;
    uint256 private constant GLOBAL_LENGTH = 40;
    uint256 private constant POSITION_LENGTH = 10;
    MockUSDG private token;
    MembershipFactory private factory;
    OnchainMetadataRenderer private renderer;
    MembershipTier private tier;
    uint256[4] private claimed;
    mapping(uint256 => uint256) private positionClaimed;
    uint256 private refunded;
    uint256 private ownerIndex;

    function setUp() public {
        vm.warp(1000);
        new LinkedVestingFixture().install();
        token = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(0),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(token))
        );
    }

    function _member(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x100 + i));
    }

    function _referrer(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x200 + i));
    }

    function _owner(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x300 + i));
    }

    function test_replayIndependentHistories() public {
        string memory path =
            vm.envOr("BBF_VESTING_HISTORY_INPUT", string("test/fixtures/vesting-history.bin"));
        uint256[] memory data = abi.decode(vm.readFileBinary(path), (uint256[]));
        assertEq(data[0], 2, "token-position history schema");
        uint256 schedules = vm.envOr("BBF_VESTING_HISTORY_ALL_BUDGETS", false) ? 27 : 3;
        uint256 cursor = 2;
        for (uint256 history; history < data[1]; ++history) {
            uint256 baseline = vm.snapshotState();
            uint256 seed = data[cursor++];
            uint256 count = data[cursor++];
            emit log_named_uint("history seed", seed);
            MembershipTypes.TierConfig memory config =
                MembershipTestConfig.defaultConfig(_owner(0), address(renderer), address(token));
            config.tierSalt = keccak256(abi.encode(seed, "vesting-history"));
            config.pricePerPeriod = data[cursor++];
            config.startingBoostBps = data[cursor++].toUint32();
            config.earlySupportGross = data[cursor++].toUint112();
            config.periodDuration = 10;
            config.maxPrepaidPeriods = 0;
            config.rewardBps = 1000;
            config.referralBps = 500;
            config.protocolFeeBps = 500;
            vm.prank(_owner(0));
            tier = MembershipTier(factory.createTier(config));
            for (uint256 m; m < 3; ++m) {
                token.mint(_member(m), 1e18);
                vm.prank(_member(m));
                token.approve(address(tier), type(uint256).max);
            }
            token.mint(address(this), 1e18);
            token.approve(address(tier), type(uint256).max);
            uint256 initial = vm.snapshotState();
            for (uint256 schedule; schedule < schedules; ++schedule) {
                for (uint256 action; action < count; ++action) {
                    uint256[5] memory row;
                    for (uint256 field; field < ROW_LENGTH; ++field) {
                        row[field] = data[cursor + action * ROW_LENGTH + field];
                    }
                    // Release temporary oracle-read memory after every action;
                    // adding schedules must not cause quadratic memory growth.
                    this.replayAction(row, schedule, seed);
                }
                uint256[] memory finalState = _state();
                uint256 expectedLength = data[cursor + count * ROW_LENGTH];
                assertEq(finalState.length, expectedLength);
                for (uint256 field; field < expectedLength; ++field) {
                    assertEq(
                        finalState[field],
                        data[cursor + count * ROW_LENGTH + 1 + field],
                        string.concat("oracle field ", vm.toString(field))
                    );
                }
                if (schedule + 1 < schedules) assertTrue(vm.revertToState(initial));
            }
            cursor += count * ROW_LENGTH + 1 + data[cursor + count * ROW_LENGTH];
            assertTrue(vm.revertToState(baseline));
        }
        assertEq(cursor, data.length, "history payload consumed");
    }

    function _process(uint256 budget) private {
        for (uint256 i; i < 1000; ++i) {
            MembershipTypes.MaintenanceResult memory progress = tier.processAccounting(budget);
            assertLe(progress.processedSteps, budget);
            if (progress.complete) return;
            assertGt(progress.processedSteps, 0, "incomplete calls must commit progress");
        }
        fail("bounded history failed to finish accounting");
    }

    function _budget(uint256 schedule, uint256 clock) private pure returns (uint256) {
        if (schedule == 0) return 25;
        if (schedule == 1) return 1;
        if (schedule == 2) return 1 + clock % 25;
        return schedule - 1;
    }

    function replayAction(uint256[5] calldata row, uint256 schedule, uint256 seed) external {
        require(msg.sender == address(this), "history driver only");
        _action(row, schedule, seed);
        uint256[] memory actual = _state();
        bytes32 expected = bytes32(row[4]);
        if (sha256(abi.encodePacked(actual)) != expected) {
            emit log_named_uint("schedule", schedule);
            emit log_named_uint("timestamp", row[0]);
            emit log_named_array("actual state", actual);
        }
        assertEq(sha256(abi.encodePacked(actual)), expected, "independent action-state oracle");
    }

    function _action(uint256[5] calldata data, uint256 schedule, uint256 seed) private {
        uint256 timestamp = data[0];
        uint256 op = data[1];
        uint256 target = data[2];
        uint256 arg = data[3];
        if (schedule == 1 || schedule == 2) {
            for (
                uint256 intermediate = block.timestamp + 1;
                intermediate < timestamp;
                ++intermediate
            ) {
                if (schedule == 2 && (seed + intermediate) % 3 != 0) continue;
                vm.warp(intermediate);
                _process(_budget(schedule, seed + intermediate));
            }
        }
        vm.warp(timestamp);
        // Transfer itself must not catch up. Other due positions are retired
        // afterward, yielding the same independent canonical state at this time.
        if (op == 8) {
            address previous = tier.ownerOf(target);
            bytes32 accounting = keccak256(
                abi.encode(
                    tier.accountingStatus(), tier.reserveState(), tier.allocationState(target)
                )
            );
            vm.prank(previous);
            tier.transferFrom(previous, _member(arg), target);
            assertEq(
                keccak256(
                    abi.encode(
                        tier.accountingStatus(), tier.reserveState(), tier.allocationState(target)
                    )
                ),
                accounting
            );
            _process(_budget(schedule, seed + timestamp));
            return;
        }
        _process(_budget(schedule, seed + timestamp));
        if (op == 0 || op == 2) {
            bool voluntary = tier.pricePerPeriod() == 0;
            vm.prank(_member(target));
            if (voluntary) {
                tier.createContributionMembership(op == 2 ? 0 : arg, _referrer(target % 2));
            } else {
                tier.createMembership(arg.toUint64(), _referrer(target % 2));
            }
        } else if (op == 1 || op == 3) {
            address beneficiary = tier.ownerOf(target);
            (, address locked) = tier.referralOf(target);
            address choice =
                locked == address(0) ? _referrer((uint160(beneficiary) - 0x100) % 2) : locked;
            bool voluntary = tier.pricePerPeriod() == 0;
            vm.prank(beneficiary);
            if (voluntary) tier.renewContributionMembership(target, op == 3 ? 0 : arg, choice);
            else tier.renewMembership(target, arg.toUint64(), choice);
        } else if (op == 4) {
            vm.prank(_owner(ownerIndex));
            tier.grantMembership(_member(target), arg.toUint64());
        } else if (op == 5 || op == 6 || op == 7) {
            address beneficiary = tier.ownerOf(target);
            vm.prank(_owner(ownerIndex));
            if (op == 5) tier.addGrantTime(target, beneficiary, arg.toUint64());
            else if (op == 6) tier.revokeGrantTime(target, beneficiary);
            else refunded += tier.refund(target, beneficiary, type(uint256).max);
        } else if (op == 9) {
            address beneficiary = tier.ownerOf(target);
            vm.prank(beneficiary);
            uint256 amount = tier.claimReward(target);
            positionClaimed[target] += amount;
            claimed[1] += amount;
        } else if (op == 10) {
            vm.prank(_member(target));
            claimed[1] += tier.claimRetiredRewards();
        } else if (op == 11) {
            vm.prank(_referrer(target));
            claimed[2] += tier.claimReferral();
        } else if (op == 12) {
            vm.prank(_owner(ownerIndex));
            claimed[0] += tier.withdrawCreatorProceeds();
        } else if (op == 13) {
            claimed[3] += tier.releaseProtocolFees();
        } else if (op == 14) {
            vm.prank(_owner(ownerIndex));
            tier.transferOwnership(_owner(1 - ownerIndex));
            ownerIndex = 1 - ownerIndex;
            vm.prank(_owner(ownerIndex));
            tier.acceptOwnership();
        } else if (op == 15) {
            tier.giftMembership(_member(target), arg.toUint64());
        } else if (op == 16) {
            address beneficiary = tier.ownerOf(target);
            (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(target);
            tier.giftRenewal(target, beneficiary, arg.toUint64(), status, referrer);
        } else if (op == 17) {
            vm.prank(_owner(ownerIndex));
            tier.setPaused(true);
            assertTrue(tier.processExpirations(_budget(schedule, seed + timestamp)).complete);
            vm.prank(_owner(ownerIndex));
            claimed[0] += tier.withdrawCreatorProceeds();
            vm.prank(_owner(ownerIndex));
            tier.setPaused(false);
        } else if (op != 18) {
            fail("unknown authored lifecycle action");
        }
    }

    function _state() private view returns (uint256[] memory result) {
        uint256 minted = tier.totalMinted();
        result = new uint256[](GLOBAL_LENGTH + POSITION_LENGTH * minted);
        MembershipTypes.EarnedBalances memory balances =
        tier.previewAccounting(0, address(0), address(0), 0).settled;
        result[0] = tier.lifetimeGross();
        result[1] = balances.creator * Q + balances.fractionalScaled[0];
        result[2] = balances.protocol * Q + balances.fractionalScaled[3];
        uint256 liabilities = result[1] + result[2];
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        for (uint256 p; p < 4; ++p) {
            result[3 + p] = reserves.unearnedScaled[p];
            result[7 + p] = reserves.cancellationScaled[p];
            result[20 + p] = claimed[p];
            liabilities += result[3 + p] + result[7 + p];
        }
        result[11] = reserves.distributionDustScaled;
        result[12] = reserves.indexCarryScaled;
        result[13] = reserves.unassignedMemberScaled;
        liabilities += result[11] + result[12] + result[13];
        result[14] = refunded;
        result[15] = token.balanceOf(address(tier));
        result[16] = ownerIndex;
        result[17] = minted;
        result[18] = tier.totalRewardShares();
        result[19] = tier.occupiedSupply();
        for (uint256 m; m < 3; ++m) {
            (uint256 raw, uint256 fractional) = tier.claimableRetiredReward(_member(m));
            result[24 + m] = raw * Q + fractional;
            liabilities += result[24 + m];
            result[27 + m] = token.balanceOf(_member(m));
            result[37 + m] = tier.balanceOf(_member(m));
            if (m < 2) {
                MembershipTypes.EarnedBalances memory referral =
                tier.previewAccounting(0, address(0), _referrer(m), 0).settled;
                result[30 + m] = referral.referral * Q + referral.fractionalScaled[2];
                liabilities += result[30 + m];
                result[32 + m] = token.balanceOf(_referrer(m));
                result[34 + m] = token.balanceOf(_owner(m));
            }
        }
        result[36] = token.balanceOf(address(this));
        uint256 shareSum;
        for (uint256 id = 1; id <= minted; ++id) {
            uint256 offset = GLOBAL_LENGTH + (id - 1) * POSITION_LENGTH;
            if (tier.isOccupied(id)) {
                result[offset] = uint160(tier.ownerOf(id)) - 0x100 + 1;
            }
            (result[offset + 1], result[offset + 2],) = tier.timeBalances(id);
            result[offset + 3] = tier.sharesOf(id);
            shareSum += result[offset + 3];
            MembershipTypes.EarnedBalances memory member =
            tier.previewAccounting(id, address(0), address(0), 0).settled;
            result[offset + 4] = member.member * Q + member.fractionalScaled[1];
            liabilities += result[offset + 4];
            result[offset + 5] = positionClaimed[id];
            (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(id);
            result[offset + 6] = uint256(status);
            result[offset + 7] = referrer == address(0) ? 0 : uint160(referrer) - 0x200 + 1;
            MembershipTypes.AllocationState memory allocation = tier.allocationState(id);
            result[offset + 8] = allocation.generation;
            result[offset + 9] = allocation.lotCount;
        }
        assertEq(result[15] * Q, liabilities, "exact scaled cash conservation");
        assertEq(result[18], shareSum, "settled live weight sum");
        assertTrue(tier.accountingStatus().complete);
    }
}
