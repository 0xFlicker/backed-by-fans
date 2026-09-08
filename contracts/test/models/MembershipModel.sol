// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Slow reference arithmetic for membership time and refund tests.
library MembershipModel {
    using SafeCast for uint256;

    uint256 internal constant REWARD_SCALE = 1e27;

    struct FeeLot {
        uint256 gross;
        uint256 fee;
        uint256 duration;
    }

    struct FeeSchedule {
        FeeLot[] lots;
        uint256 consumed;
        uint256 recognized;
        uint256 generation;
        uint256 lifetimeAllocated;
        uint256 lifetimeEarned;
        uint256 refunded;
        uint256 rounding;
    }

    struct FeeBook {
        mapping(uint256 => FeeSchedule) schedules;
        uint256 allocated;
        uint256 held;
        uint256 earnedHeld;
        uint256 released;
        uint256 refunded;
        uint256 rounding;
    }

    function allocateFee(
        FeeBook storage book,
        uint256 id,
        uint256 gross,
        uint256 rate,
        uint256 duration
    ) internal {
        uint256 fee = Math.mulDiv(gross, rate, 10_000);
        book.schedules[id].lots.push(FeeLot(gross, fee, duration));
        book.schedules[id].lifetimeAllocated += fee;
        book.allocated += fee;
        book.held += fee;
    }

    function recognizeFee(FeeBook storage book, uint256 id, uint256 consumed) internal {
        FeeSchedule storage schedule = book.schedules[id];
        schedule.consumed += consumed;
        (, uint256 earned,) = feeEntitlement(schedule.lots, schedule.consumed);
        uint256 delta = earned - schedule.recognized;
        schedule.recognized = earned;
        schedule.lifetimeEarned += delta;
        book.earnedHeld += delta;
    }

    function cancelFee(FeeBook storage book, uint256 id, uint256 grossRefund)
        internal
        returns (uint256 contribution)
    {
        FeeSchedule storage schedule = book.schedules[id];
        (uint256 allocated, uint256 earned,) = feeEntitlement(schedule.lots, schedule.consumed);
        contribution = Math.min(allocated - earned, grossRefund);
        uint256 rounding = allocated - earned - contribution;
        assert(rounding <= 1);
        book.held -= contribution;
        book.refunded += contribution;
        book.earnedHeld += rounding;
        book.rounding += rounding;
        schedule.refunded += contribution;
        schedule.rounding += rounding;
        schedule.consumed = 0;
        schedule.recognized = 0;
        ++schedule.generation;
        // Deliberately slow reference cleanup; production must use logical generations.
        delete schedule.lots;
    }

    function releaseFees(FeeBook storage book) internal returns (uint256 released) {
        released = book.earnedHeld;
        book.held -= released;
        book.released += released;
        book.earnedHeld = 0;
    }

    /// @dev Traverses every purchase without production prefixes or checkpoint indices.
    function feeEntitlement(FeeLot[] memory lots, uint256 paidConsumed)
        internal
        pure
        returns (uint256 allocated, uint256 earned, uint256 grossRefund)
    {
        for (uint256 i; i < lots.length; ++i) {
            FeeLot memory lot = lots[i];
            uint256 consumed = Math.min(paidConsumed, lot.duration);
            allocated += lot.fee;
            earned += Math.mulDiv(lot.fee, consumed, lot.duration);
            grossRefund += Math.mulDiv(lot.gross, lot.duration - consumed, lot.duration);
            paidConsumed -= consumed;
        }
    }

    function refundFunding(uint256 unearned, uint256 gross, uint256 creator)
        internal
        pure
        returns (uint256 protocol, uint256 creatorUsed, uint256 topUp, uint256 rounding)
    {
        protocol = Math.min(unearned, gross);
        creatorUsed = Math.min(creator, gross - protocol);
        topUp = gross - protocol - creatorUsed;
        rounding = unearned - protocol;
    }

    /// @dev Intentionally straightforward lifecycle oracle. It eagerly checkpoints each model
    ///      action instead of sharing any production implementation or storage representation.
    struct Lifecycle {
        uint64 paidSeconds;
        uint64 grantSeconds;
        uint64 checkpoint;
        bool occupied;
        bool initialized;
    }

    /// @dev Slow payment oracle. Reward allocation is applied eagerly to every issued token,
    ///      rather than using the production cumulative-index/debt representation.
    struct PaymentBook {
        address paymentToken;
        uint256 creatorProceeds;
        uint256 rewardReserve;
        uint256 totalReferralLiability;
        uint256 totalRewardShares;
        uint256 tokenCount;
        mapping(uint256 tokenId => uint256 shares) shares;
        mapping(uint256 tokenId => bool eligible) rewardEligible;
        mapping(uint256 tokenId => uint256 scaledReward) scaledRewards;
        mapping(uint256 tokenId => uint256 wholeCredit) rewardCredits;
        mapping(address referrer => uint256 amount) referralCredits;
    }

    error PaymentTokenMismatch(address expected, address actual);

    function initialize(PaymentBook storage book, address paymentToken) internal {
        address existing = book.paymentToken;
        if (existing != address(0) && existing != paymentToken) {
            revert PaymentTokenMismatch(existing, paymentToken);
        }
        book.paymentToken = paymentToken;
    }

    function addPaidTime(Lifecycle storage state, uint64 timestamp, uint64 duration) internal {
        _prepareIncrease(state, timestamp);
        state.paidSeconds += duration;
    }

    function addGrantTime(Lifecycle storage state, uint64 timestamp, uint64 duration) internal {
        _prepareIncrease(state, timestamp);
        state.grantSeconds += duration;
    }

    function revokeGrantTime(Lifecycle storage state, uint64 timestamp) internal {
        checkpoint(state, timestamp);
        state.grantSeconds = 0;
    }

    function refundTime(Lifecycle storage state, uint64 timestamp) internal {
        checkpoint(state, timestamp);
        state.paidSeconds = 0;
        state.grantSeconds = 0;
    }

    function synchronize(Lifecycle storage state, uint64 timestamp)
        internal
        returns (bool released)
    {
        if (!state.occupied || active(state, timestamp)) return false;
        checkpoint(state, timestamp);
        state.occupied = false;
        return true;
    }

    function checkpoint(Lifecycle storage state, uint64 timestamp) internal {
        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            projected(state, timestamp);
        state.paidSeconds = paidSeconds;
        state.grantSeconds = grantSeconds;
        state.checkpoint = effectiveCheckpoint;
    }

    function projected(Lifecycle storage state, uint64 timestamp)
        internal
        view
        returns (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint)
    {
        paidSeconds = state.paidSeconds;
        grantSeconds = state.grantSeconds;
        effectiveCheckpoint = state.checkpoint;
        if (
            !state.initialized || timestamp <= state.checkpoint || paidSeconds == 0
                && grantSeconds == 0
        ) return (paidSeconds, grantSeconds, effectiveCheckpoint);

        uint256 elapsed = uint256(timestamp) - state.checkpoint;
        uint256 purchased = paidSeconds;
        if (elapsed < purchased) {
            paidSeconds = (purchased - elapsed).toUint64();
            return (paidSeconds, grantSeconds, timestamp);
        }

        paidSeconds = 0;
        elapsed -= purchased;
        if (elapsed < grantSeconds) {
            grantSeconds = (uint256(grantSeconds) - elapsed).toUint64();
            return (paidSeconds, grantSeconds, timestamp);
        }

        grantSeconds = 0;
        effectiveCheckpoint = expiration(state);
    }

    function expiration(Lifecycle storage state) internal view returns (uint64) {
        return uint64(uint256(state.checkpoint) + state.paidSeconds + state.grantSeconds);
    }

    function active(Lifecycle storage state, uint64 timestamp) internal view returns (bool) {
        return state.initialized && timestamp < expiration(state);
    }

    function applyPayment(
        PaymentBook storage book,
        address paymentToken,
        uint256 tokenId,
        uint256 gross,
        uint16 protocolFeeBps,
        uint16 rewardBps,
        uint16 referralBps,
        address referrer
    ) internal {
        if (book.paymentToken != paymentToken) {
            revert PaymentTokenMismatch(book.paymentToken, paymentToken);
        }
        uint256 protocolFee = Math.mulDiv(gross, protocolFeeBps, 10_000);
        uint256 reward = Math.mulDiv(gross, rewardBps, 10_000);
        uint256 referral = referrer == address(0) ? 0 : Math.mulDiv(gross, referralBps, 10_000);
        uint256 creator = gross - protocolFee - reward - referral;

        if (book.shares[tokenId] == 0) ++book.tokenCount;
        activateRewards(book, tokenId);
        book.shares[tokenId] += gross;
        book.totalRewardShares += gross;
        book.creatorProceeds += creator;
        book.rewardReserve += reward;
        if (referral != 0) {
            book.referralCredits[referrer] += referral;
            book.totalReferralLiability += referral;
        }

        if (reward == 0) return;
        uint256 indexIncrease = Math.mulDiv(reward, REWARD_SCALE, book.totalRewardShares);
        for (uint256 currentTokenId = 1; currentTokenId <= book.tokenCount; ++currentTokenId) {
            if (book.rewardEligible[currentTokenId]) {
                book.scaledRewards[currentTokenId] += book.shares[currentTokenId] * indexIncrease;
            }
        }
        book.rewardCredits[tokenId] += mulmod(reward, REWARD_SCALE, book.totalRewardShares)
        / REWARD_SCALE;
    }

    function activateRewards(PaymentBook storage book, uint256 tokenId) internal {
        if (book.rewardEligible[tokenId]) return;
        book.rewardEligible[tokenId] = true;
        book.totalRewardShares += book.shares[tokenId];
    }

    function deactivateRewards(PaymentBook storage book, uint256 tokenId) internal {
        if (!book.rewardEligible[tokenId]) return;
        book.rewardEligible[tokenId] = false;
        book.totalRewardShares -= book.shares[tokenId];
    }

    function claimableReward(PaymentBook storage book, uint256 tokenId)
        internal
        view
        returns (uint256)
    {
        return book.rewardCredits[tokenId] + book.scaledRewards[tokenId] / REWARD_SCALE;
    }

    function claimReward(PaymentBook storage book, uint256 tokenId)
        internal
        returns (uint256 amount)
    {
        amount = claimableReward(book, tokenId);
        book.rewardCredits[tokenId] = 0;
        book.scaledRewards[tokenId] %= REWARD_SCALE;
        book.rewardReserve -= amount;
    }

    function claimReferral(PaymentBook storage book, address referrer)
        internal
        returns (uint256 amount)
    {
        amount = book.referralCredits[referrer];
        book.referralCredits[referrer] = 0;
        book.totalReferralLiability -= amount;
    }

    function withdrawCreatorProceeds(PaymentBook storage book) internal returns (uint256 amount) {
        amount = book.creatorProceeds;
        book.creatorProceeds = 0;
    }

    function applyRefund(PaymentBook storage book, uint256 grossRefund)
        internal
        returns (uint256 ownerTopUp)
    {
        if (grossRefund > book.creatorProceeds) {
            ownerTopUp = grossRefund - book.creatorProceeds;
        }
        book.creatorProceeds -= grossRefund - ownerTopUp;
    }

    function _prepareIncrease(Lifecycle storage state, uint64 timestamp) private {
        if (!state.initialized) {
            state.initialized = true;
            state.occupied = true;
            state.checkpoint = timestamp;
            return;
        }

        checkpoint(state, timestamp);
        if (state.paidSeconds == 0 && state.grantSeconds == 0 && state.checkpoint < timestamp) {
            state.checkpoint = timestamp;
        }
        state.occupied = true;
    }

    function variableRefund(
        uint256[] memory grossLots,
        uint64 periodDuration,
        uint256 paidSecondsConsumed
    ) internal pure returns (uint256 refund) {
        uint256 remainingConsumption = paidSecondsConsumed;
        for (uint256 i; i < grossLots.length; ++i) {
            if (remainingConsumption >= periodDuration) {
                remainingConsumption -= periodDuration;
                continue;
            }

            uint256 remainingSeconds = periodDuration - remainingConsumption;
            refund += Math.mulDiv(grossLots[i], remainingSeconds, periodDuration);
            remainingConsumption = 0;
        }
    }

    function fixedRefund(uint256 paidSeconds, uint256 pricePerPeriod, uint64 periodDuration)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(paidSeconds, pricePerPeriod, periodDuration);
    }
}
