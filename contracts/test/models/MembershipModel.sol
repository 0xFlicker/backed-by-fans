// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Slow reference arithmetic for membership time and refund tests.
library MembershipModel {
    using SafeCast for uint256;

    uint256 internal constant REWARD_SCALE = 1e27;

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
        uint256 protocolProceeds;
        uint256 rewardReserve;
        uint256 totalReferralLiability;
        uint256 totalShares;
        uint256 tokenCount;
        mapping(uint256 tokenId => uint256 shares) shares;
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
        book.shares[tokenId] += gross;
        book.totalShares += gross;
        book.creatorProceeds += creator;
        book.protocolProceeds += protocolFee;
        book.rewardReserve += reward;
        if (referral != 0) {
            book.referralCredits[referrer] += referral;
            book.totalReferralLiability += referral;
        }

        if (reward == 0) return;
        uint256 indexIncrease = Math.mulDiv(reward, REWARD_SCALE, book.totalShares);
        for (uint256 currentTokenId = 1; currentTokenId <= book.tokenCount; ++currentTokenId) {
            book.scaledRewards[currentTokenId] += book.shares[currentTokenId] * indexIncrease;
        }
        book.rewardCredits[tokenId] += mulmod(reward, REWARD_SCALE, book.totalShares) / REWARD_SCALE;
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

    function withdrawProtocolProceeds(PaymentBook storage book) internal returns (uint256 amount) {
        amount = book.protocolProceeds;
        book.protocolProceeds = 0;
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
