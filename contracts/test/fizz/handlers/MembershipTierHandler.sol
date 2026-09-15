// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import "../Base.sol";
import {Properties} from "../Properties.sol";

/// @notice High-signal membership lifecycle actions plus raw edge-case wrappers.
abstract contract MembershipTierHandler is Properties {
    function membershipTier_cancelSubscription_clamped(bool contribution, uint256 seed) public {
        MembershipTier target = _tier(contribution);
        (uint256 tokenId,) = _liveToken(target, seed);
        if (tokenId == 0) return;
        membershipTier_cancelSubscription(contribution, tokenId);
    }

    function membershipTier_claimReferral_clamped(bool contribution) public {
        membershipTier_claimReferral(contribution);
    }

    function membershipTier_claimRetiredRewards_clamped(bool contribution) public {
        membershipTier_claimRetiredRewards(contribution);
    }

    function membershipTier_claimReward_clamped(
        bool contribution,
        uint256 seed,
        uint256 maxAccountingSteps
    ) public {
        MembershipTier target = _tier(contribution);
        uint256 tokenId = _ownedToken(target, actor, seed);
        if (tokenId == 0) return;
        membershipTier_claimReward(contribution, tokenId, 1 + maxAccountingSteps % 64);
    }

    function membershipTier_claimRewards_clamped(bool contribution, uint256 seed, uint256 maxSteps)
        public
    {
        MembershipTier target = _tier(contribution);
        uint256 tokenId = _ownedToken(target, actor, seed);
        uint256[] memory tokenIds = new uint256[](tokenId == 0 ? 0 : 1);
        if (tokenId != 0) tokenIds[0] = tokenId;
        membershipTier_claimRewards(contribution, tokenIds, 1 + maxSteps % 64);
    }

    function membershipTier_createContributionMembership_clamped(
        uint256 gross,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public {
        if (!_hasCapacity(contributionTier)) return;
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance == 0) return;
        gross %= _min(balance, 100e6) + 1;
        referralChoice = gross == 0 ? address(0) : _referrer(referralChoice);
        membershipTier_createContributionMembership(
            gross, referralChoice, 1 + maxAccountingSteps % 64
        );
    }

    function membershipTier_createContributionMembership_smallGross(uint8 gross) public {
        if (!_hasCapacity(contributionTier)) return;
        membershipTier_createContributionMembership(gross % 3, address(0), 64);
    }

    function membershipTier_createContributionMembership_fullBalance(address referralChoice)
        public
    {
        if (!_hasCapacity(contributionTier)) return;
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance == 0) return;
        uint256 mintedBefore = contributionTier.totalMinted();
        membershipTier_createContributionMembership(balance, _referrer(referralChoice), 64);
        uint256 tokenId = contributionTier.totalMinted();
        if (tokenId != mintedBefore + 1) return;
        property_fullBalanceContribution(
            paymentToken.balanceOf(actor),
            contributionTier.sharesOf(tokenId),
            contributionTier.hasClaimInterest(actor)
        );
    }

    function membershipTier_createMembership_clamped(
        uint64 periods,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public {
        if (!_hasCapacity(fixedTier)) return;
        periods = 1 + periods % 3;
        if (paymentToken.balanceOf(actor) < fixedTier.pricePerPeriod() * periods) return;
        membershipTier_createMembership(
            periods, _referrer(referralChoice), 1 + maxAccountingSteps % 64
        );
    }

    function membershipTier_giftMembership_clamped(
        address recipient,
        uint64 periods,
        uint256 maxAccountingSteps
    ) public {
        if (!_hasCapacity(fixedTier)) return;
        recipient = toActorNotCurrent(recipient);
        periods = 1 + periods % 3;
        if (paymentToken.balanceOf(actor) < fixedTier.pricePerPeriod() * periods) return;
        membershipTier_giftMembership(recipient, periods, 1 + maxAccountingSteps % 64);
    }

    function membershipTier_giftRenewal_clamped(
        uint256 ownerSeed,
        uint64 periods,
        uint256 maxAccountingSteps
    ) public {
        (uint256 tokenId, address owner) = _otherLiveToken(fixedTier, ownerSeed);
        if (tokenId == 0) return;
        periods = 1 + periods % 3;
        if (paymentToken.balanceOf(actor) < fixedTier.pricePerPeriod() * periods) return;
        (MembershipTypes.ReferralStatus status, address referrer) = fixedTier.referralOf(tokenId);
        membershipTier_giftRenewal(
            tokenId, owner, periods, status, referrer, 1 + maxAccountingSteps % 64
        );
    }

    function membershipTier_processAccounting_clamped(bool contribution, uint256 maxSteps) public {
        membershipTier_processAccounting(contribution, 1 + maxSteps % 64);
    }

    function membershipTier_processExpirations_clamped(bool contribution, uint256 maxSteps) public {
        membershipTier_processExpirations(contribution, 1 + maxSteps % 64);
    }

    function membershipTier_releaseProtocolFees_clamped(bool contribution) public {
        membershipTier_releaseProtocolFees(contribution);
    }

    function membershipTier_renewContributionMembership_clamped(
        uint256 seed,
        uint256 gross,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public {
        uint256 tokenId = _liveOwnedToken(contributionTier, actor, seed);
        if (tokenId == 0) return;
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance == 0) return;
        gross %= _min(balance, 100e6) + 1;
        referralChoice = _lockedReferrer(contributionTier, tokenId, referralChoice, gross);
        membershipTier_renewContributionMembership(
            tokenId, gross, referralChoice, 1 + maxAccountingSteps % 64
        );
    }

    function membershipTier_renewMembership_clamped(
        uint256 seed,
        uint64 periods,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public {
        uint256 tokenId = _liveOwnedToken(fixedTier, actor, seed);
        if (tokenId == 0) return;
        periods = 1 + periods % 3;
        if (paymentToken.balanceOf(actor) < fixedTier.pricePerPeriod() * periods) return;
        referralChoice = _lockedReferrer(fixedTier, tokenId, referralChoice, 1);
        membershipTier_renewMembership(
            tokenId, periods, referralChoice, 1 + maxAccountingSteps % 64
        );
    }

    function membershipTier_renewSubscription_clamped(
        bool contribution,
        uint256 seed,
        uint64 periods
    ) public {
        MembershipTier target = _tier(contribution);
        uint256 tokenId = _liveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        periods = contribution ? 1 : 1 + periods % 3;
        if (!contribution) {
            (MembershipTypes.ReferralStatus status,) = target.referralOf(tokenId);
            if (status == MembershipTypes.ReferralStatus.Unset) return;
            if (paymentToken.balanceOf(actor) < target.pricePerPeriod() * periods) return;
        }
        membershipTier_renewSubscription(contribution, tokenId, periods * target.periodDuration());
    }

    function membershipTier_transferFrom_clamped(bool contribution, address to, uint256 seed)
        public
    {
        MembershipTier target = _tier(contribution);
        uint256 tokenId = _liveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        membershipTier_transferFrom(contribution, actor, toActorNotCurrent(to), tokenId);
    }

    function membershipTier_withdrawCreatorProceeds_clamped(bool contribution) public {
        membershipTier_withdrawCreatorProceeds(contribution);
    }

    function membershipTier_donateERC20(bool contribution, uint256 amount) public {
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance == 0) return;
        amount = 1 + amount % balance;
        MembershipTier target = _tier(contribution);
        vm.prank(actor);
        require(paymentToken.transfer(address(target), amount));
        ghosts.donatedByTier[address(target)] += amount;
    }

    function membershipTier_probeAccounting(bool contribution, uint256 seed) public view {
        MembershipTier target = _tier(contribution);
        target.previewShares(1);
        target.accountingStatus();
        target.previewPaymentTotals(64);
        target.reserveState();
        target.creatorProceeds();
        target.protocolFeeEarnedHeld();
        target.claimableReferral(actor);
        target.claimableRetiredReward(actor);
        target.hasClaimInterest(actor);
        target.totalProtectedLiability();

        uint256 totalMinted = target.totalMinted();
        if (totalMinted == 0) return;
        uint256 tokenId = 1 + seed % totalMinted;
        target.previewAccounting(tokenId, actor, actor, 64);
        MembershipTypes.AllocationState memory allocation = target.allocationState(tokenId);
        target.allocationLots(tokenId, allocation.generation, 0, 1);
        target.sharesOf(tokenId);
        target.rewardEligible(tokenId);
        target.claimableReward(tokenId);
        target.referralOf(tokenId);
        target.isActiveToken(tokenId);
        target.timeBalances(tokenId);
        target.isOccupied(tokenId);
    }

    function membershipTier_probeOwnerViews(bool contribution, uint256 seed) public view {
        MembershipTier target = _tier(contribution);
        target.artConfig();
        target.mediaConfig();
        target.tokensOfOwner(actor, 0, 1);
        target.supportsInterface(0x80ac58cd);

        uint256 tokenId = _ownedToken(target, actor, seed);
        uint256[] memory tokenIds = new uint256[](tokenId == 0 ? 0 : 1);
        if (tokenId == 0) {
            target.previewClaimRewards(actor, tokenIds, 64);
            return;
        }
        tokenIds[0] = tokenId;
        target.ownerOf(tokenId);
        target.expiresAt(tokenId);
        target.isRenewable(tokenId);
        target.previewClaimRewards(actor, tokenIds, 64);
        target.previewRefund(tokenId);
        target.tokenURI(tokenId);
    }

    function membershipTier_secondary(
        bool contribution,
        uint8 selector,
        uint256 seed,
        uint64 amount,
        address account
    ) public {
        MembershipTier target = _tier(contribution);
        selector %= 9;
        if (selector == 0) {
            (uint256 tokenId, address owner) = _liveToken(target, seed);
            if (tokenId != 0) {
                _membershipTier_addGrantTime(target, tokenId, owner, 1 + amount % 3, 64);
            }
        } else if (selector == 1) {
            uint256 tokenId = _liveOwnedToken(target, actor, seed);
            if (tokenId != 0) _membershipTier_approve(target, toActorNotCurrent(account), tokenId);
        } else if (selector == 2) {
            if (_hasCapacity(target)) {
                _membershipTier_grantMembership(target, toActor(account), 1 + amount % 3, 64);
            }
        } else if (selector == 3) {
            (uint256 tokenId, address owner) = _liveToken(target, seed);
            if (tokenId != 0) {
                _membershipTier_refund(target, tokenId, owner, type(uint256).max, 64);
            }
        } else if (selector == 4) {
            (uint256 tokenId, address owner) = _liveToken(target, seed);
            if (tokenId != 0) {
                (, uint64 grantSeconds,) = target.timeBalances(tokenId);
                if (grantSeconds != 0) {
                    _membershipTier_revokeGrantTime(target, tokenId, owner, 64);
                }
            }
        } else if (selector == 5) {
            _membershipTier_setApprovalForAll(target, toActorNotCurrent(account), amount % 2 == 0);
        } else if (selector == 6) {
            _membershipTier_setMaxPrepaidPeriods(target, amount % 25);
        } else if (selector == 7) {
            _membershipTier_setPaused(target, amount % 2 == 0);
        } else {
            uint64 occupancy = target.occupiedSupply();
            _membershipTier_setSupplyCap(target, occupancy + amount % (17 - occupancy));
        }
    }

    function membershipTier_cancelSubscription(bool contribution, uint256 tokenId)
        public
        asCreator
    {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, tokenId, actor, address(0));
        target.cancelSubscription(tokenId);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, actor, address(0));
    }

    function membershipTier_claimReferral(bool contribution) public asActor {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, actor, address(0));
        target.claimReferral();
        snapshotAfter(target, 0, actor, address(0));
    }

    function membershipTier_claimRetiredRewards(bool contribution) public asActor {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, actor, address(0));
        target.claimRetiredRewards();
        snapshotAfter(target, 0, actor, address(0));
    }

    function membershipTier_claimReward(
        bool contribution,
        uint256 tokenId,
        uint256 maxAccountingSteps
    ) public asActor {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, tokenId, actor, address(0));
        target.claimReward(tokenId, maxAccountingSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, actor, address(0));
    }

    function membershipTier_claimRewards(
        bool contribution,
        uint256[] memory tokenIds,
        uint256 maxSteps
    ) public asActor {
        MembershipTier target = _tier(contribution);
        uint256 tokenId = tokenIds.length == 0 ? 0 : tokenIds[0];
        snapshotBefore(target, tokenId, actor, address(0));
        target.claimRewards(tokenIds, maxSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, actor, address(0));
    }

    function membershipTier_createContributionMembership(
        uint256 gross,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(contributionTier, 0, actor, address(0));
        uint256 tokenId = contributionTier.createContributionMembership(
            gross, referralChoice, maxAccountingSteps
        );
        _syncTierGhosts(contributionTier);
        snapshotAfter(contributionTier, tokenId, actor, address(0));
    }

    function membershipTier_createMembership(
        uint64 periods,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(fixedTier, 0, actor, address(0));
        uint256 tokenId = fixedTier.createMembership(periods, referralChoice, maxAccountingSteps);
        _syncTierGhosts(fixedTier);
        snapshotAfter(fixedTier, tokenId, actor, address(0));
    }

    function membershipTier_giftMembership(
        address recipient,
        uint64 periods,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(fixedTier, 0, actor, recipient);
        uint256 tokenId = fixedTier.giftMembership(recipient, periods, maxAccountingSteps);
        _syncTierGhosts(fixedTier);
        snapshotAfter(fixedTier, tokenId, actor, recipient);
    }

    function membershipTier_giftRenewal(
        uint256 tokenId,
        address expectedOwner,
        uint64 periods,
        MembershipTypes.ReferralStatus expectedReferralStatus,
        address expectedReferrer,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(fixedTier, tokenId, actor, expectedOwner);
        fixedTier.giftRenewal(
            tokenId,
            expectedOwner,
            periods,
            expectedReferralStatus,
            expectedReferrer,
            maxAccountingSteps
        );
        _syncTierGhosts(fixedTier);
        snapshotAfter(fixedTier, tokenId, actor, expectedOwner);
    }

    function membershipTier_processAccounting(bool contribution, uint256 maxSteps) public {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, actor, address(0));
        target.processAccounting(maxSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, 0, actor, address(0));
    }

    function membershipTier_processExpirations(bool contribution, uint256 maxSteps) public {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, actor, address(0));
        target.processExpirations(maxSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, 0, actor, address(0));
    }

    function membershipTier_releaseProtocolFees(bool contribution) public {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, actor, address(0));
        target.releaseProtocolFees();
        snapshotAfter(target, 0, actor, address(0));
    }

    function membershipTier_renewContributionMembership(
        uint256 tokenId,
        uint256 gross,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(contributionTier, tokenId, actor, address(0));
        contributionTier.renewContributionMembership(
            tokenId, gross, referralChoice, maxAccountingSteps
        );
        _syncTierGhosts(contributionTier);
        snapshotAfter(contributionTier, tokenId, actor, address(0));
    }

    function membershipTier_renewMembership(
        uint256 tokenId,
        uint64 periods,
        address referralChoice,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(fixedTier, tokenId, actor, address(0));
        fixedTier.renewMembership(tokenId, periods, referralChoice, maxAccountingSteps);
        _syncTierGhosts(fixedTier);
        snapshotAfter(fixedTier, tokenId, actor, address(0));
    }

    function membershipTier_renewSubscription(bool contribution, uint256 tokenId, uint64 duration)
        public
        asActor
    {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, tokenId, actor, address(0));
        target.renewSubscription(tokenId, duration);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, actor, address(0));
    }

    function membershipTier_transferFrom(
        bool contribution,
        address from,
        address to,
        uint256 tokenId
    ) public asActor {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, tokenId, from, to);
        target.transferFrom(from, to, tokenId);
        snapshotAfter(target, tokenId, from, to);
    }

    function membershipTier_withdrawCreatorProceeds(bool contribution) public asCreator {
        MembershipTier target = _tier(contribution);
        snapshotBefore(target, 0, creator, address(0));
        target.withdrawCreatorProceeds();
        snapshotAfter(target, 0, creator, address(0));
    }

    function _membershipTier_addGrantTime(
        MembershipTier target,
        uint256 tokenId,
        address expectedOwner,
        uint64 periods,
        uint256 maxAccountingSteps
    ) internal asCreator {
        snapshotBefore(target, tokenId, expectedOwner, creator);
        target.addGrantTime(tokenId, expectedOwner, periods, maxAccountingSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, expectedOwner, creator);
    }

    function _membershipTier_approve(MembershipTier target, address to, uint256 tokenId)
        internal
        asActor
    {
        target.approve(to, tokenId);
    }

    function _membershipTier_grantMembership(
        MembershipTier target,
        address recipient,
        uint64 periods,
        uint256 maxAccountingSteps
    ) internal asCreator {
        snapshotBefore(target, 0, recipient, creator);
        uint256 tokenId = target.grantMembership(recipient, periods, maxAccountingSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, recipient, creator);
    }

    function _membershipTier_refund(
        MembershipTier target,
        uint256 tokenId,
        address expectedOwner,
        uint256 maxGrossRefund,
        uint256 maxAccountingSteps
    ) internal asCreator {
        snapshotBefore(target, tokenId, expectedOwner, creator);
        target.refund(tokenId, expectedOwner, maxGrossRefund, maxAccountingSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, expectedOwner, creator);
    }

    function _membershipTier_revokeGrantTime(
        MembershipTier target,
        uint256 tokenId,
        address expectedOwner,
        uint256 maxAccountingSteps
    ) internal asCreator {
        snapshotBefore(target, tokenId, expectedOwner, creator);
        target.revokeGrantTime(tokenId, expectedOwner, maxAccountingSteps);
        _syncTierGhosts(target);
        snapshotAfter(target, tokenId, expectedOwner, creator);
    }

    function _membershipTier_setApprovalForAll(
        MembershipTier target,
        address operator,
        bool approved
    ) internal asActor {
        target.setApprovalForAll(operator, approved);
    }

    function _membershipTier_setMaxPrepaidPeriods(MembershipTier target, uint64 newMaximum)
        internal
        asCreator
    {
        target.setMaxPrepaidPeriods(newMaximum);
    }

    function _membershipTier_setPaused(MembershipTier target, bool newPaused) internal asCreator {
        target.setPaused(newPaused);
    }

    function _membershipTier_setSupplyCap(MembershipTier target, uint64 newSupplyCap)
        internal
        asCreator
    {
        target.setSupplyCap(newSupplyCap);
    }

    function _tier(bool contribution) internal view returns (MembershipTier) {
        return contribution ? contributionTier : fixedTier;
    }

    function _hasCapacity(MembershipTier target) internal view returns (bool) {
        return target.supplyCap() == 0 || target.occupiedSupply() < target.supplyCap();
    }

    function _ownedToken(MembershipTier target, address owner, uint256 seed)
        internal
        view
        returns (uint256)
    {
        uint256 balance = target.balanceOf(owner);
        return balance == 0 ? 0 : target.tokenOfOwnerByIndex(owner, seed % balance);
    }

    function _liveOwnedToken(MembershipTier target, address owner, uint256 seed)
        internal
        view
        returns (uint256 tokenId)
    {
        tokenId = _ownedToken(target, owner, seed);
        if (tokenId != 0 && !target.isActiveToken(tokenId)) tokenId = 0;
    }

    function _liveToken(MembershipTier target, uint256 seed)
        internal
        view
        returns (uint256 tokenId, address owner)
    {
        for (uint256 i; i < actors.length; ++i) {
            owner = actors[(seed + i) % actors.length];
            tokenId = _liveOwnedToken(target, owner, seed);
            if (tokenId != 0) return (tokenId, owner);
        }
        return (0, address(0));
    }

    function _otherLiveToken(MembershipTier target, uint256 seed)
        internal
        view
        returns (uint256 tokenId, address owner)
    {
        for (uint256 i; i < actors.length; ++i) {
            owner = actors[(seed + i) % actors.length];
            if (owner == actor) continue;
            tokenId = _liveOwnedToken(target, owner, seed);
            if (tokenId != 0) return (tokenId, owner);
        }
        return (0, address(0));
    }

    function _referrer(address entropy) internal view returns (address) {
        return uint160(entropy) % 3 == 0 ? address(0) : toActorNotCurrent(entropy);
    }

    function _lockedReferrer(MembershipTier target, uint256 tokenId, address entropy, uint256 gross)
        internal
        view
        returns (address)
    {
        if (gross == 0) return address(0);
        (MembershipTypes.ReferralStatus status, address referrer) = target.referralOf(tokenId);
        if (status == MembershipTypes.ReferralStatus.LockedAddress) return referrer;
        if (status == MembershipTypes.ReferralStatus.LockedNone) return address(0);
        return _referrer(entropy);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _syncTierGhosts(MembershipTier target) internal {
        uint256 minted = target.totalMinted();
        ghosts.mintedCountByTier[address(target)] = minted;
        ghosts.retiredCountByTier[address(target)] = minted - target.totalSupply();
    }
}
