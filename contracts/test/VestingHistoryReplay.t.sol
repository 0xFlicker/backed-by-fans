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

/// @dev Public API differential replay. Python authors intervals/cohorts and exact
/// expected balances; neither side reads or reproduces the production heap.
contract VestingHistoryReplayTest is Test {
    using SafeCast for uint256;
    uint256 private constant Q = 1 << 128;
    uint256 private constant VECTOR_LENGTH = 41;
    MockUSDG private token;
    MembershipFactory private factory;
    OnchainMetadataRenderer private renderer;
    MembershipTier private tier;
    uint256[4] private claimed;
    uint256[3] private memberClaimed;
    uint256[2] private referrerClaimed;
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
        return address(SafeCast.toUint160(0x200 + i % 2));
    }

    function _owner(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x300 + i));
    }

    function test_replayIndependentHistories() public {
        // The ordinary suite uses a committed deterministic history. The corpus
        // runner supplies its entire batch explicitly; a prior large run must
        // not silently change the ordinary suite's workload or gas allowance.
        string memory path =
            vm.envOr("BBF_VESTING_HISTORY_INPUT", string("test/fixtures/vesting-history.bin"));
        uint256[] memory data = abi.decode(vm.readFileBinary(path), (uint256[]));
        uint256 cursor = 1;
        for (uint256 history; history < data[0]; ++history) {
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
                vm.prank(_owner(0));
                tier.grantTime(_member(m), 1);
                token.mint(_member(m), 1e18);
                vm.prank(_member(m));
                token.approve(address(tier), type(uint256).max);
            }
            token.mint(address(this), 1e18);
            token.approve(address(tier), type(uint256).max);
            uint256 initial = vm.snapshotState();
            bytes32[] memory sparse = new bytes32[](count);
            for (uint256 frequency; frequency < 3; ++frequency) {
                for (uint256 action; action < count; ++action) {
                    _action(data, cursor + action * 4, frequency, seed);
                    uint256[] memory actual = _state();
                    bytes32 normalized = keccak256(abi.encode(_normalizeClaims(actual)));
                    if (frequency == 0) {
                        sparse[action] = normalized;
                    } else {
                        assertEq(
                            normalized,
                            sparse[action],
                            string.concat("frequency at action ", vm.toString(action))
                        );
                    }
                }
                uint256[] memory finalState = _state();
                uint256[] memory expected = new uint256[](VECTOR_LENGTH);
                for (uint256 field; field < VECTOR_LENGTH; ++field) {
                    expected[field] = data[cursor + count * 4 + field];
                }
                if (frequency != 0) {
                    finalState = _normalizeClaims(finalState);
                    expected = _normalizeClaims(expected);
                }
                for (uint256 field; field < VECTOR_LENGTH; ++field) {
                    assertEq(
                        finalState[field],
                        expected[field],
                        string.concat("oracle field ", vm.toString(field))
                    );
                }
                if (frequency < 2) assertTrue(vm.revertToState(initial));
            }
            cursor += count * 4 + VECTOR_LENGTH;
            assertTrue(vm.revertToState(baseline));
        }
        assertEq(cursor, data.length, "history payload consumed");
    }

    function _process(uint256 budget) private {
        bool complete;
        for (uint256 i; i < 1000; ++i) {
            (,, complete,) = tier.processAccounting(budget);
            if (complete) return;
        }
        fail("bounded history failed to finish accounting");
    }

    function _action(uint256[] memory data, uint256 cursor, uint256 frequency, uint256 seed)
        private
    {
        uint256 timestamp = data[cursor];
        uint256 op = data[cursor + 1];
        uint256 member = data[cursor + 2];
        uint256 arg = data[cursor + 3];
        if (frequency != 0) {
            for (
                uint256 intermediate = block.timestamp + 1;
                intermediate < timestamp;
                ++intermediate
            ) {
                if (frequency == 2 && (seed + intermediate) % 3 != 0) continue;
                vm.warp(intermediate);
                _process(frequency == 1 ? 1 : 1 + (seed + intermediate) % 7);
                _scheduledClaims(frequency, seed + intermediate);
            }
        }
        vm.warp(timestamp);
        _process(frequency == 0 ? 25 : frequency == 1 ? 1 : 1 + (seed + timestamp) % 7);
        uint256 id = member + 1;
        if (op == 0) {
            bool voluntary = tier.pricePerPeriod() == 0;
            vm.prank(_member(member));
            if (voluntary) tier.contribute(arg, _referrer(member));
            else tier.purchase(arg.toUint64(), _referrer(member));
        } else if (op == 1) {
            vm.prank(_member(member));
            tier.contribute(0, address(0));
        } else if (op == 2) {
            vm.prank(_owner(ownerIndex));
            tier.grantTime(_member(member), arg.toUint64());
        } else if (op == 3) {
            vm.prank(_owner(ownerIndex));
            tier.revokeGrantTime(id);
        } else if (op == 4) {
            vm.prank(_owner(ownerIndex));
            refunded += tier.refund(id, type(uint256).max);
        } else if (op == 5) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = id;
            vm.prank(_owner(ownerIndex));
            assertEq(tier.synchronizeExpiredMemberships(ids), 1);
        } else if (op == 6) {
            _claimMember(member);
        } else if (op == 7) {
            _claimReferrer(member % 2);
        } else if (op == 8) {
            vm.prank(_owner(ownerIndex));
            claimed[0] += tier.withdrawCreatorProceeds();
        } else if (op == 9) {
            claimed[3] += tier.releaseProtocolFees();
        } else if (op == 10) {
            vm.prank(_owner(ownerIndex));
            tier.transferOwnership(_owner(1 - ownerIndex));
            ownerIndex = 1 - ownerIndex;
            vm.prank(_owner(ownerIndex));
            tier.acceptOwnership();
        } else if (op == 11) {
            (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(id);
            tier.gift(_member(member), arg.toUint64(), status, referrer);
        } else if (op == 12) {
            vm.prank(_owner(ownerIndex));
            tier.setPaused(true);
            // Settled claims are legal during pause, including zero payouts.
            vm.prank(_owner(ownerIndex));
            claimed[0] += tier.withdrawCreatorProceeds();
            vm.prank(_owner(ownerIndex));
            tier.setPaused(false);
        } else {
            fail("unknown authored action");
        }
        if (frequency != 0) _scheduledClaims(frequency, seed + timestamp);
    }

    function _claimMember(uint256 member) private {
        vm.prank(_member(member));
        uint256 amount = tier.claimReward(member + 1);
        claimed[1] += amount;
        memberClaimed[member] += amount;
    }

    function _claimReferrer(uint256 referrer) private {
        vm.prank(_referrer(referrer));
        uint256 amount = tier.claimReferral();
        claimed[2] += amount;
        referrerClaimed[referrer] += amount;
    }

    function _scheduledClaims(uint256 frequency, uint256 clock) private {
        if (frequency == 1) {
            for (uint256 m; m < 3; ++m) {
                _claimMember(m);
            }
            for (uint256 r; r < 2; ++r) {
                _claimReferrer(r);
            }
        } else {
            _claimMember(clock % 3);
            if (clock % 2 == 0) _claimReferrer((clock / 2) % 2);
        }
        if (frequency == 1 || clock % 5 == 0) {
            vm.prank(_owner(ownerIndex));
            claimed[0] += tier.withdrawCreatorProceeds();
            claimed[3] += tier.releaseProtocolFees();
        }
    }

    /// @dev Compare earned entitlement as payouts plus outstanding scaled credit.
    /// Creator ownership still controls each real claim; claim timing can change
    /// which owner receives it, so only aggregate creator entitlement is invariant.
    function _normalizeClaims(uint256[] memory state) private pure returns (uint256[] memory) {
        state[1] += state[30] * Q;
        state[2] += state[33] * Q;
        for (uint256 m; m < 3; ++m) {
            state[3 + m] += state[36 + m] * Q;
            state[36 + m] = 0;
        }
        for (uint256 r; r < 2; ++r) {
            state[6 + r] += state[39 + r] * Q;
            state[39 + r] = 0;
        }
        for (uint256 p; p < 4; ++p) {
            state[34] += state[30 + p];
            state[30 + p] = 0;
        }
        return state;
    }

    function _state() private view returns (uint256[] memory result) {
        result = new uint256[](VECTOR_LENGTH);
        result[0] = tier.lifetimeGross();
        uint256 liabilities;
        for (uint256 m; m < 3; ++m) {
            MembershipTypes.EarnedBalances memory balances =
                tier.earnedBalances(m + 1, _referrer(m));
            result[3 + m] = balances.member * Q + balances.fractionalScaled[1];
            liabilities += result[3 + m];
            if (m < 2) {
                result[6 + m] = balances.referral * Q + balances.fractionalScaled[2];
                liabilities += result[6 + m];
            }
            if (m == 0) {
                result[1] = balances.creator * Q + balances.fractionalScaled[0];
                result[2] = balances.protocol * Q + balances.fractionalScaled[3];
                liabilities += result[1] + result[2];
            }
            result[19 + m] = tier.sharesOf(m + 1);
            if (tier.rewardEligible(m + 1)) result[22] |= uint256(1) << m;
            (result[23 + m], result[26 + m],) = tier.timeBalances(m + 1);
        }
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        for (uint256 p; p < 4; ++p) {
            result[8 + p] = reserves.unearnedScaled[p];
            result[12 + p] = reserves.cancellationScaled[p];
            result[30 + p] = claimed[p];
            liabilities += result[8 + p] + result[12 + p];
        }
        result[16] = reserves.distributionDustScaled;
        result[17] = reserves.indexCarryScaled;
        result[18] = reserves.unassignedMemberScaled;
        liabilities += result[16] + result[17] + result[18];
        result[29] = refunded;
        result[34] = token.balanceOf(address(tier));
        result[35] = ownerIndex;
        for (uint256 m; m < 3; ++m) {
            result[36 + m] = memberClaimed[m];
        }
        for (uint256 r; r < 2; ++r) {
            result[39 + r] = referrerClaimed[r];
        }
        assertEq(result[34] * Q, liabilities, "exact scaled cash conservation");
        assertEq(
            tier.totalRewardShares(),
            (result[22] & 1 != 0 ? result[19] : 0) + (result[22] & 2 != 0 ? result[20] : 0)
                + (result[22] & 4 != 0 ? result[21] : 0),
            "eligible sum"
        );
    }
}
