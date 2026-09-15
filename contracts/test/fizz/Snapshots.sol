// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {Base} from "./Base.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Used to take snapshots of the state before and after a function call
abstract contract Snapshots is Base {
    struct State {
        address tier;
        uint256 tokenId;
        address primary;
        address counterparty;
        uint256 primaryPaymentBalance;
        uint256 counterpartyPaymentBalance;
        uint256 tierPaymentBalance;
        uint256 vaultPaymentBalance;
        uint256 totalMinted;
        uint256 totalSupply;
        uint64 occupiedSupply;
        uint112 lifetimeGross;
        uint256 totalRewardShares;
        uint256 rewardPerShare;
        uint64 accountedThrough;
        uint256 scheduledMembers;
        uint256 scheduledExpirations;
        uint64 nextBoundary;
        bool accountingComplete;
        uint64 supplyCap;
        uint64 maxPrepaidPeriods;
        bool paused;
        address owner;
        uint256 ownerBalance;
        uint256 counterpartyTierBalance;
        bool tokenExists;
        address tokenApproval;
        bool operatorApproval;
        bool isOccupied;
        bool isActive;
        uint64 expiration;
        uint64 paidSeconds;
        uint64 grantSeconds;
        uint64 effectiveCheckpoint;
        uint256 shares;
        bool rewardEligible;
        uint256 claimableReward;
        MembershipTypes.ReferralStatus referralStatus;
        address referrer;
        uint256 allocationGeneration;
        uint256 allocationLotCursor;
        uint256 allocationLotCount;
        uint256 refundableGross;
        uint256 creatorProceeds;
        uint256 protocolFeeHeld;
        uint256 claimableReferral;
        uint256 claimableRetiredRaw;
        uint256 protectedLiability;
        bytes32 paymentTotalsHash;
        uint256 protocolPaidRaw;
        uint256 refundedRaw;
        uint256 factoryTierCount;
        uint256 factoryPaymentTokenCount;
        bool tokenListed;
        bool tokenEnabled;
        uint112 tokenMinimum;
        address factoryOwner;
        address tierOwner;
        bytes32 presentationHash;
    }

    State internal stateBefore;
    State internal stateAfter;

    function _takeSnapshot(
        MembershipTier target,
        uint256 tokenId,
        address primary,
        address counterparty
    ) private view returns (State memory state) {
        state.tier = address(target);
        state.tokenId = tokenId;
        state.primary = primary;
        state.counterparty = counterparty;
        state.factoryTierCount = factory.tierCount();
        state.factoryPaymentTokenCount = factory.paymentTokenCount();
        state.factoryOwner = factory.owner();

        address inspectedToken = address(paymentToken);
        if (address(target) != address(0)) inspectedToken = address(target.paymentToken());
        state.tokenListed = factory.isPaymentTokenListed(inspectedToken);
        state.tokenEnabled = factory.isPaymentTokenEnabled(inspectedToken);
        state.tokenMinimum = factory.minimumPayment(inspectedToken);

        if (address(target) == address(0)) {
            if (primary != address(0)) {
                state.primaryPaymentBalance = paymentToken.balanceOf(primary);
            }
            if (counterparty != address(0)) {
                state.counterpartyPaymentBalance = paymentToken.balanceOf(counterparty);
            }
            return state;
        }

        IERC20 targetPayment = target.paymentToken();
        if (primary != address(0)) state.primaryPaymentBalance = targetPayment.balanceOf(primary);
        if (counterparty != address(0)) {
            state.counterpartyPaymentBalance = targetPayment.balanceOf(counterparty);
            state.counterpartyTierBalance = target.balanceOf(counterparty);
        }
        state.tierPaymentBalance = targetPayment.balanceOf(address(target));
        state.vaultPaymentBalance = targetPayment.balanceOf(target.buybackVault());
        state.totalMinted = target.totalMinted();
        state.totalSupply = target.totalSupply();
        state.occupiedSupply = target.occupiedSupply();
        state.lifetimeGross = target.lifetimeGross();
        state.totalRewardShares = target.totalRewardShares();
        state.rewardPerShare = target.rewardPerShare();

        MembershipTypes.AccountingStatus memory status = target.accountingStatus();
        state.accountedThrough = status.accountedThrough;
        state.scheduledMembers = status.scheduledMembers;
        state.scheduledExpirations = status.scheduledExpirations;
        state.nextBoundary = status.nextBoundary;
        state.accountingComplete = status.complete;
        state.supplyCap = target.supplyCap();
        state.maxPrepaidPeriods = target.maxPrepaidPeriods();
        state.paused = target.paused();
        state.tierOwner = target.owner();
        state.creatorProceeds = target.creatorProceeds();
        state.protocolFeeHeld = target.protocolFeeEarnedHeld();
        if (primary != address(0)) {
            state.claimableReferral = target.claimableReferral(primary);
            (state.claimableRetiredRaw,) = target.claimableRetiredReward(primary);
        }
        state.protectedLiability = target.totalProtectedLiability();

        MembershipTypes.PaymentTotals memory totals = target.previewPaymentTotals(64);
        state.paymentTotalsHash = keccak256(abi.encode(totals));
        state.protocolPaidRaw = totals.paidRaw[3];
        state.refundedRaw = totals.refunded;
        state.presentationHash = keccak256(
            abi.encode(
                target.renderer(),
                target.artConfig(),
                target.mediaConfig(),
                target.description(),
                target.externalURI()
            )
        );

        if (primary != address(0) && counterparty != address(0)) {
            state.operatorApproval = target.isApprovedForAll(primary, counterparty);
        }
        if (tokenId == 0 || tokenId > state.totalMinted) return state;

        (state.tokenExists, state.owner) = _safeOwnerOf(target, tokenId);
        state.isOccupied = target.isOccupied(tokenId);
        state.isActive = target.isActiveToken(tokenId);
        (state.paidSeconds, state.grantSeconds, state.effectiveCheckpoint) =
            target.timeBalances(tokenId);
        state.shares = target.sharesOf(tokenId);
        state.rewardEligible = target.rewardEligible(tokenId);
        state.claimableReward = target.claimableReward(tokenId);
        (state.referralStatus, state.referrer) = target.referralOf(tokenId);
        MembershipTypes.AllocationState memory allocation = target.allocationState(tokenId);
        state.allocationGeneration = allocation.generation;
        state.allocationLotCursor = allocation.lotCursor;
        state.allocationLotCount = allocation.lotCount;
        state.refundableGross = allocation.refundableGross;

        if (state.tokenExists) {
            state.expiration = target.expiresAt(tokenId);
            state.ownerBalance = target.balanceOf(state.owner);
            state.tokenApproval = _safeGetApproved(target, tokenId);
        }
    }

    function _safeOwnerOf(MembershipTier target, uint256 tokenId)
        private
        view
        returns (bool exists, address owner_)
    {
        (bool success, bytes memory result) =
            address(target).staticcall(abi.encodeWithSelector(target.ownerOf.selector, tokenId));
        if (!success || result.length < 32) return (false, address(0));
        owner_ = abi.decode(result, (address));
        exists = owner_ != address(0);
    }

    function _safeGetApproved(MembershipTier target, uint256 tokenId)
        private
        view
        returns (address approved)
    {
        (bool success, bytes memory result) = address(target)
            .staticcall(abi.encodeWithSelector(target.getApproved.selector, tokenId));
        if (success && result.length >= 32) approved = abi.decode(result, (address));
    }

    function snapshotBefore(
        MembershipTier target,
        uint256 tokenId,
        address primary,
        address counterparty
    ) internal {
        stateBefore = _takeSnapshot(target, tokenId, primary, counterparty);
    }

    function snapshotAfter(
        MembershipTier target,
        uint256 tokenId,
        address primary,
        address counterparty
    ) internal {
        stateAfter = _takeSnapshot(target, tokenId, primary, counterparty);
    }

    function snapshotBefore() internal {
        stateBefore = _takeSnapshot(fixedTier, 0, actor, address(0));
    }

    function snapshotAfter() internal {
        stateAfter = _takeSnapshot(fixedTier, 0, actor, address(0));
    }
}
