// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Slow reference arithmetic for membership time and refund tests.
library MembershipModel {
    using SafeCast for uint256;

    uint256 internal constant ACCOUNTING_SCALE = 1 << 128;

    /// @dev Slow absolute-interval oracle. It scans all lots and never uses a heap,
    /// generation prefix, member index or production accounting library.
    struct FundingLot {
        uint256 gross;
        uint64 start;
        uint64 end;
        uint256[4] amounts;
        uint256[4] recognizedScaled;
        address referrer;
        bool canceled;
    }

    struct FundingBook {
        mapping(uint256 => FundingLot[]) lots;
        mapping(uint256 => uint256) generation;
        mapping(address => uint256) referralEarnedScaled;
        uint256 tokenCount;
        uint64 accountedThrough;
        uint256[4] allocatedScaled;
        uint256[4] earnedScaled;
        uint256[4] unearnedScaled;
        uint256[4] cancellationScaled;
        uint256[4] refundedScaled;
    }

    function fund(
        FundingBook storage book,
        uint256 id,
        uint256 gross,
        uint64 start,
        uint64 duration,
        uint16 protocolBps,
        uint16 rewardBps,
        uint16 referralBps,
        address referrer
    ) internal {
        if (id > book.tokenCount) book.tokenCount = id;
        FundingLot memory lot;
        lot.gross = gross;
        lot.start = start;
        lot.end = start + duration;
        lot.referrer = referrer;
        lot.amounts[1] = gross * rewardBps / 10_000;
        lot.amounts[2] = referrer == address(0) ? 0 : gross * referralBps / 10_000;
        lot.amounts[3] = gross * protocolBps / 10_000;
        lot.amounts[0] = gross - lot.amounts[1] - lot.amounts[2] - lot.amounts[3];
        book.lots[id].push(lot);
        for (uint256 p; p < 4; ++p) {
            book.allocatedScaled[p] += lot.amounts[p] * ACCOUNTING_SCALE;
            book.unearnedScaled[p] += lot.amounts[p] * ACCOUNTING_SCALE;
        }
    }

    /// @dev Called after fully drained accounting; partial END checkpoints have
    /// separate scheduler tests and are not approximated by this interval oracle.
    function recognize(FundingBook storage book, uint64 through) internal {
        for (uint256 id = 1; id <= book.tokenCount; ++id) {
            FundingLot[] storage lots = book.lots[id];
            for (uint256 i; i < lots.length; ++i) {
                FundingLot storage lot = lots[i];
                if (lot.canceled) continue;
                for (uint256 p; p < 4; ++p) {
                    uint256 scaled = lot.amounts[p] * ACCOUNTING_SCALE;
                    uint256 earned = through >= lot.end
                        ? scaled
                        : through <= lot.start
                            ? 0
                            : scaled / (lot.end - lot.start) * (through - lot.start);
                    uint256 delta = earned - lot.recognizedScaled[p];
                    lot.recognizedScaled[p] = earned;
                    book.earnedScaled[p] += delta;
                    book.unearnedScaled[p] -= delta;
                    if (p == 2) book.referralEarnedScaled[lot.referrer] += delta;
                }
            }
        }
        book.accountedThrough = through;
    }

    function unusedGross(FundingBook storage book, uint256 id, uint64 timestamp)
        internal
        view
        returns (uint256 gross)
    {
        FundingLot[] storage lots = book.lots[id];
        for (uint256 i; i < lots.length; ++i) {
            FundingLot storage lot = lots[i];
            if (lot.canceled || timestamp >= lot.end) continue;
            gross += timestamp <= lot.start
                ? lot.gross
                : lot.gross * (lot.end - timestamp) / (lot.end - lot.start);
        }
    }

    function cancel(FundingBook storage book, uint256 id) internal returns (uint256 gross) {
        gross = unusedGross(book, id, book.accountedThrough);
        FundingLot[] storage lots = book.lots[id];
        uint256[4] memory unearned;
        for (uint256 i; i < lots.length; ++i) {
            FundingLot storage lot = lots[i];
            if (lot.canceled) continue;
            for (uint256 p; p < 4; ++p) {
                unearned[p] += lot.amounts[p] * ACCOUNTING_SCALE - lot.recognizedScaled[p];
            }
            lot.canceled = true;
        }
        uint256 remaining = gross * ACCOUNTING_SCALE;
        for (uint256 p; p < 4; ++p) {
            uint256 taken = Math.min(remaining, unearned[p]);
            book.refundedScaled[p] += taken;
            book.cancellationScaled[p] += unearned[p] - taken;
            book.unearnedScaled[p] -= unearned[p];
            remaining -= taken;
        }
        assert(remaining == 0);
        ++book.generation[id];
    }

    function currentRates(FundingBook storage book)
        internal
        view
        returns (uint256[4] memory rates)
    {
        for (uint256 id = 1; id <= book.tokenCount; ++id) {
            FundingLot[] storage lots = book.lots[id];
            for (uint256 i; i < lots.length; ++i) {
                FundingLot storage lot = lots[i];
                if (
                    lot.canceled || book.accountedThrough < lot.start
                        || book.accountedThrough >= lot.end
                ) continue;
                for (uint256 p; p < 4; ++p) {
                    rates[p] += lot.amounts[p] * ACCOUNTING_SCALE / (lot.end - lot.start);
                }
            }
        }
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
