// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MembershipReceiver} from "./mocks/MembershipReceiver.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {NonReceiverWallet} from "./mocks/NonReceiverWallet.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipReceiverTest is Test {
    uint64 private constant START = 1_000_000;
    uint64 private constant PERIOD = 30 days;
    uint256 private constant PRICE = 10_000_000;
    MembershipTier private tier;
    MockUSDG private payment;
    MembershipReceiver private receiver;
    address private member;
    address private other;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(START);
        member = makeAddr("receiverPayer");
        other = makeAddr("receiverOther");
        payment = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(payment)),
            payment,
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(payment))
        );
        receiver = new MembershipReceiver(tier);
        payment.mint(member, 10 * PRICE);
        payment.mint(address(receiver), 10 * PRICE);
        vm.prank(member);
        payment.approve(address(tier), type(uint256).max);
        vm.prank(address(receiver));
        payment.approve(address(tier), type(uint256).max);
    }

    function test_safeGiftMintShowsCompletePositionAndCatchesNestedMutationFailures() public {
        _probe(1, false);
        vm.prank(member);
        uint256 id = tier.giftMembership(address(receiver), 1, 25);
        _assertObservation(id, member, address(0), PRICE, PRICE, 1);
        _assertGuardFailures();
        assertEq(payment.balanceOf(member), 9 * PRICE);
        assertEq(payment.balanceOf(address(receiver)), 10 * PRICE);
        assertEq(tier.totalMinted(), 1);
        assertEq(tier.occupiedSupply(), 1);
        (MembershipTypes.ReferralStatus status,) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
    }

    function test_safeSelfPurchaseMintAllowsValidOuterCallWithoutNestedGuardFailure() public {
        _probe(1, false);
        uint256 id = abi.decode(
            receiver.execute(
                abi.encodeCall(MembershipTier.createMembership, (uint64(1), address(0), 25))
            ),
            (uint256)
        );
        _assertObservation(id, address(receiver), address(0), PRICE, PRICE, 1);
        _assertGuardFailures();
        assertEq(payment.balanceOf(address(receiver)), 9 * PRICE);
        (MembershipTypes.ReferralStatus status,) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedNone));
        // The callback guard must clear when the successful outer transaction ends.
        receiver.execute(
            abi.encodeCall(MembershipTier.renewMembership, (id, uint64(1), address(0), 25))
        );
        assertEq(tier.expiresAt(id), START + 2 * PERIOD);
    }

    function test_safeGrantMintShowsScheduledZeroWeightPositionBeforeCallback() public {
        _probe(1, false);
        uint256 id = tier.grantMembership(address(receiver), 1, 25);
        _assertObservation(id, address(this), address(0), 0, 0, 0);
        _assertGuardFailures();
        assertEq(payment.balanceOf(address(tier)), 0);
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_safeTransferBothOverloadsKeepGuardThroughAcceptingCallback() public {
        uint256 id = _create();
        bytes32 before = receiver.economicState(id);
        _probe(id, false);
        vm.prank(member);
        tier.safeTransferFrom(member, address(receiver), id);
        _assertObservation(id, member, member, PRICE, PRICE, 1);
        _assertGuardFailures();
        assertEq(receiver.lastData(), bytes(""));
        assertEq(receiver.economicState(id), before);

        receiver.execute(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)", address(receiver), member, id
            )
        );
        _probe(id, false);
        bytes memory data = hex"cafe012345";
        vm.prank(member);
        tier.safeTransferFrom(member, address(receiver), id, data);
        _assertObservation(id, member, member, PRICE, PRICE, 1);
        _assertGuardFailures();
        assertEq(receiver.lastData(), data);
        assertEq(receiver.economicState(id), before);
        assertEq(receiver.callbackCount(), 2);
        assertEq(tier.balanceOf(member), 0);
        assertEq(tier.balanceOf(address(receiver)), 1);
    }

    function test_safeTransferRejectionRestoresOwnerEnumerationApprovalAndEconomics() public {
        uint256 id = _create();
        vm.prank(member);
        tier.approve(other, id);
        bytes32 before = receiver.economicState(id);
        _configure(MembershipReceiver.Response.WrongSelector);
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(receiver))
        );
        tier.safeTransferFrom(member, address(receiver), id);
        _assertTransferRolledBack(id, before);
        assertEq(tier.getApproved(id), other);

        _configure(MembershipReceiver.Response.RevertCallback);
        vm.prank(other);
        vm.expectRevert(MembershipReceiver.ReceiverRejected.selector);
        tier.safeTransferFrom(member, address(receiver), id, hex"1234");
        _assertTransferRolledBack(id, before);
        assertEq(tier.getApproved(id), other);
    }

    function test_bubbledNestedFailureRollsBackSafeTransfer() public {
        uint256 id = _create();
        bytes32 before = receiver.economicState(id);
        _probe(id, true);
        vm.prank(member);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        tier.safeTransferFrom(member, address(receiver), id, hex"abcd");
        _assertTransferRolledBack(id, before);
        assertEq(receiver.attempts(), 0);
    }

    function test_bubbledNestedFailureRollsBackMintPaymentFundingAndIdentity() public {
        _probe(1, true);
        vm.prank(member);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        tier.giftMembership(address(receiver), 1, 25);
        _assertMintRolledBack();
        _configure(MembershipReceiver.Response.Accept);
        vm.prank(member);
        assertEq(tier.giftMembership(address(receiver), 1, 25), 1);
    }

    function test_rejectedMintRollsBackForWrongSelectorAndExplicitRevert() public {
        _configure(MembershipReceiver.Response.WrongSelector);
        vm.prank(member);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(receiver))
        );
        tier.giftMembership(address(receiver), 1, 25);
        _assertMintRolledBack();
        _configure(MembershipReceiver.Response.RevertCallback);
        vm.prank(member);
        vm.expectRevert(MembershipReceiver.ReceiverRejected.selector);
        tier.giftMembership(address(receiver), 1, 25);
        _assertMintRolledBack();
    }

    function test_nonReceiverContractRejectsSafeMintAndSafeTransfer() public {
        address invalid = address(new NonReceiverWallet());
        vm.prank(member);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, invalid)
        );
        tier.giftMembership(invalid, 1, 25);
        _assertMintRolledBack();
        uint256 id = _create();
        vm.prank(member);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, invalid)
        );
        tier.safeTransferFrom(member, invalid, id);
        assertEq(tier.ownerOf(id), member);
        assertEq(tier.balanceOf(invalid), 0);
    }

    function _create() private returns (uint256) {
        vm.prank(member);
        return tier.createMembership(1, address(0), 25);
    }

    function _configure(MembershipReceiver.Response response) private {
        receiver.configure(response, new bytes[](0), false);
    }

    function _probe(uint256 id, bool bubble) private {
        bytes[] memory calls = new bytes[](7);
        calls[0] = abi.encodeCall(MembershipTier.claimReward, (id, 25));
        calls[1] = abi.encodeCall(MembershipTier.renewMembership, (id, uint64(1), address(0), 25));
        calls[2] = abi.encodeWithSignature(
            "transferFrom(address,address,uint256)", address(receiver), other, id
        );
        calls[3] = abi.encodeWithSignature(
            "safeTransferFrom(address,address,uint256)", address(receiver), other, id
        );
        calls[4] = abi.encodeWithSignature(
            "safeTransferFrom(address,address,uint256,bytes)",
            address(receiver),
            other,
            id,
            bytes("nested")
        );
        calls[5] = abi.encodeCall(MembershipTier.processAccounting, (uint256(25)));
        calls[6] = abi.encodeCall(MembershipTier.processExpirations, (uint256(25)));
        receiver.configure(MembershipReceiver.Response.Accept, calls, bubble);
    }

    function _assertObservation(
        uint256 id,
        address operator,
        address from,
        uint256 shares,
        uint256 liability,
        uint256 lots
    ) private view {
        MembershipReceiver.Observation memory observed = receiver.observed();
        assertEq(observed.operator, operator);
        assertEq(observed.from, from);
        assertEq(observed.owner, address(receiver));
        assertEq(observed.approved, address(0));
        assertEq(observed.tokenId, id);
        assertEq(observed.balance, 1);
        assertEq(observed.enumeratedToken, id);
        assertEq(observed.expiration, START + PERIOD);
        assertEq(observed.expirationCount, 1);
        assertEq(observed.shares, shares);
        assertEq(observed.liability, liability);
        assertEq(observed.gross, shares);
        assertEq(observed.lots, lots);
        assertEq(observed.eligible, shares != 0);
        assertEq(observed.economicState, receiver.economicState(id));
    }

    function _assertGuardFailures() private view {
        assertEq(receiver.attempts(), 7);
        for (uint256 i; i < 7; ++i) {
            assertFalse(receiver.succeeded(i));
            assertEq(
                receiver.result(i),
                abi.encodeWithSelector(
                    ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector
                )
            );
        }
    }

    function _assertTransferRolledBack(uint256 id, bytes32 economicBefore) private view {
        assertEq(tier.ownerOf(id), member);
        assertEq(tier.balanceOf(member), 1);
        assertEq(tier.tokensOfOwner(member, 0, 1).tokenIds[0], id);
        assertEq(tier.balanceOf(address(receiver)), 0);
        assertEq(receiver.callbackCount(), 0);
        assertEq(receiver.economicState(id), economicBefore);
    }

    function _assertMintRolledBack() private view {
        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.balanceOf(address(receiver)), 0);
        assertEq(tier.lifetimeGross(), 0);
        assertEq(tier.totalRewardShares(), 0);
        assertEq(tier.totalProtectedLiability(), 0);
        assertEq(tier.accountingStatus().scheduledMembers, 0);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
        assertEq(payment.balanceOf(address(tier)), 0);
        assertEq(payment.balanceOf(member), 10 * PRICE);
        assertEq(receiver.callbackCount(), 0);
    }
}
