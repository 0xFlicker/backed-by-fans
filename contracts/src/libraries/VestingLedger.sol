// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipTier} from "../interfaces/IMembershipTier.sol";
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
        // Every raw amount and cumulative prefix is bounded by the same uint112
        // lifetime gross cap enforced by append. Packing does not lower capacity.
        uint112 gross;
        address referrer;
        uint112[4] amounts;
        uint112 grossPrefix;
        uint112[4] allocationPrefix;
    }

    struct FundingAccount {
        uint256 generation;
        uint256 head;
        bool active;
    }

    struct Node {
        uint256 tokenId;
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
    error AccountingBehind(uint64 accountedThrough, uint64 nextBoundary);

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
                [uint256(lot.amounts[0]), lot.amounts[1], lot.amounts[2], lot.amounts[3]],
                lot.referrer,
                generation != self.funding[tokenId].generation
            );
        }
        return abi.encode(page);
    }

    function encodedStatus(State storage self, uint64 now_) external view returns (bytes memory) {
        return abi.encode(_status(self, now_));
    }

    function encodedBalances(State storage self, uint256 tokenId, address referrer, uint64 now_)
        external
        view
        returns (bytes memory)
    {
        return abi.encode(_balances(self, tokenId, referrer, now_));
    }

    function _balanceScaled(State storage self, uint256 tokenId, address referrer)
        private
        view
        returns (uint256[4] memory)
    {
        MemberAccount storage member = self.members[tokenId];
        ReferrerAccount storage referral = self.referrers[referrer];
        return [
            self.earnedScaled[0],
            member.creditScaled
                + (member.eligible ? member.shares * (self.rewardPerShare - member.index) : 0),
            referral.creditScaled + referral.rate
                * (self.accountedThrough - referral.accountedThrough),
            self.earnedScaled[3]
        ];
    }

    function _rawBalances(uint256[4] memory scaled)
        private
        pure
        returns (MembershipTypes.EarnedBalances memory result)
    {
        result.creator = scaled[0] / SCALE;
        result.member = scaled[1] / SCALE;
        result.referral = scaled[2] / SCALE;
        result.protocol = scaled[3] / SCALE;
        for (uint256 i; i < PURPOSES; ++i) {
            result.fractionalScaled[i] = scaled[i] % SCALE;
        }
    }

    function _balances(State storage self, uint256 tokenId, address referrer, uint64 now_)
        private
        view
        returns (MembershipTypes.EarnedBalances memory result)
    {
        result = _rawBalances(_balanceScaled(self, tokenId, referrer));
        result.status = _status(self, now_);
    }

    // The frontier visits the storage heap lazily: popping one stored root
    // exposes its children and the next queued boundary for that member. Its size
    // depends on the read budget, never on the total membership/history count.
    struct PreviewNode {
        Node node;
        uint256 lotIndex;
        uint256 source;
    }

    struct PreviewState {
        PreviewNode[] frontier;
        uint256 length;
        uint256 scheduled;
        uint64 cursor;
        uint256[4] rates;
        uint256[4] earned;
        uint256 referralRate;
        uint256 referralEarned;
    }

    function encodedPreview(
        State storage self,
        uint256 tokenId,
        address referrer,
        uint64 through,
        uint256 maxSteps
    ) external view returns (bytes memory) {
        if (maxSteps > 256) revert InvalidAccountingSteps();
        if (!self.initialized || through < self.accountedThrough) revert AccountingInvariant();
        MembershipTypes.AccountingPreview memory result;
        result.asOf = through;
        result.settled = _balances(self, tokenId, referrer, through);
        PreviewState memory work;
        // A pop adds at most two stored children and one queued successor.
        work.frontier = new PreviewNode[](2 * maxSteps + 1);
        work.scheduled = self.heap.length;
        work.cursor = self.accountedThrough;
        work.rates = self.activeRates;
        work.referralRate = self.referrers[referrer].rate;
        if (self.heap.length != 0) _previewStored(self, work, 0);
        while (
            result.processedSteps < maxSteps && work.length != 0
                && work.frontier[0].node.timestamp <= through
        ) {
            PreviewNode memory entry = _previewPop(work);
            _previewIntegrate(work, entry.node.timestamp);
            if (entry.source != 0) {
                uint256 left = 2 * (entry.source - 1) + 1;
                if (left < self.heap.length) _previewStored(self, work, left);
                if (left + 1 < self.heap.length) _previewStored(self, work, left + 1);
            }
            _previewBoundary(self, work, entry, referrer);
            ++result.processedSteps;
        }
        bool complete = work.length == 0 || work.frontier[0].node.timestamp > through;
        if (complete) _previewIntegrate(work, through);
        result.earnedDeltaScaled = work.earned;
        uint256[4] memory scaled = _balanceScaled(self, tokenId, referrer);
        scaled[0] += work.earned[0];
        scaled[3] += work.earned[3];
        scaled[2] += work.referralEarned;
        if (work.earned[1] != 0 && self.totalShares != 0 && self.members[tokenId].eligible) {
            scaled[1] += self.members[tokenId].shares
            * ((work.earned[1] + self.rewardCarry) / self.totalShares);
        }
        result.current = _rawBalances(scaled);
        result.current.status = MembershipTypes.AccountingStatus(
            work.cursor,
            work.length == 0 ? 0 : work.frontier[0].node.timestamp,
            work.scheduled,
            complete
        );
        return abi.encode(result);
    }

    function _previewBoundary(
        State storage self,
        PreviewState memory work,
        PreviewNode memory entry,
        address referrer
    ) private view {
        Lot[] storage queue = self.lots[
            entry.node.tokenId
        ][self.funding[entry.node.tokenId].generation];
        Lot storage lot = queue[entry.lotIndex];
        if (entry.node.isStart) {
            _previewStart(work, lot, referrer);
            _previewPush(
                work, PreviewNode(Node(entry.node.tokenId, lot.end, false), entry.lotIndex, 0)
            );
            return;
        }
        uint256 duration = lot.end - lot.start;
        for (uint256 i; i < PURPOSES; ++i) {
            uint256 allocated = lot.amounts[i] * SCALE;
            work.rates[i] -= allocated / duration;
            work.earned[i] += allocated % duration;
        }
        if (lot.referrer == referrer) {
            work.referralRate -= lot.amounts[2] * SCALE / duration;
            work.referralEarned += lot.amounts[2] * SCALE % duration;
        }
        uint256 next = entry.lotIndex + 1;
        if (next == queue.length) {
            --work.scheduled;
            return;
        }
        Lot storage following = queue[next];
        bool later = following.start > work.cursor;
        if (!later) _previewStart(work, following, referrer);
        _previewPush(
            work,
            PreviewNode(
                Node(entry.node.tokenId, later ? following.start : following.end, later), next, 0
            )
        );
    }

    function _previewIntegrate(PreviewState memory work, uint64 through) private pure {
        uint256 elapsed = through - work.cursor;
        for (uint256 i; i < PURPOSES; ++i) {
            work.earned[i] += work.rates[i] * elapsed;
        }
        work.referralEarned += work.referralRate * elapsed;
        work.cursor = through;
    }

    function _previewStart(PreviewState memory work, Lot storage lot, address referrer)
        private
        view
    {
        uint256 duration = lot.end - lot.start;
        for (uint256 i; i < PURPOSES; ++i) {
            work.rates[i] += lot.amounts[i] * SCALE / duration;
        }
        if (lot.referrer == referrer) work.referralRate += lot.amounts[2] * SCALE / duration;
    }

    function _previewStored(State storage self, PreviewState memory work, uint256 index)
        private
        view
    {
        Node memory node = self.heap[index];
        // source zero identifies projected entries; stored sources are one-based.
        _previewPush(work, PreviewNode(node, self.funding[node.tokenId].head, index + 1));
    }

    function _previewPush(PreviewState memory work, PreviewNode memory entry) private pure {
        uint256 index = work.length++;
        while (index != 0) {
            uint256 parent = (index - 1) / 2;
            if (!_less(entry.node, work.frontier[parent].node)) break;
            work.frontier[index] = work.frontier[parent];
            index = parent;
        }
        work.frontier[index] = entry;
    }

    function _previewPop(PreviewState memory work) private pure returns (PreviewNode memory first) {
        first = work.frontier[0];
        PreviewNode memory last = work.frontier[--work.length];
        if (work.length == 0) return first;
        uint256 index;
        while (2 * index + 1 < work.length) {
            uint256 child = 2 * index + 1;
            if (
                child + 1 < work.length
                    && _less(work.frontier[child + 1].node, work.frontier[child].node)
            ) ++child;
            if (!_less(work.frontier[child].node, last.node)) break;
            work.frontier[index] = work.frontier[child];
            index = child;
        }
        work.frontier[index] = last;
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
        lot.gross = gross.toUint112();
        lot.grossPrefix = (gross + (index == 0 ? 0 : queue[index - 1].grossPrefix)).toUint112();
        for (uint256 i; i < PURPOSES; ++i) {
            lot.amounts[i] = amounts[i].toUint112();
            lot.allocationPrefix[i] =
                (amounts[i] + (index == 0 ? 0 : queue[index - 1].allocationPrefix[i])).toUint112();
            self.unearnedScaled[i] += amounts[i] * SCALE;
        }
        self.totalGross += gross;
        if (account.head == index) _scheduleHead(self, tokenId, false);
        _emitScheduled(tokenId, account.generation, index, lot);
    }

    function process(State storage self, uint64 through, uint256 maxSteps)
        external
        returns (ProcessResult memory result)
    {
        result = _process(self, through, maxSteps);
        _emitProgress(result);
    }

    function _catchUp(State storage self, uint64 through, uint256 maxSteps)
        private
        returns (ProcessResult memory progress)
    {
        // A depleted shared claim budget may integrate continuous time but cannot
        // pop another checkpoint. Public tier entry points enforce the maximum.
        if (maxSteps == 0 && self.heap.length != 0 && self.heap[0].timestamp <= through) {
            revert AccountingBehind(self.accountedThrough, self.heap[0].timestamp);
        }
        progress = _process(self, through, maxSteps == 0 ? 1 : maxSteps);
        if (!progress.complete) {
            revert AccountingBehind(progress.accountedThrough, self.heap[0].timestamp);
        }
        _emitProgress(progress);
    }

    // Delegatecall preserves the tier as emitter for both public processing and claims.
    function _emitProgress(ProcessResult memory progress) private {
        emit IMembershipTier.AccountingProgress(
            progress.accountedThrough, progress.processed, progress.complete, progress.earnedScaled
        );
    }

    function catchUp(State storage self, uint64 through, uint256 maxSteps) external {
        _catchUp(self, through, maxSteps);
    }

    function _process(State storage self, uint64 through, uint256 maxSteps)
        private
        returns (ProcessResult memory result)
    {
        if (maxSteps == 0 || maxSteps > MAX_STEPS) revert InvalidAccountingSteps();
        if (!self.initialized || through < self.accountedThrough) revert AccountingInvariant();
        uint256[4] memory earned;
        while (
            result.processed < maxSteps && self.heap.length != 0
                && self.heap[0].timestamp <= through
        ) {
            Node memory node = self.heap[0];
            _integrate(self, node.timestamp, earned);
            FundingAccount storage account = self.funding[node.tokenId];
            // There is exactly one live node per member. Cancellation removes it
            // before changing generation; only processing advances the live head.
            // Read that identity once instead of mirroring two storage words in
            // every heap entry and rewriting them on each sift.
            uint256 generation = account.generation;
            uint256 lotIndex = account.head;
            Lot storage lot = self.lots[node.tokenId][generation][lotIndex];
            if (
                account.active == node.isStart
                    || node.timestamp != (node.isStart ? lot.start : lot.end)
            ) revert AccountingInvariant();
            if (node.isStart) {
                _scheduleHead(self, node.tokenId, true);
            } else {
                _finish(self, lot, earned);
                account.active = false;
                ++account.head;
                emit FundingLotCompleted(node.tokenId, generation, lotIndex, node.timestamp);
                _scheduleHead(self, node.tokenId, true);
            }
            ++result.processed;
        }
        result.complete = self.heap.length == 0 || self.heap[0].timestamp > through;
        if (result.complete) _integrate(self, through, earned);
        // No external calls or eligibility changes occur inside processing. The
        // reward denominator is fixed, so distributing the sum with the carried
        // remainder is exactly equivalent to distributing each interval/tail in
        // order. Commit global liabilities once; referral clocks remain per-boundary.
        result.earnedScaled = _credit(self, earned);
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
        return _takeMember(self, tokenId);
    }

    function _takeMember(State storage self, uint256 tokenId) private returns (uint256 amount) {
        MemberAccount storage member = self.members[tokenId];
        _settleMember(self, member);
        amount = member.creditScaled / SCALE;
        member.creditScaled -= amount * SCALE;
        _debit(self, 1, amount);
    }

    function takeReferrer(State storage self, address referrer) external returns (uint256 amount) {
        return _takeReferrer(self, referrer);
    }

    function _takeReferrer(State storage self, address referrer) private returns (uint256 amount) {
        ReferrerAccount storage account = self.referrers[referrer];
        // With no active stream, credit is already final. Avoid creating a timestamp
        // slot for every non-referrer who calls claimAll. Starting a stream still
        // settles its timestamp in _scheduleHead before increasing the rate.
        if (account.rate != 0) _settleReferrer(self, referrer);
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

    /// @notice Settle and collect the tier-authorized categories in one linked call.
    /// The tier supplies identity/ownership and transfers the total. Delegatecall
    /// keeps the original tier as event emitter and gives this library no custody.
    function claimAll(
        State storage self,
        uint64 through,
        uint256 maxSteps,
        uint256 tokenId,
        address beneficiary,
        bool creator
    ) external returns (MembershipTypes.ClaimResult memory result) {
        ProcessResult memory progress = _catchUp(self, through, maxSteps);
        result.processedSteps = progress.processed;
        if (tokenId != 0) result.reward = _takeMember(self, tokenId);
        result.referral = _takeReferrer(self, beneficiary);
        if (creator) {
            result.creator = self.earnedScaled[0] / SCALE;
            _debit(self, 0, result.creator);
        }
        if (result.reward != 0) {
            emit IMembershipTier.RewardClaimed(tokenId, beneficiary, result.reward);
        }
        if (result.referral != 0) {
            emit IMembershipTier.ReferralClaimed(beneficiary, result.referral);
        }
        if (result.creator != 0) {
            emit IMembershipTier.CreatorProceedsWithdrawn(beneficiary, result.creator);
        }
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
            // Widen packed raw storage before multiplying by uint64 time. The
            // intermediate can use 176 bits even though the refund fits uint112.
            gross = gross - head.gross + uint256(head.gross) * (head.end - through)
                / (head.end - head.start);
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
        if (raw == 0) return;
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
            if (amounts[i] == 0) continue;
            self.unearnedScaled[i] -= amounts[i];
            if (i != 1) self.earnedScaled[i] += amounts[i];
            earned += amounts[i];
        }
        // Carry is always smaller than totalShares; weight changes clear it.
        // A zero allocation therefore cannot distribute any new liability.
        if (amounts[1] != 0) _distribute(self, amounts[1]);
    }

    function _integrate(State storage self, uint64 through, uint256[4] memory amounts) private {
        uint256 elapsed = through - self.accountedThrough;
        if (elapsed == 0) return;
        for (uint256 i; i < PURPOSES; ++i) {
            amounts[i] += self.activeRates[i] * elapsed;
        }
        self.accountedThrough = through;
    }

    function _scheduleHead(State storage self, uint256 tokenId, bool replaceRoot) private {
        FundingAccount storage account = self.funding[tokenId];
        Lot[] storage queue = self.lots[tokenId][account.generation];
        if (account.head == queue.length) {
            if (replaceRoot) _removeNode(self, 0);
            return;
        }
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
        Node memory next = Node(tokenId, startsLater ? lot.start : lot.end, startsLater);
        if (replaceRoot) {
            // Processing consumes the root. The same member's next boundary is
            // strictly later (positive duration, ordered lots), so it only sifts
            // down. Keep its live position instead of removing and reinserting it.
            _down(self, 0, next);
        } else {
            _pushNode(self, next);
        }
    }

    function _finish(State storage self, Lot storage lot, uint256[4] memory amounts) private {
        uint256 duration = lot.end - lot.start;
        uint256[4] memory tails;
        for (uint256 i; i < PURPOSES; ++i) {
            uint256 allocated = lot.amounts[i] * SCALE;
            uint256 rate = allocated / duration;
            self.activeRates[i] -= rate;
            tails[i] = allocated % duration;
            amounts[i] += tails[i];
        }
        if (lot.amounts[2] != 0) {
            _settleReferrer(self, lot.referrer);
            ReferrerAccount storage referral = self.referrers[lot.referrer];
            referral.rate -= lot.amounts[2] * SCALE / duration;
            referral.creditScaled += tails[2];
        }
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

    function _up(State storage self, uint256 index, Node memory node) private {
        while (index != 0) {
            uint256 parent = (index - 1) / 2;
            Node memory parentNode = self.heap[parent];
            if (!_less(node, parentNode)) break;
            _place(self, index, parentNode);
            index = parent;
        }
        _place(self, index, node);
    }

    function _down(State storage self, uint256 index, Node memory node) private {
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
        // Sift into a hole: write the incoming node and its position only once,
        // at their final index, rather than storing them before every sift.
        self.heap.push();
        _up(self, self.heap.length - 1, node);
    }

    function _removeNode(State storage self, uint256 index) private {
        uint256 last = self.heap.length - 1;
        delete self.heapPosition[self.heap[index].tokenId];
        if (index == last) {
            self.heap.pop();
            return;
        }
        Node memory node = self.heap[last];
        self.heap.pop();
        if (index != 0 && _less(node, self.heap[(index - 1) / 2])) {
            _up(self, index, node);
            return;
        }
        _down(self, index, node);
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
