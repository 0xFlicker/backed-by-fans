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

    /// @dev Independent lifecycle oracle: scan issued positions and absolute funding
    /// intervals, and eagerly credit every eligible position. There is no heap,
    /// reward index, lazy settlement, production ledger or ERC-721 implementation.
    /// The older single-membership helpers above remain for existing test consumers.
    struct Position {
        Lifecycle time;
        address owner;
        uint256 shares;
        uint256 creditScaled;
        bool eligible;
        bool referralLocked;
        address referrer;
        uint64 retiredAt;
    }

    struct PositionBook {
        mapping(uint256 => Position) positions;
        mapping(address => uint256) retiredCreditScaled;
        FundingBook funding;
        uint256 totalMinted;
        uint256 occupied;
        uint256 totalShares;
        uint256 lifetimeGross;
        uint256 retiredLiabilityScaled;
        uint256 paidMemberRaw;
        uint256 rewardCarry;
        uint256 distributionDust;
        uint256 unassigned;
        uint32 boostBps;
        uint112 horizon;
        uint16 protocolBps;
        uint16 rewardBps;
        uint16 referralBps;
    }

    struct PositionIncrease {
        uint64 paidSeconds;
        uint64 grantSeconds;
        uint256 gross;
        bool lockReferral;
        address referrer;
    }

    error PositionNotLive();
    error PositionOwnerMismatch();
    error InvalidPositionIncrease();
    error ModelTimeReversed();

    function createPosition(
        PositionBook storage book,
        address owner,
        uint64 timestamp,
        PositionIncrease memory increase
    ) internal returns (uint256 id) {
        if (owner == address(0)) revert PositionOwnerMismatch();
        advancePositions(book, timestamp);
        id = ++book.totalMinted;
        book.positions[id].owner = owner;
        ++book.occupied;
        _increasePosition(book, id, timestamp, increase);
    }

    function increasePosition(
        PositionBook storage book,
        uint256 id,
        uint64 timestamp,
        PositionIncrease memory increase
    ) internal {
        _requireLivePosition(book, id, timestamp);
        advancePositions(book, timestamp);
        _increasePosition(book, id, timestamp, increase);
    }

    function _increasePosition(
        PositionBook storage book,
        uint256 id,
        uint64 timestamp,
        PositionIncrease memory increase
    ) private {
        if (
            uint256(increase.paidSeconds) + increase.grantSeconds == 0
                || (increase.gross != 0 && increase.paidSeconds == 0)
        ) revert InvalidPositionIncrease();
        Position storage position = book.positions[id];
        if (increase.lockReferral) {
            if (position.referralLocked && position.referrer != increase.referrer) {
                revert InvalidPositionIncrease();
            }
            position.referralLocked = true;
            position.referrer = increase.referrer;
        }
        _prepareIncrease(position.time, timestamp);
        uint64 fundingStart = position.time.checkpoint + position.time.paidSeconds;
        position.time.paidSeconds += increase.paidSeconds;
        position.time.grantSeconds += increase.grantSeconds;
        // Check the same uint64 absolute-time domain as the external lifecycle.
        (uint256(position.time.checkpoint) + position.time.paidSeconds + position.time.grantSeconds)
        .toUint64();
        if (increase.gross == 0) return;
        uint256 issued =
            positionShares(book.lifetimeGross, increase.gross, book.boostBps, book.horizon);
        _changeDenominator(book);
        position.shares += issued;
        position.eligible = true;
        book.totalShares += issued;
        book.lifetimeGross += increase.gross;
        fund(
            book.funding,
            id,
            increase.gross,
            fundingStart,
            increase.paidSeconds,
            book.protocolBps,
            book.rewardBps,
            book.referralBps,
            position.referrer
        );
    }

    /// @dev Integrate the linear marginal boost over the gross interval using its
    /// cumulative trapezoid area. Never call the production curve implementation.
    function positionShares(uint256 cursor, uint256 gross, uint32 boostBps, uint112 horizon)
        internal
        pure
        returns (uint256)
    {
        if (gross > type(uint112).max - cursor) revert InvalidPositionIncrease();
        return _positionCumulative(cursor + gross, boostBps, horizon)
            - _positionCumulative(cursor, boostBps, horizon);
    }

    function _positionCumulative(uint256 gross, uint32 boostBps, uint112 horizon)
        private
        pure
        returns (uint256)
    {
        if (boostBps == 10_000) return gross;
        uint256 width = Math.min(gross, horizon);
        uint256 twiceArea = width * (uint256(horizon) + (uint256(horizon) - width));
        return gross + twiceArea * (boostBps - 10_000) / (20_000 * uint256(horizon));
    }

    /// @dev Caller models ERC-721 authorization separately; this models the
    /// authorized from/to movement only, with no accounting work or normalization.
    function transferPosition(
        PositionBook storage book,
        uint256 id,
        address from,
        address to,
        uint64 timestamp
    ) internal {
        _requireLivePosition(book, id, timestamp);
        if (book.positions[id].owner != from || to == address(0)) {
            revert PositionOwnerMismatch();
        }
        book.positions[id].owner = to;
    }

    /// @dev Unbounded reference operation, deliberately unlike production batches.
    /// Fixed denominators between expiration boundaries allow recognition of all
    /// funding intervals (including their END tails) before retirement at a boundary.
    function advancePositions(PositionBook storage book, uint64 through) internal {
        if (through < book.funding.accountedThrough) revert ModelTimeReversed();
        while (true) {
            uint64 next = through;
            bool retiring;
            for (uint256 id = 1; id <= book.totalMinted; ++id) {
                Position storage position = book.positions[id];
                if (position.owner == address(0)) continue;
                uint64 end = expiration(position.time);
                if (end <= next) {
                    next = end;
                    retiring = true;
                }
            }
            uint256 earnedBefore = book.funding.earnedScaled[1];
            recognize(book.funding, next);
            _distributePositions(book, book.funding.earnedScaled[1] - earnedBefore);
            if (!retiring) return;
            // Ascending IDs also define deterministic simultaneous retirement.
            for (uint256 id = 1; id <= book.totalMinted; ++id) {
                Position storage position = book.positions[id];
                if (position.owner != address(0) && expiration(position.time) == next) {
                    _retirePosition(book, id, next);
                }
            }
        }
    }

    function _distributePositions(PositionBook storage book, uint256 amount) private {
        if (book.totalShares == 0) {
            book.unassigned += amount;
            return;
        }
        uint256 available = amount + book.rewardCarry;
        uint256 perShare = available / book.totalShares;
        book.rewardCarry = available % book.totalShares;
        for (uint256 id = 1; id <= book.totalMinted; ++id) {
            Position storage position = book.positions[id];
            // Historical eligibility survives wall-clock expiry until retirement.
            if (position.eligible) position.creditScaled += perShare * position.shares;
        }
    }

    function revokePositionGrant(PositionBook storage book, uint256 id, uint64 timestamp) internal {
        _requireLivePosition(book, id, timestamp);
        advancePositions(book, timestamp);
        revokeGrantTime(book.positions[id].time, timestamp);
        if (!active(book.positions[id].time, timestamp)) _retirePosition(book, id, timestamp);
    }

    function refundPosition(PositionBook storage book, uint256 id, uint64 timestamp)
        internal
        returns (uint256 gross)
    {
        _requireLivePosition(book, id, timestamp);
        advancePositions(book, timestamp);
        gross = cancel(book.funding, id);
        _retirePosition(book, id, timestamp);
    }

    function _retirePosition(PositionBook storage book, uint256 id, uint64 timestamp) private {
        Position storage position = book.positions[id];
        assert(position.owner != address(0));
        book.retiredCreditScaled[position.owner] += position.creditScaled;
        book.retiredLiabilityScaled += position.creditScaled;
        if (position.eligible && position.shares != 0) {
            _changeDenominator(book);
            book.totalShares -= position.shares;
        }
        delete book.positions[id];
        book.positions[id].retiredAt = timestamp;
        --book.occupied;
    }

    function _changeDenominator(PositionBook storage book) private {
        book.distributionDust += book.rewardCarry;
        book.rewardCarry = 0;
    }

    function _requireLivePosition(PositionBook storage book, uint256 id, uint64 timestamp)
        private
        view
    {
        if (book.positions[id].owner == address(0) || !active(book.positions[id].time, timestamp)) {
            revert PositionNotLive();
        }
    }

    function claimPositionCredit(
        PositionBook storage book,
        uint256 id,
        address owner,
        uint64 timestamp
    ) internal returns (uint256 amount) {
        if (book.positions[id].owner != owner || owner == address(0)) {
            revert PositionOwnerMismatch();
        }
        advancePositions(book, timestamp);
        if (book.positions[id].owner == address(0)) return claimRetiredPositionCredit(book, owner);
        amount = book.positions[id].creditScaled / ACCOUNTING_SCALE;
        book.positions[id].creditScaled -= amount * ACCOUNTING_SCALE;
        book.paidMemberRaw += amount;
    }

    function claimRetiredPositionCredit(PositionBook storage book, address owner)
        internal
        returns (uint256 amount)
    {
        amount = book.retiredCreditScaled[owner] / ACCOUNTING_SCALE;
        book.retiredCreditScaled[owner] -= amount * ACCOUNTING_SCALE;
        book.retiredLiabilityScaled -= amount * ACCOUNTING_SCALE;
        book.paidMemberRaw += amount;
    }

    function memberLiabilityScaled(PositionBook storage book) internal view returns (uint256 sum) {
        sum = book.retiredLiabilityScaled;
        for (uint256 id = 1; id <= book.totalMinted; ++id) {
            sum += book.positions[id].creditScaled;
        }
    }

    function accountedRewardScaled(PositionBook storage book) internal view returns (uint256) {
        return memberLiabilityScaled(book) + book.paidMemberRaw * ACCOUNTING_SCALE
            + book.rewardCarry + book.distributionDust + book.unassigned;
    }

    /// @dev All original cash remains in earned/payout, unearned, cancellation or
    /// refund buckets. Member earnings include credit, carry, dust and unassigned.
    function accountedCashScaled(PositionBook storage book) internal view returns (uint256 sum) {
        sum = accountedRewardScaled(book);
        for (uint256 p; p < 4; ++p) {
            sum += book.funding.unearnedScaled[p] + book.funding.cancellationScaled[p]
            + book.funding.refundedScaled[p];
            if (p != 1) sum += book.funding.earnedScaled[p];
        }
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
