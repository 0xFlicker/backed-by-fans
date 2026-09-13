// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {ProtocolBurnRouter} from "../src/ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {VestingSchedulerHarness} from "./VestingScheduler.t.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

/// @dev Measure only the operation, with cold contract/storage access. These are gross
/// execution gas measurements, excluding deployment, setup, intrinsic gas and refunds.
// Bounds include permanent expiration processing, ERC-721 enumeration and explicit
// position claims. See feature 005 evidence/gas.md for measured old/new deltas.
contract GasAccountingTest is Test {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }
    MembershipFactory private factory;
    MockUSDG private token;
    OnchainMetadataRenderer private renderer;
    address private ledger;
    address[] private benchmarkTiers;
    VestingSchedulerHarness private equalEnds;
    VestingSchedulerHarness private continuingEnds;
    VestingSchedulerHarness private staggeredEnds;
    address private freshMember;

    function _recordGas(string memory name, uint256 used, bytes memory callData) private {
        // Capture before any further external call. The callee frame includes its
        // nested calls/refunds, without the test caller's ABI/memory overhead.
        // Forge 1.7.1 exposes this as lastCallGas; lastFrameGas is not implemented.
        Vm.Gas memory frame = vm.lastCallGas();
        uint256 intrinsic = 21_000;
        for (uint256 i; i < callData.length; ++i) {
            intrinsic += callData[i] == 0 ? 4 : 16;
        }
        assertGe(frame.gasRefunded, 0);
        uint256 gross = intrinsic + frame.gasTotalUsed;
        // Cancun retains EIP-3529's 20% refund cap. This models execution plus
        // intrinsic gas only, not an L2 data fee or a live wallet price quote.
        uint256 refund = uint256(uint64(frame.gasRefunded));
        uint256 charged = gross - (refund < gross / 5 ? refund : gross / 5);
        emit log_named_uint(name, used);
        emit log_named_uint(string.concat(name, "_callee"), frame.gasTotalUsed);
        emit log_named_uint(string.concat(name, "_refund"), refund);
        emit log_named_uint(string.concat(name, "_intrinsic"), intrinsic);
        emit log_named_uint(string.concat(name, "_charged"), charged);
    }

    function setUp() public {
        new LinkedVestingFixture().install();
        ledger = vm.parseJsonAddress(vm.readFile("out/vesting-leaf/link-manifest.json"), ".address");
        vm.warp(1000);
        token = new MockUSDG();
        SyntheticPonsBinding.bind(address(token));
        renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(token),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(token))
        );
        for (uint256 i; i < 8; ++i) {
            benchmarkTiers.push(address(_tier(i)));
        }
        freshMember = makeAddr("fresh benchmark member");
        token.mint(freshMember, 1000);
        vm.prank(freshMember);
        token.approve(benchmarkTiers[0], 1000);
        equalEnds = _scheduler(false, false);
        continuingEnds = _scheduler(true, false);
        staggeredEnds = _scheduler(false, true);
        ProtocolBuybackVault(payable(factory.buybackVault())).setBuybacksPaused(false);
    }

    function _tier(uint256 salt) private returns (MembershipTier result) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(token));
        config.tierSalt = bytes32(salt + 1);
        config.protocolFeeBps = 1000;
        config.rewardBps = 2000;
        config.referralBps = 1000;
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        result = MembershipTier(factory.createTier(config));
        token.mint(address(this), 10_000);
        token.approve(address(result), 10_000);
        result.createMembership(1, address(0), 25);
        address buyer = makeAddr("referred buyer");
        token.mint(buyer, 1000);
        vm.startPrank(buyer);
        token.approve(address(result), 1000);
        result.createMembership(1, address(this), 25);
        vm.stopPrank();
    }

    function _claim(uint256 count, bool settle, string memory name) private {
        MembershipTypes.TierClaimRequest[] memory tiers =
            new MembershipTypes.TierClaimRequest[](count);
        for (uint256 i; i < count; ++i) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = 1;
            tiers[i] = MembershipTypes.TierClaimRequest(benchmarkTiers[i], ids);
        }
        for (uint256 i = 1; i < tiers.length; ++i) {
            uint256 j = i;
            while (j > 0 && tiers[j - 1].tier > tiers[j].tier) {
                (tiers[j - 1], tiers[j]) = (tiers[j], tiers[j - 1]);
                --j;
            }
        }
        vm.warp(settle ? 1100 : 1050);
        for (uint256 i; i < count; ++i) {
            vm.cool(tiers[i].tier);
        }
        vm.cool(address(factory));
        vm.cool(address(token));
        vm.cool(MembershipTestConfig.implementation());
        vm.cool(ledger);
        uint256 beforeGas = gasleft();
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(tiers, 25);
        uint256 used = beforeGas - gasleft();
        _recordGas(name, used, abi.encodeCall(factory.claimEverything, (tiers, 25)));
        assertLe(
            used, settle ? 2_700_000 : count == 1 ? 430_000 : count == 3 ? 1_230_000 : 3_400_000
        );
        for (uint256 i; i < count; ++i) {
            assertEq(results[i].processedSteps, settle ? 4 : 0);
            assertGt(results[i].creator, 0);
            assertGt((results[i].liveReward + results[i].retiredReward), 0);
            assertGt(results[i].referral, 0);
        }
    }

    function test_gas_claim1Continuous() public {
        _claim(1, false, "claim_1_continuous");
    }

    function test_gas_claim3Continuous() public {
        _claim(3, false, "claim_3_continuous");
    }

    function test_gas_claim8Continuous() public {
        _claim(8, false, "claim_8_continuous");
    }

    function test_gas_claim3WithEnds() public {
        _claim(3, true, "claim_3_with_ends");
    }

    function test_gas_claimNoReferral() public {
        MembershipTier tier = MembershipTier(benchmarkTiers[0]);
        vm.warp(1050);
        vm.cool(address(tier));
        vm.cool(address(token));
        vm.cool(MembershipTestConfig.implementation());
        vm.cool(ledger);
        vm.prank(makeAddr("referred buyer"));
        uint256[] memory ids = new uint256[](1);
        ids[0] = 2;
        uint256 beforeGas = gasleft();
        MembershipTypes.ClaimResult memory result = tier.claimRewards(ids, 25);
        uint256 used = beforeGas - gasleft();
        _recordGas("claim_member_only", used, abi.encodeCall(tier.claimRewards, (ids, 25)));
        assertLe(used, 360_000);
        assertGt((result.liveReward + result.retiredReward), 0);
        assertEq(result.creator + result.referral, 0);
    }

    function _purchase(bool renewal) private {
        MembershipTier tier = MembershipTier(benchmarkTiers[0]);
        address buyer = renewal ? address(this) : freshMember;
        address referrer = renewal ? address(0) : address(this);
        vm.warp(1050);
        vm.cool(address(tier));
        vm.cool(address(token));
        vm.cool(MembershipTestConfig.implementation());
        vm.cool(ledger);
        vm.prank(buyer);
        uint256 beforeGas = gasleft();
        uint256 tokenId;
        if (renewal) {
            tier.renewMembership(1, 1, referrer, 25);
            tokenId = 1;
        } else {
            tokenId = tier.createMembership(1, referrer, 25);
        }
        uint256 used = beforeGas - gasleft();
        _recordGas(
            renewal ? "renewal" : "join",
            used,
            renewal
                ? abi.encodeCall(tier.renewMembership, (1, 1, referrer, 25))
                : abi.encodeCall(tier.createMembership, (1, referrer, 25))
        );
        assertLe(used, renewal ? 600_000 : 1_050_000);
        assertEq(tokenId, renewal ? 1 : 3);
        assertEq(tier.sharesOf(tokenId), renewal ? 2000 : 1000);
        assertTrue(
            (tier.tokensOfOwner(buyer, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(buyer, 0, 1).tokenIds[0]))
        );
    }

    function test_gas_join() public {
        _purchase(false);
    }

    function test_gas_renewal() public {
        _purchase(true);
    }

    function _scheduler(bool continuing, bool staggered)
        private
        returns (VestingSchedulerHarness scheduler)
    {
        scheduler = new VestingSchedulerHarness(1000);
        scheduler.weight(1, 1000, true);
        for (uint256 i = 1; i <= 128; ++i) {
            uint64 duration = uint64(staggered ? 100 + i : 100);
            scheduler.fundAllocations(i, [uint256(601), 203, 97, 99], 1000, duration, address(this));
            if (continuing) {
                scheduler.fundAllocations(
                    i, [uint256(601), 203, 97, 99], 1000 + duration, 100, address(this)
                );
            }
        }
    }

    function _checkpoints(uint256 steps, bool continuing, bool staggered, string memory name)
        private
    {
        VestingSchedulerHarness scheduler =
            continuing ? continuingEnds : staggered ? staggeredEnds : equalEnds;
        vm.cool(address(scheduler));
        vm.cool(MembershipTestConfig.implementation());
        vm.cool(ledger);
        uint256 beforeGas = gasleft();
        VestingLedger.ProcessResult memory result = scheduler.process(1200, steps);
        uint256 used = beforeGas - gasleft();
        _recordGas(name, used, abi.encodeCall(scheduler.process, (1200, steps)));
        assertLe(
            used,
            continuing
                ? 4_100_000
                : staggered ? 3_960_000 : steps == 1 ? 440_000 : steps == 10 ? 1_830_000 : 3_600_000
        );
        assertEq(result.processed, steps);
        assertFalse(result.complete);
        assertEq(scheduler.count(), continuing ? 128 : 128 - steps);
    }

    function test_gas_checkpoint1() public {
        _checkpoints(1, false, false, "checkpoint_1_of_128");
    }

    function test_gas_checkpoint10() public {
        _checkpoints(10, false, false, "checkpoint_10_of_128");
    }

    function test_gas_checkpoint25() public {
        _checkpoints(25, false, false, "checkpoint_25_of_128");
    }

    function test_gas_checkpoint25Continuing() public {
        _checkpoints(25, true, false, "checkpoint_25_continuing");
    }

    function test_gas_checkpoint25Staggered() public {
        _checkpoints(25, false, true, "checkpoint_25_staggered");
    }

    function test_gas_advanceAndBurn() public {
        MembershipTier tier = MembershipTier(benchmarkTiers[0]);
        ProtocolBuybackVault vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        ProtocolBurnRouter router = ProtocolBurnRouter(factory.burnRouter());
        vm.warp(1100);
        ProtocolBurnRouter.AdvanceTier[] memory tiers = new ProtocolBurnRouter.AdvanceTier[](1);
        tiers[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 25);
        ProtocolBurnRouter.Purchase[] memory purchases = new ProtocolBurnRouter.Purchase[](1);
        purchases[0] = ProtocolBurnRouter.Purchase(address(token), 0);
        vm.cool(address(tier));
        vm.cool(address(factory));
        vm.cool(address(token));
        vm.cool(address(vault));
        vm.cool(address(router));
        vm.cool(MembershipTestConfig.implementation());
        vm.cool(ledger);
        uint256 beforeGas = gasleft();
        (, uint256 released, uint256 bought, uint256 burned) =
            router.advance(tiers, purchases, 1200);
        uint256 used = beforeGas - gasleft();
        _recordGas(
            "advance_and_direct_burn",
            used,
            abi.encodeCall(router.advance, (tiers, purchases, 1200))
        );
        assertLe(used, 1_100_000);
        assertEq(released, 1);
        assertEq(bought, 1);
        assertEq(burned, 200);
    }
}
