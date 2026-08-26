// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract AccountingHandler is Test {
    uint256 private constant _MAX_GROSS = 100_000_000;
    uint256 private constant _MAX_SURPLUS = 10_000_000;

    MockUSDG public immutable paymentToken;
    MembershipFactory public immutable factory;
    MembershipTier public immutable tier;
    address public immutable creator;
    address public immutable feeRecipient;

    address[4] private _actors;

    uint256 public ghostGrossIn;
    uint256 public ghostOwnerTopUps;
    uint256 public ghostSurplusIn;
    uint256 public ghostCreatorWithdrawn;
    uint256 public ghostRewardClaimed;
    uint256 public ghostReferralClaimed;
    uint256 public ghostRefunded;
    uint256 public ghostProtocolWithdrawn;
    uint256 public ghostRewardAllocated;

    constructor(
        MockUSDG paymentToken_,
        MembershipFactory factory_,
        MembershipTier tier_,
        address creator_,
        address feeRecipient_,
        address[4] memory actors_
    ) {
        paymentToken = paymentToken_;
        factory = factory_;
        tier = tier_;
        creator = creator_;
        feeRecipient = feeRecipient_;
        _actors = actors_;

        for (uint256 i; i < actors_.length; ++i) {
            vm.prank(actors_[i]);
            paymentToken_.approve(address(tier_), type(uint256).max);
        }
        vm.prank(creator_);
        paymentToken_.approve(address(tier_), type(uint256).max);
    }

    function contribute(uint256 actorSeed, uint256 grossSeed, uint256 referralSeed) external {
        address actor = _actor(actorSeed);
        uint256 gross = grossSeed % (_MAX_GROSS + 1);
        address referralChoice = _referralChoice(actor, referralSeed);
        if (gross != 0) paymentToken.mint(actor, gross);

        vm.prank(actor);
        uint256 tokenId = tier.contribute(gross, referralChoice);

        ghostGrossIn += gross;
        ghostRewardAllocated += Math.mulDiv(gross, tier.rewardBps(), 10_000);
        if (gross != 0) {
            (MembershipTypes.ReferralStatus status,) = tier.referralOf(tokenId);
            assertTrue(status != MembershipTypes.ReferralStatus.Unset);
        }
    }

    function claimReward(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return;

        uint256 expected = tier.claimableReward(tokenId);
        vm.prank(actor);
        uint256 claimed = tier.claimReward(tokenId);
        assertEq(claimed, expected);
        ghostRewardClaimed += claimed;
    }

    function claimReferral(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 expected = tier.claimableReferral(actor);
        vm.prank(actor);
        uint256 claimed = tier.claimReferral();
        assertEq(claimed, expected);
        ghostReferralClaimed += claimed;
    }

    function refund(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;

        (uint256 expectedRefund, uint256 expectedTopUp) = tier.previewRefund(tokenId);
        if (expectedTopUp != 0) paymentToken.mint(creator, expectedTopUp);

        vm.prank(creator);
        (uint256 refunded, uint256 ownerTopUp) = tier.refund(tokenId, expectedTopUp);
        assertEq(refunded, expectedRefund);
        assertEq(ownerTopUp, expectedTopUp);
        ghostOwnerTopUps += ownerTopUp;
        ghostRefunded += refunded;
    }

    function withdrawCreatorProceeds() external {
        uint256 expected = tier.creatorProceeds();
        vm.prank(creator);
        uint256 withdrawn = tier.withdrawCreatorProceeds();
        assertEq(withdrawn, expected);
        ghostCreatorWithdrawn += withdrawn;
    }

    function withdrawProtocolFees() external {
        uint256 expected = paymentToken.balanceOf(address(factory));
        vm.prank(feeRecipient);
        uint256 withdrawn = factory.withdrawProtocolFees();
        assertEq(withdrawn, expected);
        ghostProtocolWithdrawn += withdrawn;
    }

    function donateToTier(uint256 amountSeed) external {
        uint256 amount = amountSeed % (_MAX_SURPLUS + 1);
        if (amount == 0) return;
        address donor = _actors[0];
        paymentToken.mint(donor, amount);
        vm.prank(donor);
        assertTrue(paymentToken.transfer(address(tier), amount));
        ghostSurplusIn += amount;
    }

    function donateToFactory(uint256 amountSeed) external {
        uint256 amount = amountSeed % (_MAX_SURPLUS + 1);
        if (amount == 0) return;
        address donor = _actors[1];
        paymentToken.mint(donor, amount);
        vm.prank(donor);
        assertTrue(paymentToken.transfer(address(factory), amount));
        ghostSurplusIn += amount;
    }

    function warp(uint256 elapsedSeed) external {
        vm.warp(block.timestamp + elapsedSeed % (90 days + 1));
    }

    function _actor(uint256 seed) private view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _referralChoice(address actor, uint256 seed) private view returns (address choice) {
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return seed % 2 == 0 ? address(0) : _actor(seed >> 1);

        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        if (status == MembershipTypes.ReferralStatus.LockedAddress) return referrer;
        if (status == MembershipTypes.ReferralStatus.LockedNone) return address(0);
        return seed % 2 == 0 ? address(0) : _actor(seed >> 1);
    }
}

