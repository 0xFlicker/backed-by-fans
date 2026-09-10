// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../types/MembershipTypes.sol";
import {RewardCurve} from "./RewardCurve.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Immutable linked accounting on the calling tier's designated storage.
/// @dev No custody, owner, upgrade target or arbitrary execution. The tier owns
/// authorization, actual-clock catch-up, membership identity and token transfers.
library VestingLedger {
    using SafeCast for uint256;

    uint256 internal constant SCALE = 1 << 128;
    uint256 internal constant MAX_GROSS = type(uint112).max;
    uint256 internal constant PURPOSES = 4;
    uint256 internal constant MAX_STEPS = 25;

    struct Lot {
        uint64 start;
        uint64 end;
        address referrer;
        uint256 gross;
        uint256[4] amounts;
        uint256 grossPrefix;
        uint256[4] allocationPrefix;
    }

    struct FundingAccount {
        uint256 generation;
        uint256 head;
        bool active;
    }

    struct Node {
        uint256 tokenId;
        uint256 generation;
        uint256 lotIndex;
        uint64 timestamp;
        bool isStart;
    }

    struct MemberAccount {
        uint256 shares;
        uint256 index;
        uint256 creditScaled;
        bool eligible;
    }

    struct ReferrerAccount {
        uint256 rate;
        uint256 creditScaled;
        uint64 accountedThrough;
    }

    struct ProcessResult {
        uint256 processed;
        uint64 accountedThrough;
        bool complete;
        uint256 earnedScaled;
    }

    struct State {
        bool initialized;
        uint64 accountedThrough;
        uint256 totalGross;
        // Order: creator, member rewards, original referral, protocol buybacks.
        uint256[4] unearnedScaled;
        // Beneficiary liabilities only: excludes carry, dust and unassigned funding.
        uint256[4] earnedScaled;
        uint256[4] cancellationScaled;
        uint256[4] activeRates;
        uint256[4] paidRaw;
        uint256 refundedRaw;
        mapping(uint256 => FundingAccount) funding;
        mapping(uint256 => mapping(uint256 => Lot[])) lots;
        Node[] heap;
        mapping(uint256 => uint256) heapPosition; // one-based; zero means absent
        mapping(address => ReferrerAccount) referrers;
        mapping(uint256 => MemberAccount) members;
        uint256 totalShares;
        uint256 rewardPerShare;
        uint256 rewardCarry;
        uint256 distributionDust;
        uint256 unassigned;
    }

    error InvalidFunding();
    error InvalidPurpose();
    error InvalidAccountingSteps();
    error InvalidAllocationPageSize();
    error AccountingInvariant();

    event FundingLotScheduled(
        uint256 indexed tokenId,
        uint256 indexed generation,
        uint256 lotIndex,
        uint64 start,
        uint64 end,
        uint256 gross,
        uint256 creatorAmount,
        uint256 memberAmount,
        uint256 referralAmount,
        uint256 protocolAmount,
        address referrer
    );
    event FundingLotCompleted(
        uint256 indexed tokenId, uint256 indexed generation, uint256 lotIndex, uint64 end
    );

    function validateCurve(uint32 boost, uint112 horizon, uint256 price) external pure {
        RewardCurve.validate(boost, horizon, price);
    }

    function quoteShares(uint112 cursor, uint256 gross, uint32 boost, uint112 horizon)
        external
        pure
        returns (uint256 shares)
    {
        return RewardCurve.quote(cursor, gross, boost, horizon);
    }

    function initialize(State storage self, uint64 timestamp) external {
        if (self.initialized) revert AccountingInvariant();
        self.initialized = true;
        self.accountedThrough = timestamp;
    }

    function liabilityScaled(State storage self) external view returns (uint256 result) {
        result = self.rewardCarry + self.distributionDust + self.unassigned;
        for (uint256 i; i < PURPOSES; ++i) {
            result += self.earnedScaled[i] + self.unearnedScaled[i] + self.cancellationScaled[i];
        }
    }

    /// @dev Compiler-encoded typed values avoid duplicate tuple/array codecs in
    /// each tier, keeping creator deployment within its 7.5M gas budget. The tier
    /// returns these bytes unchanged; no user-supplied selector or data is executed.
    function encodedAllocationState(State storage self, uint256 tokenId, uint64 now_)
        external
        view
        returns (bytes memory)
    {
        MembershipTypes.AllocationState memory result = _allocationSnapshot(self, tokenId);
        result.status = _status(self, now_);
        return abi.encode(result);
    }

    function _allocationSnapshot(State storage self, uint256 tokenId)
        private
        view
        returns (MembershipTypes.AllocationState memory result)
    {
        FundingAccount storage account = self.funding[tokenId];
        Lot[] storage queue = self.lots[tokenId][account.generation];
        result.generation = account.generation;
        result.lotCursor = account.head;
        result.lotCount = queue.length;
        if (queue.length == 0) return result;
        Lot storage last = queue[queue.length - 1];
        for (uint256 i; i < PURPOSES; ++i) {
            result.allocatedScaled[i] = last.allocationPrefix[i] * SCALE;
            result.earnedScaled[i] =
                account.head == 0 ? 0 : queue[account.head - 1].allocationPrefix[i] * SCALE;
            if (account.active) {
                result.earnedScaled[
                    i
                ] += _activeEarnedAt(queue[account.head], i, self.accountedThrough);
            }
            result.unearnedScaled[i] = result.allocatedScaled[i] - result.earnedScaled[i];
        }
        (result.refundableGross,,) = _cancellation(self, tokenId, self.accountedThrough);
    }

    function encodedLots(
        State storage self,
        uint256 tokenId,
        uint256 generation,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes memory) {
        if (limit == 0 || limit > 100) revert InvalidAllocationPageSize();
        Lot[] storage queue = self.lots[tokenId][generation];
        uint256 count = offset >= queue.length ? 0 : Math.min(limit, queue.length - offset);
        MembershipTypes.AllocationLot[] memory page = new MembershipTypes.AllocationLot[](count);
        for (uint256 i; i < count; ++i) {
            Lot storage lot = queue[offset + i];
            page[i] = MembershipTypes.AllocationLot(
                lot.start,
                lot.end,
                lot.gross,
                lot.amounts,
                lot.referrer,
                generation != self.funding[tokenId].generation
            );
        }
        return abi.encode(page);
    }

    function encodedBalances(State storage self, uint256 tokenId, address referrer, uint64 now_)
        external
        view
        returns (bytes memory)
    {
        MembershipTypes.EarnedBalances memory result;
        MemberAccount storage member = self.members[tokenId];
        ReferrerAccount storage referral = self.referrers[referrer];
        uint256[4] memory scaled = [
            self.earnedScaled[0],
            member.creditScaled
                + (member.eligible ? member.shares * (self.rewardPerShare - member.index) : 0),
            referral.creditScaled + referral.rate
                * (self.accountedThrough - referral.accountedThrough),
            self.earnedScaled[3]
        ];
        result.creator = scaled[0] / SCALE;
        result.member = scaled[1] / SCALE;
        result.referral = scaled[2] / SCALE;
        result.protocol = scaled[3] / SCALE;
        for (uint256 i; i < PURPOSES; ++i) {
            result.fractionalScaled[i] = scaled[i] % SCALE;
        }
        result.status = _status(self, now_);
        return abi.encode(result);
    }

    function encodedReserves(State storage self, uint64 now_) external view returns (bytes memory) {
        return abi.encode(
            MembershipTypes.ReserveState(
                self.unearnedScaled,
                self.cancellationScaled,
                self.unassigned,
                self.distributionDust,
                self.rewardCarry,
                _status(self, now_)
            )
        );
    }

    function encodedRefund(
        State storage self,
        uint256 tokenId,
        address recipient,
        uint64 paidSeconds,
        uint64 grantSeconds,
        uint64 now_
    ) external view returns (bytes memory) {
        MembershipTypes.RefundPreview memory result;
        result.recipient = recipient;
        result.paidSeconds = paidSeconds;
        result.grantSeconds = grantSeconds;
        result.accessAsOf = now_;
        result.accountingAsOf = self.accountedThrough;
        result.generation = self.funding[tokenId].generation;
        result.complete = _status(self, now_).complete;
        // Before the next global boundary the active set and head/prefixes are
        // unchanged. Project just this refund, without settling or scanning.
        result.projected = !result.complete && now_ >= self.accountedThrough
            && (self.heap.length == 0 || self.heap[0].timestamp > now_);
        result.fundingAsOf = result.projected ? now_ : self.accountedThrough;
        (result.grossRefund, result.fundingScaled, result.cancellationScaled) =
            _cancellation(self, tokenId, result.fundingAsOf);
        return abi.encode(result);
    }

    function _status(State storage self, uint64 now_)
        private
        view
        returns (MembershipTypes.AccountingStatus memory result)
    {
        result.accountedThrough = self.accountedThrough;
        result.scheduledMembers = self.heap.length;
        result.nextBoundary = self.heap.length == 0 ? 0 : self.heap[0].timestamp;
        result.complete = result.accountedThrough == now_
            && (result.nextBoundary == 0 || result.nextBoundary > now_);
    }

    /// @notice Append in constant work; only a previously empty live queue changes the heap.
    function append(
        State storage self,
        uint256 tokenId,
        uint256[4] memory amounts,
        uint64 start,
        uint64 duration,
        address referrer
    ) external {
        _requireFinalized(self);
        if (
            tokenId == 0 || duration == 0 || start < self.accountedThrough
                || (amounts[2] != 0 && referrer == address(0))
        ) revert InvalidFunding();
        uint256 gross;
        for (uint256 i; i < PURPOSES; ++i) {
            if (amounts[i] > MAX_GROSS) revert InvalidFunding();
            gross += amounts[i];
        }
        if (gross == 0 || gross > MAX_GROSS - self.totalGross) revert InvalidFunding();
        FundingAccount storage account = self.funding[tokenId];
        Lot[] storage queue = self.lots[tokenId][account.generation];
        uint256 index = queue.length;
        if (index != 0 && start < queue[index - 1].end) revert InvalidFunding();
        Lot storage lot = queue.push();
        lot.start = start;
        lot.end = (uint256(start) + duration).toUint64();
        lot.referrer = referrer;
        lot.gross = gross;
        lot.amounts = amounts;
        lot.grossPrefix = gross + (index == 0 ? 0 : queue[index - 1].grossPrefix);
        for (uint256 i; i < PURPOSES; ++i) {
            lot.allocationPrefix[i] =
                amounts[i] + (index == 0 ? 0 : queue[index - 1].allocationPrefix[i]);
            self.unearnedScaled[i] += amounts[i] * SCALE;
        }
        self.totalGross += gross;
        if (account.head == index) _scheduleHead(self, tokenId);
        _emitScheduled(tokenId, account.generation, index, lot);
    }

    function process(State storage self, uint64 through, uint256 maxSteps)
        external
        returns (ProcessResult memory result)
    {
        if (maxSteps == 0 || maxSteps > MAX_STEPS) revert InvalidAccountingSteps();
        if (!self.initialized || through < self.accountedThrough) revert AccountingInvariant();
        while (
            result.processed < maxSteps && self.heap.length != 0
                && self.heap[0].timestamp <= through
        ) {
            Node memory node = self.heap[0];
            result.earnedScaled += _integrate(self, node.timestamp);
            _removeNode(self, 0);
            FundingAccount storage account = self.funding[node.tokenId];
            if (
                account.generation != node.generation || account.head != node.lotIndex
                    || account.active == node.isStart
            ) revert AccountingInvariant();
            if (node.isStart) {
                _scheduleHead(self, node.tokenId);
            } else {
                Lot storage lot = self.lots[node.tokenId][node.generation][node.lotIndex];
                result.earnedScaled += _finish(self, lot);
                account.active = false;
                ++account.head;
                emit FundingLotCompleted(
                    node.tokenId, node.generation, node.lotIndex, node.timestamp
                );
                _scheduleHead(self, node.tokenId);
            }
            ++result.processed;
        }
        result.complete = self.heap.length == 0 || self.heap[0].timestamp > through;
        if (result.complete) result.earnedScaled += _integrate(self, through);
        result.accountedThrough = self.accountedThrough;
    }

    /// @notice Permanent shares may grow; suspension only removes their eligible weight.
    function setWeight(State storage self, uint256 tokenId, uint256 shares, bool eligible)
        external
    {
        _setWeight(self, tokenId, shares, eligible);
    }

    /// @notice Issue at the live gross cursor and restore the member's permanent weight.
    function issueShares(
        State storage self,
        uint256 tokenId,
        uint256 gross,
        uint32 boost,
        uint112 horizon
    ) external returns (uint256 issued, uint256 shares) {
        issued = RewardCurve.quote(self.totalGross.toUint112(), gross, boost, horizon);
        shares = self.members[tokenId].shares + issued;
        _setWeight(self, tokenId, shares, true);
    }

    function _setWeight(State storage self, uint256 tokenId, uint256 shares, bool eligible)
        private
    {
        _requireFinalized(self);
        MemberAccount storage member = self.members[tokenId];
        if (shares < member.shares || shares > 10 * MAX_GROSS) revert AccountingInvariant();
        _settleMember(self, member);
        uint256 previous = member.eligible ? member.shares : 0;
        uint256 next = eligible ? shares : 0;
        if (previous != next) {
            self.distributionDust += self.rewardCarry;
            self.rewardCarry = 0;
            self.totalShares = self.totalShares - previous + next;
            if (self.totalShares > 10 * MAX_GROSS) revert AccountingInvariant();
        }
        member.shares = shares;
        member.eligible = eligible;
    }

    function memberCredit(State storage self, uint256 tokenId) external view returns (uint256) {
        MemberAccount storage member = self.members[tokenId];
        return member.creditScaled
            + (member.eligible ? member.shares * (self.rewardPerShare - member.index) : 0);
    }

    function referrerCredit(State storage self, address referrer) external view returns (uint256) {
        ReferrerAccount storage account = self.referrers[referrer];
        return
            account.creditScaled + account.rate * (self.accountedThrough - account.accountedThrough);
    }

    function takeMember(State storage self, uint256 tokenId) external returns (uint256 amount) {
        MemberAccount storage member = self.members[tokenId];
        _settleMember(self, member);
        amount = member.creditScaled / SCALE;
        member.creditScaled -= amount * SCALE;
        _debit(self, 1, amount);
    }

    function takeReferrer(State storage self, address referrer) external returns (uint256 amount) {
        _settleReferrer(self, referrer);
        ReferrerAccount storage account = self.referrers[referrer];
        amount = account.creditScaled / SCALE;
        account.creditScaled -= amount * SCALE;
        _debit(self, 2, amount);
    }

    /// @notice Caller authorizes the current creator or the tier's fixed protocol vault.
    function takeEarned(State storage self, uint256 purpose, uint256 maximum)
        external
        returns (uint256 amount)
    {
        if (purpose != 0 && purpose != 3) revert InvalidPurpose();
        amount = Math.min(self.earnedScaled[purpose] / SCALE, maximum);
        _debit(self, purpose, amount);
    }

    function previewCancellation(State storage self, uint256 tokenId)
        external
        view
        returns (uint256 gross, uint256[4] memory funded, uint256[4] memory residues)
    {
        return _cancellation(self, tokenId, self.accountedThrough);
    }

    /// @notice Cancel one live generation using two prefixes and at most one active head.
    function cancelFunding(State storage self, uint256 tokenId)
        external
        returns (uint256 gross, uint256[4] memory funded, uint256[4] memory residues)
    {
        _requireFinalized(self);
        (gross, funded, residues) = _cancellation(self, tokenId, self.accountedThrough);
        FundingAccount storage account = self.funding[tokenId];
        if (account.active) {
            _removeRates(self, self.lots[tokenId][account.generation][account.head]);
        }
        uint256 position = self.heapPosition[tokenId];
        if (position != 0) _removeNode(self, position - 1);
        for (uint256 i; i < PURPOSES; ++i) {
            self.unearnedScaled[i] -= funded[i] + residues[i];
            self.cancellationScaled[i] += residues[i];
        }
        self.refundedRaw += gross;
        ++account.generation;
        account.head = 0;
        account.active = false;
    }

    function _cancellation(State storage self, uint256 tokenId, uint64 through)
        private
        view
        returns (uint256 gross, uint256[4] memory funded, uint256[4] memory residues)
    {
        FundingAccount storage account = self.funding[tokenId];
        Lot[] storage queue = self.lots[tokenId][account.generation];
        if (account.head == queue.length) return (0, funded, residues);
        Lot storage last = queue[queue.length - 1];
        Lot storage head = queue[account.head];
        gross = last.grossPrefix - (account.head == 0 ? 0 : queue[account.head - 1].grossPrefix);
        if (account.active) {
            gross = gross - head.gross + head.gross * (head.end - through) / (head.end - head.start);
        }
        uint256 needed = gross * SCALE;
        for (uint256 i; i < PURPOSES; ++i) {
            uint256 completed = account.head == 0 ? 0 : queue[account.head - 1].allocationPrefix[i];
            uint256 unused = (last.allocationPrefix[i] - completed) * SCALE;
            if (account.active) unused -= _activeEarnedAt(head, i, through);
            funded[i] = Math.min(unused, needed);
            needed -= funded[i];
            residues[i] = unused - funded[i];
        }
        if (needed != 0) revert AccountingInvariant();
    }

    function _requireFinalized(State storage self) private view {
        if (
            !self.initialized
                || (self.heap.length != 0 && self.heap[0].timestamp <= self.accountedThrough)
        ) {
            revert AccountingInvariant();
        }
    }

    function _debit(State storage self, uint256 purpose, uint256 raw) private {
        self.earnedScaled[purpose] -= raw * SCALE;
        self.paidRaw[purpose] += raw;
    }

    function _settleMember(State storage self, MemberAccount storage member) private {
        if (member.eligible) {
            member.creditScaled += member.shares * (self.rewardPerShare - member.index);
        }
        member.index = self.rewardPerShare;
    }

    function _settleReferrer(State storage self, address referrer) private {
        ReferrerAccount storage account = self.referrers[referrer];
        account.creditScaled += account.rate * (self.accountedThrough - account.accountedThrough);
        account.accountedThrough = self.accountedThrough;
    }

    function _distribute(State storage self, uint256 amount) private {
        if (self.totalShares == 0) {
            self.unassigned += amount;
            return;
        }
        uint256 available = amount + self.rewardCarry;
        uint256 quotient = available / self.totalShares;
        self.rewardCarry = available % self.totalShares;
        self.rewardPerShare += quotient;
        self.earnedScaled[1] += quotient * self.totalShares;
    }

    function _credit(State storage self, uint256[4] memory amounts)
        private
        returns (uint256 earned)
    {
        for (uint256 i; i < PURPOSES; ++i) {
            self.unearnedScaled[i] -= amounts[i];
            if (i != 1) self.earnedScaled[i] += amounts[i];
            earned += amounts[i];
        }
        _distribute(self, amounts[1]);
    }

    function _integrate(State storage self, uint64 through) private returns (uint256) {
        uint256 elapsed = through - self.accountedThrough;
        if (elapsed == 0) return 0;
        uint256[4] memory amounts;
        for (uint256 i; i < PURPOSES; ++i) {
            amounts[i] = self.activeRates[i] * elapsed;
        }
        self.accountedThrough = through;
        return _credit(self, amounts);
    }

    function _scheduleHead(State storage self, uint256 tokenId) private {
        FundingAccount storage account = self.funding[tokenId];
        Lot[] storage queue = self.lots[tokenId][account.generation];
        if (account.head == queue.length) return;
        Lot storage lot = queue[account.head];
        if (lot.start < self.accountedThrough) revert AccountingInvariant();
        bool startsLater = lot.start > self.accountedThrough;
        if (!startsLater) {
            account.active = true;
            uint256 duration = lot.end - lot.start;
            for (uint256 i; i < PURPOSES; ++i) {
                self.activeRates[i] += lot.amounts[i] * SCALE / duration;
            }
            if (lot.amounts[2] != 0) {
                _settleReferrer(self, lot.referrer);
                self.referrers[lot.referrer].rate += lot.amounts[2] * SCALE / duration;
            }
        }
        _pushNode(
            self,
            Node(
                tokenId,
                account.generation,
                account.head,
                startsLater ? lot.start : lot.end,
                startsLater
            )
        );
    }

    function _finish(State storage self, Lot storage lot) private returns (uint256) {
        _removeRates(self, lot);
        uint256 duration = lot.end - lot.start;
        uint256[4] memory tails;
        for (uint256 i; i < PURPOSES; ++i) {
            uint256 allocated = lot.amounts[i] * SCALE;
            tails[i] = allocated - allocated / duration * duration;
        }
        if (lot.amounts[2] != 0) self.referrers[lot.referrer].creditScaled += tails[2];
        return _credit(self, tails);
    }

    function _removeRates(State storage self, Lot storage lot) private {
        uint256 duration = lot.end - lot.start;
        for (uint256 i; i < PURPOSES; ++i) {
            self.activeRates[i] -= lot.amounts[i] * SCALE / duration;
        }
        if (lot.amounts[2] != 0) {
            _settleReferrer(self, lot.referrer);
            self.referrers[lot.referrer].rate -= lot.amounts[2] * SCALE / duration;
        }
    }

    function _activeEarnedAt(Lot storage lot, uint256 purpose, uint64 through)
        private
        view
        returns (uint256)
    {
        if (through <= lot.start) return 0;
        uint256 allocated = lot.amounts[purpose] * SCALE;
        // An active head has not processed END, even when an incomplete call
        // stopped at that timestamp. Its endpoint tail remains unearned.
        uint64 until = through < lot.end ? through : lot.end;
        return allocated / (lot.end - lot.start) * (until - lot.start);
    }

    function _less(Node memory a, Node memory b) private pure returns (bool) {
        return a.timestamp < b.timestamp || (a.timestamp == b.timestamp && a.tokenId < b.tokenId);
    }

    function _place(State storage self, uint256 index, Node memory node) private {
        self.heap[index] = node;
        self.heapPosition[node.tokenId] = index + 1;
    }

    function _up(State storage self, uint256 index) private {
        Node memory node = self.heap[index];
        while (index != 0) {
            uint256 parent = (index - 1) / 2;
            Node memory parentNode = self.heap[parent];
            if (!_less(node, parentNode)) break;
            _place(self, index, parentNode);
            index = parent;
        }
        _place(self, index, node);
    }

    function _down(State storage self, uint256 index) private {
        Node memory node = self.heap[index];
        uint256 length = self.heap.length;
        while (2 * index + 1 < length) {
            uint256 child = 2 * index + 1;
            Node memory childNode = self.heap[child];
            if (child + 1 < length) {
                Node memory right = self.heap[child + 1];
                if (_less(right, childNode)) {
                    ++child;
                    childNode = right;
                }
            }
            if (!_less(childNode, node)) break;
            _place(self, index, childNode);
            index = child;
        }
        _place(self, index, node);
    }

    function _pushNode(State storage self, Node memory node) private {
        if (self.heapPosition[node.tokenId] != 0) revert AccountingInvariant();
        self.heap.push(node);
        self.heapPosition[node.tokenId] = self.heap.length;
        _up(self, self.heap.length - 1);
    }

    function _removeNode(State storage self, uint256 index) private {
        uint256 last = self.heap.length - 1;
        delete self.heapPosition[self.heap[index].tokenId];
        if (index == last) {
            self.heap.pop();
            return;
        }
        self.heap[index] = self.heap[last];
        self.heap.pop();
        self.heapPosition[self.heap[index].tokenId] = index + 1;
        if (index != 0 && _less(self.heap[index], self.heap[(index - 1) / 2])) {
            _up(self, index);
            return;
        }
        _down(self, index);
    }

    function _emitScheduled(uint256 tokenId, uint256 generation, uint256 index, Lot storage lot)
        private
    {
        emit FundingLotScheduled(
            tokenId,
            generation,
            index,
            lot.start,
            lot.end,
            lot.gross,
            lot.amounts[0],
            lot.amounts[1],
            lot.amounts[2],
            lot.amounts[3],
            lot.referrer
        );
    }
}