contract AccountingInvariantTest is StdInvariant, Test {
    MockUSDG private _paymentToken;
    MembershipFactory private _factory;
    MembershipTier private _tier;
    AccountingHandler private _handler;

    function setUp() public {
        _paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        address creator = makeAddr("invariantCreator");
        address feeRecipient = makeAddr("invariantFeeRecipient");
        _factory =
            new MembershipFactory(_paymentToken, address(renderer), address(this), feeRecipient);

        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(creator);
        config.pricePerPeriod = 0;
        config.maxPrepaidPeriods = 0;
        vm.prank(creator);
        _tier = MembershipTier(_factory.createTier(config));

        address[4] memory actors = [
            makeAddr("accountingActor0"),
            makeAddr("accountingActor1"),
            makeAddr("accountingActor2"),
            makeAddr("accountingActor3")
        ];
        _handler =
            new AccountingHandler(_paymentToken, _factory, _tier, creator, feeRecipient, actors);

        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = AccountingHandler.contribute.selector;
        selectors[1] = AccountingHandler.claimReward.selector;
        selectors[2] = AccountingHandler.claimReferral.selector;
        selectors[3] = AccountingHandler.refund.selector;
        selectors[4] = AccountingHandler.withdrawCreatorProceeds.selector;
        selectors[5] = AccountingHandler.withdrawProtocolFees.selector;
        selectors[6] = AccountingHandler.donateToTier.selector;
        selectors[7] = AccountingHandler.donateToFactory.selector;
        selectors[8] = AccountingHandler.warp.selector;
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_accountingConservationAndProtectedLiabilities() public view {
        uint256 tierBalance = _paymentToken.balanceOf(address(_tier));
        uint256 factoryBalance = _paymentToken.balanceOf(address(_factory));
        uint256 liabilities =
            _tier.creatorProceeds() + _tier.rewardReserve() + _tier.totalReferralLiability();
        assertGe(tierBalance, liabilities);

        uint256 inflows =
            _handler.ghostGrossIn() + _handler.ghostOwnerTopUps() + _handler.ghostSurplusIn();
        uint256 accounted = tierBalance + factoryBalance + _handler.ghostCreatorWithdrawn()
            + _handler.ghostRewardClaimed() + _handler.ghostReferralClaimed()
            + _handler.ghostRefunded() + _handler.ghostProtocolWithdrawn();
        assertEq(accounted, inflows);

        assertEq(
            _handler.ghostRewardClaimed() + _tier.rewardReserve(), _handler.ghostRewardAllocated()
        );
    }
}
