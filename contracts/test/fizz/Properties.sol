// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import {MembershipTier} from "../../src/MembershipTier.sol";
import {IERC5643} from "../../src/interfaces/IERC5643.sol";
import {IMembershipTier} from "../../src/interfaces/IMembershipTier.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {Snapshots} from "./Snapshots.sol";
import {PropertiesAsserts} from "./utils/PropertiesAsserts.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    IERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// @notice Contains the functions that check the properties (invariants)
abstract contract Properties is PropertiesAsserts, Snapshots {
    // ―――――――――――――――――――― Global properties ―――――――――――――――――――――
    // These properties must always hold after any function call.
    // They MUST BE PUBLIC so that fuzzers can find and call them.

    /// @notice GL-01: Every accepted gross unit remains represented in payment accounting.
    function property_accountingConservation() public {
        _assertAccountingConservation(fixedTier);
        _assertAccountingConservation(contributionTier);
    }

    /// @notice GL-02: Tier custody equals protected liability plus tracked donations.
    function property_tierSolvency() public {
        _assertTierSolvency(fixedTier);
        _assertTierSolvency(contributionTier);
    }

    /// @notice GL-03: Reward-share totals equal the bounded extant-token share sum.
    function property_rewardShareDenominator() public {
        _assertRewardShareDenominator(fixedTier);
        _assertRewardShareDenominator(contributionTier);
    }

    /// @notice GL-04: Occupied supply equals ERC-721 enumerable supply.
    function property_occupiedSupplySync() public {
        _assertOccupiedSupplySync(fixedTier);
        _assertOccupiedSupplySync(contributionTier);
    }

    /// @notice GL-05: Every occupied membership has exactly one scheduled expiration.
    function property_expirationScheduleSync() public {
        _assertExpirationScheduleSync(fixedTier);
        _assertExpirationScheduleSync(contributionTier);
    }

    /// @notice GL-06: Permanent mints equal creations and extant plus retired positions.
    function property_mintedRetiredCounts() public {
        _assertMintedRetiredCounts(fixedTier);
        _assertMintedRetiredCounts(contributionTier);
    }

    /// @notice GL-07: Enumerated payment tokens are unique, listed, and configured.
    function property_paymentTokenRegistry() public {
        uint256 count = factory.paymentTokenCount();
        address[] memory tokens = factory.paymentTokens(0, count);
        eq(tokens.length, count, "GL-07 token count");
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            t(factory.isPaymentTokenListed(token), "GL-07 unlisted token");
            gt(factory.minimumPayment(token), 0, "GL-07 zero minimum");
            if (factory.isPaymentTokenEnabled(token)) {
                t(factory.isPaymentTokenListed(token), "GL-07 enabled unlisted token");
            }
            for (uint256 j; j < i; ++j) {
                neq(uint256(uint160(tokens[j])), uint256(uint160(token)), "GL-07 duplicate token");
            }
        }
    }

    /// @notice GL-09: Protected raw liability is the exact ceiling of scaled liabilities.
    function property_protectedLiabilityCeiling() public {
        _assertProtectedLiabilityCeiling(fixedTier);
        _assertProtectedLiabilityCeiling(contributionTier);
    }

    /// @notice GL-10: Lifetime gross never decreases.
    function property_lifetimeGrossMonotonic() public {
        _assertLifetimeGrossMonotonic(fixedTier);
        _assertLifetimeGrossMonotonic(contributionTier);
    }

    /// @notice GL-11: Total minted never decreases or exceeds tracked creation actions.
    function property_totalMintedMonotonic() public {
        _assertTotalMintedMonotonic(fixedTier);
        _assertTotalMintedMonotonic(contributionTier);
    }

    /// @notice GL-12: The accounting cursor never moves backward.
    function property_accountedThroughMonotonic() public {
        _assertAccountedThroughMonotonic(fixedTier);
        _assertAccountedThroughMonotonic(contributionTier);
    }

    /// @notice GL-13: Factory registry counts never decrease.
    function property_factoryCountsMonotonic() public {
        uint256 tierCount = factory.tierCount();
        uint256 tokenCount = factory.paymentTokenCount();
        gte(tierCount, ghosts.beforeFactoryTierCount, "GL-13 tier count decreased");
        gte(
            tokenCount, ghosts.beforeFactoryPaymentTokenCount, "GL-13 payment-token count decreased"
        );
        ghosts.beforeFactoryTierCount = tierCount;
        ghosts.beforeFactoryPaymentTokenCount = tokenCount;
    }

    /// @notice GL-14: Reward-per-share indices never decrease.
    function property_rewardPerShareMonotonic() public {
        _assertRewardPerShareMonotonic(fixedTier);
        _assertRewardPerShareMonotonic(contributionTier);
    }

    /// @notice GL-15: Occupancy, ERC-721 ownership, and active state remain synchronized.
    function property_ownershipOccupancySync() public {
        _assertOwnershipOccupancySync(fixedTier);
        _assertOwnershipOccupancySync(contributionTier);
    }

    /// @notice GL-16: Nonzero supply caps always cover occupied supply.
    function property_supplyCap() public {
        _assertSupplyCap(fixedTier);
        _assertSupplyCap(contributionTier);
    }

    /// @notice GL-17: Reward eligibility requires a live owned position with shares.
    function property_rewardEligibility() public {
        _assertRewardEligibility(fixedTier);
        _assertRewardEligibility(contributionTier);
    }

    /// @notice GL-18: Global and owner ERC-721 enumeration are unique and consistent.
    function property_erc721Enumeration() public {
        _assertERC721Enumeration(fixedTier);
        _assertERC721Enumeration(contributionTier);
    }

    /// @notice GL-19: Membership tiers retain all required interface declarations.
    function property_interfaces() public {
        _assertInterfaces(fixedTier);
        _assertInterfaces(contributionTier);
    }

    /// @notice GL-20: Complete accounting is current and has no due boundary.
    function property_completeAccountingStatus() public {
        _assertCompleteAccountingStatus(fixedTier);
        _assertCompleteAccountingStatus(contributionTier);
    }

    function _assertAccountingConservation(MembershipTier target) internal {
        MembershipTypes.PaymentTotals memory totals = target.previewPaymentTotals(64);
        uint256 scale = target.ACCOUNTING_SCALE();
        uint256 accounted = totals.refunded * scale + _scaledLiabilities(totals);
        for (uint256 i; i < 4; ++i) {
            accounted += totals.paidRaw[i] * scale;
        }
        eq(accounted, totals.grossReceived * scale, "GL-01 accounting conservation");
    }

    function _assertTierSolvency(MembershipTier target) internal {
        eq(
            paymentToken.balanceOf(address(target)),
            target.totalProtectedLiability() + ghosts.donatedByTier[address(target)],
            "GL-02 tier custody"
        );
    }

    function _assertRewardShareDenominator(MembershipTier target) internal {
        uint256 shareSum;
        uint256 activeEligibleShareSum;
        uint256 supply = target.totalSupply();
        for (uint256 i; i < supply; ++i) {
            uint256 tokenId = target.tokenByIndex(i);
            uint256 shares = target.sharesOf(tokenId);
            shareSum += shares;
            if (target.rewardEligible(tokenId)) activeEligibleShareSum += shares;
        }
        eq(shareSum, target.totalRewardShares(), "GL-03 share denominator");
        if (target.accountingStatus().complete) {
            eq(activeEligibleShareSum, target.totalRewardShares(), "GL-03 complete eligible shares");
        }
    }

    function _assertOccupiedSupplySync(MembershipTier target) internal {
        eq(target.occupiedSupply(), target.totalSupply(), "GL-04 occupied supply");
    }

    function _assertExpirationScheduleSync(MembershipTier target) internal {
        eq(
            target.accountingStatus().scheduledExpirations,
            target.occupiedSupply(),
            "GL-05 expiration schedule"
        );
    }

    function _assertMintedRetiredCounts(MembershipTier target) internal {
        address tierAddress = address(target);
        uint256 minted = target.totalMinted();
        eq(minted, ghosts.mintedCountByTier[tierAddress], "GL-06 creation count");
        eq(
            minted,
            target.totalSupply() + ghosts.retiredCountByTier[tierAddress],
            "GL-06 retirement count"
        );
    }

    function _assertProtectedLiabilityCeiling(MembershipTier target) internal {
        MembershipTypes.PaymentTotals memory totals = target.previewPaymentTotals(64);
        uint256 scale = target.ACCOUNTING_SCALE();
        uint256 scaled = _scaledLiabilities(totals);
        uint256 ceiling = (scaled + scale - 1) / scale;
        eq(target.totalProtectedLiability(), ceiling, "GL-09 liability ceiling");
    }

    function _assertLifetimeGrossMonotonic(MembershipTier target) internal {
        address tierAddress = address(target);
        uint256 current = target.lifetimeGross();
        gte(
            current, ghosts.beforeLifetimeGrossByTier[tierAddress], "GL-10 lifetime gross decreased"
        );
        ghosts.beforeLifetimeGrossByTier[tierAddress] = current;
    }

    function _assertTotalMintedMonotonic(MembershipTier target) internal {
        address tierAddress = address(target);
        uint256 current = target.totalMinted();
        gte(current, ghosts.beforeTotalMintedByTier[tierAddress], "GL-11 total minted decreased");
        eq(current, ghosts.mintedCountByTier[tierAddress], "GL-11 unexpected mint action");
        ghosts.beforeTotalMintedByTier[tierAddress] = current;
    }

    function _assertAccountedThroughMonotonic(MembershipTier target) internal {
        address tierAddress = address(target);
        uint64 current = target.accountingStatus().accountedThrough;
        gte(
            current,
            ghosts.beforeAccountedThroughByTier[tierAddress],
            "GL-12 accounting cursor decreased"
        );
        ghosts.beforeAccountedThroughByTier[tierAddress] = current;
    }

    function _assertRewardPerShareMonotonic(MembershipTier target) internal {
        address tierAddress = address(target);
        uint256 current = target.rewardPerShare();
        gte(current, ghosts.beforeRewardPerShareByTier[tierAddress], "GL-14 reward index decreased");
        ghosts.beforeRewardPerShareByTier[tierAddress] = current;
    }

    function _assertOwnershipOccupancySync(MembershipTier target) internal {
        uint256 supply = target.totalSupply();
        for (uint256 i; i < supply; ++i) {
            uint256 tokenId = target.tokenByIndex(i);
            (bool exists,) = _safeOwner(target, tokenId);
            t(exists, "GL-15 extant token unowned");
            t(target.isOccupied(tokenId), "GL-15 extant token unoccupied");
            if (target.isActiveToken(tokenId)) {
                t(exists && target.isOccupied(tokenId), "GL-15 active token detached");
            }
        }

        uint256 minted = target.totalMinted();
        uint256 first = minted > 16 ? minted - 15 : 1;
        for (uint256 tokenId = first; tokenId <= minted && minted != 0; ++tokenId) {
            (bool exists,) = _safeOwner(target, tokenId);
            bool occupied = target.isOccupied(tokenId);
            eq(occupied ? 1 : 0, exists ? 1 : 0, "GL-15 sampled ownership occupancy");
            if (target.isActiveToken(tokenId)) {
                t(occupied && exists, "GL-15 sampled active token detached");
            }
        }
    }

    function _assertSupplyCap(MembershipTier target) internal {
        uint256 cap = target.supplyCap();
        if (cap != 0) lte(target.occupiedSupply(), cap, "GL-16 supply cap");
    }

    function _assertRewardEligibility(MembershipTier target) internal {
        uint256 supply = target.totalSupply();
        for (uint256 i; i < supply; ++i) {
            uint256 tokenId = target.tokenByIndex(i);
            if (!target.rewardEligible(tokenId)) continue;
            (bool exists,) = _safeOwner(target, tokenId);
            t(target.isActiveToken(tokenId), "GL-17 eligible token inactive");
            t(target.isOccupied(tokenId), "GL-17 eligible token unoccupied");
            t(exists, "GL-17 eligible token unowned");
            gt(target.sharesOf(tokenId), 0, "GL-17 eligible token has no shares");
        }
    }

    function _assertERC721Enumeration(MembershipTier target) internal {
        uint256 supply = target.totalSupply();
        for (uint256 i; i < supply; ++i) {
            uint256 tokenId = target.tokenByIndex(i);
            for (uint256 j; j < i; ++j) {
                neq(tokenId, target.tokenByIndex(j), "GL-18 duplicate global token");
            }
            (bool exists, address owner_) = _safeOwner(target, tokenId);
            t(exists, "GL-18 enumerated token unowned");
            uint256 ownerBalance = target.balanceOf(owner_);
            bool found;
            for (uint256 j; j < ownerBalance; ++j) {
                uint256 ownedId = target.tokenOfOwnerByIndex(owner_, j);
                (bool ownedExists, address enumeratedOwner) = _safeOwner(target, ownedId);
                t(ownedExists && enumeratedOwner == owner_, "GL-18 owner enumeration mismatch");
                if (ownedId == tokenId) found = true;
                for (uint256 k; k < j; ++k) {
                    neq(
                        ownedId,
                        target.tokenOfOwnerByIndex(owner_, k),
                        "GL-18 duplicate owner token"
                    );
                }
            }
            t(found, "GL-18 global token missing from owner enumeration");
        }
    }

    function _assertInterfaces(MembershipTier target) internal {
        t(target.supportsInterface(type(IERC721).interfaceId), "GL-19 ERC721");
        t(target.supportsInterface(type(IERC721Enumerable).interfaceId), "GL-19 ERC721Enumerable");
        t(target.supportsInterface(type(IERC5643).interfaceId), "GL-19 ERC5643");
        t(target.supportsInterface(0x49064906), "GL-19 ERC4906");
        t(target.supportsInterface(type(IMembershipTier).interfaceId), "GL-19 tier interface");
    }

    function _assertCompleteAccountingStatus(MembershipTier target) internal {
        MembershipTypes.AccountingStatus memory status = target.accountingStatus();
        if (!status.complete) return;
        eq(status.accountedThrough, block.timestamp, "GL-20 stale complete cursor");
        // forge-lint: disable-start(block-timestamp)
        t(
            status.nextBoundary == 0 || status.nextBoundary > block.timestamp,
            "GL-20 due complete boundary"
        );
        // forge-lint: disable-end(block-timestamp)
    }

    function _scaledLiabilities(MembershipTypes.PaymentTotals memory totals)
        internal
        pure
        returns (uint256 scaled)
    {
        scaled = totals.unassignedMemberScaled + totals.distributionDustScaled
            + totals.indexCarryScaled;
        for (uint256 i; i < 4; ++i) {
            scaled += totals.earnedScaled[i] + totals.unearnedScaled[i]
            + totals.cancellationScaled[i];
        }
    }

    function _safeOwner(MembershipTier target, uint256 tokenId)
        internal
        view
        returns (bool exists, address owner_)
    {
        (bool success, bytes memory result) =
            address(target).staticcall(abi.encodeWithSelector(target.ownerOf.selector, tokenId));
        if (!success || result.length < 32) return (false, address(0));
        owner_ = abi.decode(result, (address));
        exists = owner_ != address(0);
    }

    // ――――――――――――――――――― Specific properties ――――――――――――――――――――
    // These properties must hold after specific function calls.
    // They MUST BE INTERNAL and called at the end of the relevant handlers.

    /// @notice SP-01: Nonzero payments append one fully allocated lot and advance gross.
    function property_paymentAppendsLot(
        uint256 gross,
        uint256 lifetimeBefore,
        uint256 lifetimeAfter,
        uint256 lotsBefore,
        uint256 lotsAfter,
        uint256 lotGross,
        uint256 allocationSum
    ) internal {
        gt(gross, 0, "SP-01 zero payment");
        eq(lifetimeAfter, lifetimeBefore + gross, "SP-01 lifetime gross delta");
        eq(lotsAfter, lotsBefore + 1, "SP-01 lot count delta");
        eq(lotGross, gross, "SP-01 lot gross");
        eq(allocationSum, gross, "SP-01 allocation sum");
    }

    /// @notice SP-02: Protocol fee release moves and records the exact returned amount.
    function property_protocolFeeRelease(
        uint256 amount,
        uint256 tierBefore,
        uint256 tierAfter,
        uint256 vaultBefore,
        uint256 vaultAfter,
        uint256 paidBefore,
        uint256 paidAfter
    ) internal {
        eq(tierBefore - tierAfter, amount, "SP-02 tier debit");
        eq(vaultAfter - vaultBefore, amount, "SP-02 vault credit");
        eq(paidAfter - paidBefore, amount, "SP-02 paidRaw delta");
    }

    /// @notice SP-03: Refund accounting preserves gross and moves the exact return.
    function property_refundAccounting(bytes32 expectedHash, bytes32 actualHash) internal {
        eq(uint256(actualHash), uint256(expectedHash), "SP-03 refund accounting");
    }

    /// @notice SP-04: Immediate self purchase and refund cannot create profit.
    function property_purchaseRefundRoundTrip(
        uint256 balanceBefore,
        uint256 refundableBefore,
        uint256 balanceAfter
    ) internal {
        lte(balanceAfter, balanceBefore + refundableBefore, "SP-04 round-trip profit");
    }

    /// @notice SP-05: Gift and refund cannot increase aggregate payer-recipient wealth.
    function property_giftRefundRoundTrip(
        uint256 combinedBefore,
        uint256 combinedAfter,
        uint256 recipientDelta,
        uint256 refundAmount
    ) internal {
        lte(combinedAfter, combinedBefore, "SP-05 aggregate gift profit");
        eq(recipientDelta, refundAmount, "SP-05 refund recipient");
    }

    /// @notice SP-06: Repeated purchase-refund cycles cannot extract payment-token dust.
    function property_repeatedRefundCycles(uint256 balanceBefore, uint256 balanceAfter) internal {
        lte(balanceAfter, balanceBefore, "SP-06 repeated-cycle profit");
    }

    /// @notice SP-07: Immediate grant revocation returns exact seconds and moves no tokens.
    function property_grantRevokeRoundTrip(
        uint256 expectedSeconds,
        uint256 revokedSeconds,
        uint256 balanceBefore,
        uint256 balanceAfter
    ) internal {
        eq(revokedSeconds, expectedSeconds, "SP-07 revoked seconds");
        eq(balanceAfter, balanceBefore, "SP-07 token movement");
    }

    /// @notice SP-08: A to B to A transfer preserves the economic position.
    function property_transferRoundTrip(
        bytes32 stateBeforeHash,
        bytes32 stateAfterHash,
        uint256 combinedBefore,
        uint256 combinedAfter
    ) internal {
        eq(uint256(stateAfterHash), uint256(stateBeforeHash), "SP-08 position state");
        eq(combinedAfter, combinedBefore, "SP-08 token balances");
    }

    /// @notice SP-09: Share preview exactly predicts issuance and the gross cursor.
    function property_sharePreviewMatchesIssue(
        uint256 quotedShares,
        uint256 sharesBefore,
        uint256 sharesAfter,
        uint256 quotedGrossAfter,
        uint256 lifetimeAfter
    ) internal {
        eq(sharesAfter - sharesBefore, quotedShares, "SP-09 issued shares");
        eq(lifetimeAfter, quotedGrossAfter, "SP-09 gross cursor");
    }

    /// @notice SP-10: Share quotes are zero-safe, positive, and monotone.
    function property_shareQuoteShape(
        uint256 zeroShares,
        uint256 zeroGrossBefore,
        uint256 zeroGrossAfter,
        uint256 smallGross,
        uint256 smallShares,
        uint256 largeGross,
        uint256 largeShares
    ) internal {
        eq(zeroShares, 0, "SP-10 zero shares");
        eq(zeroGrossAfter, zeroGrossBefore, "SP-10 zero cursor");
        gte(largeGross, smallGross, "SP-10 invalid sample order");
        gte(largeShares, smallShares, "SP-10 nonmonotone quote");
        if (smallGross != 0) gt(smallShares, 0, "SP-10 zero positive quote");
        if (largeGross != 0) gt(largeShares, 0, "SP-10 zero positive quote");
    }

    /// @notice SP-11: Payment allocation uses exact BPS floors and creator residual.
    function property_paymentAllocationRounding(
        uint256 gross,
        uint256 creatorAmount,
        uint256 memberAmount,
        uint256 referralAmount,
        uint256 protocolAmount,
        uint256 memberBps,
        uint256 referralBps,
        uint256 protocolBps,
        bool hasReferrer
    ) internal {
        eq(creatorAmount + memberAmount + referralAmount + protocolAmount, gross, "SP-11 sum");
        eq(memberAmount, gross * memberBps / 10_000, "SP-11 member floor");
        eq(protocolAmount, gross * protocolBps / 10_000, "SP-11 protocol floor");
        eq(referralAmount, hasReferrer ? gross * referralBps / 10_000 : 0, "SP-11 referral floor");
        eq(
            creatorAmount,
            gross - memberAmount - referralAmount - protocolAmount,
            "SP-11 creator residual"
        );
    }

    /// @notice SP-12: Renewal preserves identity and exactly extends, charges, and issues.
    function property_renewalExactness(bytes32 expectedHash, bytes32 actualHash) internal {
        eq(uint256(actualHash), uint256(expectedHash), "SP-12 renewal exactness");
    }

    /// @notice SP-13: Reliable refund preview exactly matches mutation and scaled funding.
    function property_refundPreviewMatches(
        uint256 previewAmount,
        uint256 actualAmount,
        uint256 fundedScaled,
        uint256 scale,
        uint256 recipientDelta
    ) internal {
        eq(actualAmount, previewAmount, "SP-13 refund amount");
        eq(fundedScaled, previewAmount * scale, "SP-13 scaled funding");
        eq(recipientDelta, previewAmount, "SP-13 recipient delta");
    }

    /// @notice SP-14: Accounting preview matches bounded processing and settled state.
    function property_accountingPreviewMatches(
        uint256 previewSteps,
        uint256 actualSteps,
        bytes32 previewStatusHash,
        bytes32 actualStatusHash,
        bytes32 previewBalancesHash,
        bytes32 settledBalancesHash
    ) internal {
        eq(actualSteps, previewSteps, "SP-14 processed steps");
        eq(uint256(actualStatusHash), uint256(previewStatusHash), "SP-14 status");
        eq(uint256(settledBalancesHash), uint256(previewBalancesHash), "SP-14 balances");
    }

    /// @notice SP-15: Payment totals preview matches post-process totals.
    function property_paymentTotalsPreviewMatches(
        uint256 previewSteps,
        uint256 actualSteps,
        bytes32 previewHash,
        bytes32 settledHash
    ) internal {
        eq(actualSteps, previewSteps, "SP-15 processed steps");
        eq(uint256(settledHash), uint256(previewHash), "SP-15 totals");
    }

    /// @notice SP-16: Complete claim preview matches raw payouts and beneficiary delta.
    function property_claimPreviewMatches(
        uint256 previewSteps,
        uint256 actualSteps,
        uint256 expectedLive,
        uint256 actualLive,
        uint256 expectedRetired,
        uint256 actualRetired,
        uint256 expectedReferral,
        uint256 actualReferral,
        uint256 expectedCreator,
        uint256 actualCreator,
        uint256 beneficiaryDelta
    ) internal {
        eq(actualSteps, previewSteps, "SP-16 processed steps");
        eq(actualLive, expectedLive, "SP-16 live reward");
        eq(actualRetired, expectedRetired, "SP-16 retired reward");
        eq(actualReferral, expectedReferral, "SP-16 referral");
        eq(actualCreator, expectedCreator, "SP-16 creator");
        eq(
            beneficiaryDelta,
            expectedLive + expectedRetired + expectedReferral + expectedCreator,
            "SP-16 payout delta"
        );
    }

    /// @notice SP-17: Tier creation atomically records count, salt, registration, and identity.
    function property_tierCreationIdentity(
        uint256 countBefore,
        uint256 countAfter,
        bool saltUsed,
        bool registered,
        bytes32 predicted,
        bytes32 deployed,
        address reverseMapped,
        address created
    ) internal {
        eq(countAfter, countBefore + 1, "SP-17 tier count");
        t(saltUsed, "SP-17 salt unused");
        t(registered, "SP-17 tier unregistered");
        eq(uint256(deployed), uint256(predicted), "SP-17 identity");
        eq(uint256(uint160(reverseMapped)), uint256(uint160(created)), "SP-17 reverse map");
    }

    /// @notice SP-18: A locked referral remains immutable while the token exists.
    function property_referralImmutable(
        uint256 statusBefore,
        address referrerBefore,
        uint256 statusAfter,
        address referrerAfter
    ) internal {
        eq(statusAfter, statusBefore, "SP-18 referral status");
        eq(uint256(uint160(referrerAfter)), uint256(uint160(referrerBefore)), "SP-18 referrer");
    }

    /// @notice SP-19: Fixed creation increments membership and recipient counts exactly once.
    function property_fixedCreationCounts(
        uint256 mintedBefore,
        uint256 mintedAfter,
        uint256 supplyBefore,
        uint256 supplyAfter,
        uint256 occupiedBefore,
        uint256 occupiedAfter,
        uint256 ownerBalanceBefore,
        uint256 ownerBalanceAfter
    ) internal {
        eq(mintedAfter, mintedBefore + 1, "SP-19 minted");
        eq(supplyAfter, supplyBefore + 1, "SP-19 supply");
        eq(occupiedAfter, occupiedBefore + 1, "SP-19 occupancy");
        eq(ownerBalanceAfter, ownerBalanceBefore + 1, "SP-19 owner balance");
    }

    /// @notice SP-20: Zero-gross contribution creates access without funding or shares.
    function property_zeroGrossCreation(
        uint256 lifetimeBefore,
        uint256 lifetimeAfter,
        uint256 shares,
        uint256 lots,
        uint256 paidSeconds,
        uint256 periodDuration,
        uint256 actorBalanceBefore,
        uint256 actorBalanceAfter
    ) internal {
        eq(lifetimeAfter, lifetimeBefore, "SP-20 lifetime gross");
        eq(shares, 0, "SP-20 shares");
        eq(lots, 0, "SP-20 funding lot");
        eq(paidSeconds, periodDuration, "SP-20 paid seconds");
        eq(actorBalanceAfter, actorBalanceBefore, "SP-20 token balance");
    }

    /// @notice SP-21: Live transfer changes ownership only, preserving economic state.
    function property_transferPreservesPosition(bytes32 expectedHash, bytes32 actualHash) internal {
        eq(uint256(actualHash), uint256(expectedHash), "SP-21 transfer state");
    }

    /// @notice SP-22: Refund retires one position without reducing total minted.
    function property_refundRetiresPosition(
        bool tokenExistsAfter,
        bytes32 expectedCountsHash,
        bytes32 actualCountsHash
    ) internal {
        t(!tokenExistsAfter, "SP-22 token still exists");
        eq(uint256(actualCountsHash), uint256(expectedCountsHash), "SP-22 counts");
    }

    /// @notice SP-23: Grant creates an occupied zero-paid zero-share membership.
    function property_grantCreation(
        uint256 grantSeconds,
        uint256 expectedSeconds,
        uint256 paidSeconds,
        uint256 shares,
        bool occupied,
        uint256 supplyBefore,
        uint256 supplyAfter
    ) internal {
        eq(grantSeconds, expectedSeconds, "SP-23 grant seconds");
        eq(paidSeconds, 0, "SP-23 paid seconds");
        eq(shares, 0, "SP-23 shares");
        t(occupied, "SP-23 not occupied");
        eq(supplyAfter, supplyBefore + 1, "SP-23 supply");
    }

    /// @notice SP-24: Grant revocation clears grant and retires only grant-only positions.
    function property_revokeGrantBranch(
        uint256 paidSecondsBefore,
        uint256 grantSecondsAfter,
        bool tokenExistsAfter,
        uint256 supplyBefore,
        uint256 supplyAfter
    ) internal {
        eq(grantSecondsAfter, 0, "SP-24 grant not cleared");
        if (paidSecondsBefore == 0) {
            t(!tokenExistsAfter, "SP-24 grant-only token exists");
            eq(supplyAfter + 1, supplyBefore, "SP-24 grant-only supply");
        } else {
            t(tokenExistsAfter, "SP-24 paid token retired");
            eq(supplyAfter, supplyBefore, "SP-24 paid-token supply");
        }
    }

    /// @notice SP-25: Accounting progress is bounded, monotone, and retirement-consistent.
    function property_accountingProgress(
        uint256 maxSteps,
        uint256 processedSteps,
        uint256 retiredCount,
        uint256 accountedBefore,
        uint256 accountedAfter,
        uint256 supplyBefore,
        uint256 supplyAfter,
        bool complete,
        uint256 nextBoundary,
        uint256 currentTimestamp
    ) internal {
        lte(processedSteps, maxSteps, "SP-25 step bound");
        gte(accountedAfter, accountedBefore, "SP-25 cursor regressed");
        eq(supplyAfter + retiredCount, supplyBefore, "SP-25 retirement count");
        if (complete) {
            t(nextBoundary == 0 || nextBoundary > currentTimestamp, "SP-25 due boundary");
        }
    }

    /// @notice SP-26: Payment-token listing and enablement flags remain consistent.
    function property_paymentTokenEnablement(
        bool enabledRequested,
        bool listedBefore,
        bool listedAfter,
        bool enabledAfter,
        uint256 countBefore,
        uint256 countAfter
    ) internal {
        t(listedAfter, "SP-26 token not listed");
        eq(enabledAfter ? 1 : 0, enabledRequested ? 1 : 0, "SP-26 enabled flag");
        eq(countAfter, countBefore + (!listedBefore && enabledRequested ? 1 : 0), "SP-26 count");
    }

    /// @notice SP-27: Extant token shares never decrease and only payment may increase them.
    function property_extantSharesMonotonic(
        uint256 sharesBefore,
        uint256 sharesAfter,
        bool positivePayment
    ) internal {
        gte(sharesAfter, sharesBefore, "SP-27 shares decreased");
        if (!positivePayment) {
            eq(sharesAfter, sharesBefore, "SP-27 shares changed without payment");
        }
    }

    /// @notice SP-28: Non-owner factory administration reverts without state mutation.
    function property_factoryAdminGuards(bool success, bytes32 beforeHash, bytes32 afterHash)
        internal
    {
        t(!success, "SP-28 unauthorized factory call succeeded");
        eq(uint256(afterHash), uint256(beforeHash), "SP-28 factory state changed");
    }

    /// @notice SP-29: Non-owner tier administration reverts without state mutation.
    function property_tierAdminGuards(bool success, bytes32 beforeHash, bytes32 afterHash)
        internal
    {
        t(!success, "SP-29 unauthorized tier call succeeded");
        eq(uint256(afterHash), uint256(beforeHash), "SP-29 tier state changed");
    }

    /// @notice SP-30: Non-owner renewal and claim attempts are rejected.
    function property_foreignOwnerGuards(bool renewSuccess, bool claimSuccess) internal {
        t(!renewSuccess, "SP-30 foreign renewal succeeded");
        t(!claimSuccess, "SP-30 foreign claim succeeded");
    }

    /// @notice SP-31: Non-factory callers cannot invoke delegated claims.
    function property_claimFactoryGuard(bool success) internal {
        t(!success, "SP-31 non-factory delegated claim succeeded");
    }

    /// @notice SP-32: Expired positions reject transfer, renewal, and grant extension.
    function property_expiredGuards(bool transferSuccess, bool renewSuccess, bool grantSuccess)
        internal
    {
        t(!transferSuccess, "SP-32 expired transfer succeeded");
        t(!renewSuccess, "SP-32 expired renewal succeeded");
        t(!grantSuccess, "SP-32 expired grant succeeded");
    }

    /// @notice SP-33: Duplicate creator salt is rejected without registry mutation.
    function property_duplicateSaltGuard(
        bool success,
        uint256 countBefore,
        uint256 countAfter,
        address mappedBefore,
        address mappedAfter
    ) internal {
        t(!success, "SP-33 duplicate salt succeeded");
        eq(countAfter, countBefore, "SP-33 tier count changed");
        eq(uint256(uint160(mappedAfter)), uint256(uint160(mappedBefore)), "SP-33 map changed");
    }

    /// @notice SP-34: Pause blocks entry while maintenance and exits remain callable.
    function property_pausedExitLiveness(
        bool purchaseSuccess,
        bool maintenanceSuccess,
        bool claimSuccess,
        bool feeReleaseSuccess,
        bool refundSuccess
    ) internal {
        t(!purchaseSuccess, "SP-34 paused purchase succeeded");
        t(maintenanceSuccess, "SP-34 maintenance blocked");
        t(claimSuccess, "SP-34 claim blocked");
        t(feeReleaseSuccess, "SP-34 fee release blocked");
        t(refundSuccess, "SP-34 refund blocked");
    }

    /// @notice SP-35: One due boundary can be processed with one step.
    function property_dueBoundaryLiveness(bool success, uint256 processedSteps) internal {
        t(success, "SP-35 due processing reverted");
        eq(processedSteps, 1, "SP-35 processed steps");
    }

    /// @notice SP-36: A complete nonzero valid claim remains executable.
    function property_claimLiveness(bool success, uint256 expected, uint256 paid) internal {
        t(success, "SP-36 claim reverted");
        eq(paid, expected, "SP-36 claim payout");
    }

    /// @notice SP-37: Gift payment cannot change a recipient referral selection.
    function property_giftReferralIsolation(
        uint256 statusBefore,
        address referrerBefore,
        uint256 statusAfter,
        address referrerAfter
    ) internal {
        eq(statusAfter, statusBefore, "SP-37 referral status");
        eq(uint256(uint160(referrerAfter)), uint256(uint160(referrerBefore)), "SP-37 referrer");
    }

    /// @notice SP-38: Effective paid time respects the configured prepaid limit.
    function property_prepaidLimit(
        uint256 paidSeconds,
        uint256 maximumPeriods,
        uint256 periodDuration
    ) internal {
        if (maximumPeriods != 0) {
            lte(paidSeconds, maximumPeriods * periodDuration, "SP-38 prepaid limit");
        }
    }

    /// @notice SP-39: Over-capacity payment reverts atomically.
    function property_curveCapacityGuard(
        bool success,
        bytes32 beforeHash,
        bytes32 afterHash,
        uint256 balanceBefore,
        uint256 balanceAfter
    ) internal {
        t(!success, "SP-39 over-capacity payment succeeded");
        eq(uint256(afterHash), uint256(beforeHash), "SP-39 state changed");
        eq(balanceAfter, balanceBefore, "SP-39 balance changed");
    }

    /// @notice SP-40: Invalid claim selections revert without consuming credit.
    function property_claimSelectionGuard(bool success, bytes32 beforeHash, bytes32 afterHash)
        internal
    {
        t(!success, "SP-40 invalid claim succeeded");
        eq(uint256(afterHash), uint256(beforeHash), "SP-40 credit changed");
    }

    /// @notice SP-41: Direct donation does not create membership economics or donor interest.
    function property_donationIsolation(
        uint256 lifetimeBefore,
        uint256 lifetimeAfter,
        uint256 sharesBefore,
        uint256 sharesAfter,
        uint256 liabilityBefore,
        uint256 liabilityAfter,
        bool interestBefore,
        bool interestAfter
    ) internal {
        eq(lifetimeAfter, lifetimeBefore, "SP-41 lifetime gross");
        eq(sharesAfter, sharesBefore, "SP-41 shares");
        eq(liabilityAfter, liabilityBefore, "SP-41 liability");
        eq(interestAfter ? 1 : 0, interestBefore ? 1 : 0, "SP-41 claim interest");
    }

    /// @notice SP-42: Full-balance contribution creates positive weight without trapping claims.
    function property_fullBalanceContribution(
        uint256 balanceAfter,
        uint256 shares,
        bool hasClaimInterest
    ) internal {
        eq(balanceAfter, 0, "SP-42 full balance not spent");
        gt(shares, 0, "SP-42 no shares");
        t(hasClaimInterest, "SP-42 no claim interest");
    }

    /// @notice SP-43: Per-token approval permits transfer and is cleared afterward.
    function property_approvedTransfer(
        address ownerAfter,
        address expectedOwner,
        address approvalAfter
    ) internal {
        eq(uint256(uint160(ownerAfter)), uint256(uint160(expectedOwner)), "SP-43 owner");
        eq(uint256(uint160(approvalAfter)), 0, "SP-43 approval not cleared");
    }

    /// @notice SP-44: Operator approval authorizes transfer and revocation clears the pair.
    function property_operatorTransfer(
        address ownerAfter,
        address expectedOwner,
        bool approvalAfter
    ) internal {
        eq(uint256(uint160(ownerAfter)), uint256(uint160(expectedOwner)), "SP-44 owner");
        t(!approvalAfter, "SP-44 operator approval remains");
    }

    /// @notice SP-45: Self-transfer preserves state and clears token approval.
    function property_selfTransfer(
        bytes32 stateBeforeHash,
        bytes32 stateAfterHash,
        uint256 balanceBefore,
        uint256 balanceAfter,
        address approvalAfter
    ) internal {
        eq(uint256(stateAfterHash), uint256(stateBeforeHash), "SP-45 state");
        eq(balanceAfter, balanceBefore, "SP-45 balance");
        eq(uint256(uint160(approvalAfter)), 0, "SP-45 approval");
    }

    /// @notice SP-46: Safe transfer accepts receivers and atomically rejects nonreceivers.
    function property_safeTransferReceiver(
        bool receiverSuccess,
        address receiverOwner,
        address expectedReceiver,
        bool nonReceiverSuccess,
        bytes32 beforeFailedHash,
        bytes32 afterFailedHash
    ) internal {
        t(receiverSuccess, "SP-46 receiver transfer failed");
        eq(
            uint256(uint160(receiverOwner)),
            uint256(uint160(expectedReceiver)),
            "SP-46 receiver owner"
        );
        t(!nonReceiverSuccess, "SP-46 nonreceiver transfer succeeded");
        eq(uint256(afterFailedHash), uint256(beforeFailedHash), "SP-46 failed transfer mutated");
    }

    /// @notice SP-47: Sound renewable signal permits one-period renewal.
    function property_renewableSoundness(
        bool renewable,
        bool success,
        uint256 expirationBefore,
        uint256 expirationAfter,
        uint256 periodDuration
    ) internal {
        t(renewable, "SP-47 false precondition");
        t(success, "SP-47 renewable call failed");
        eq(expirationAfter, expirationBefore + periodDuration, "SP-47 expiration");
    }

    /// @notice SP-48: Adjacent allocation lots have positive duration and do not overlap.
    function property_allocationOrder(
        uint256 firstStart,
        uint256 firstEnd,
        uint256 secondStart,
        uint256 secondEnd
    ) internal {
        gt(firstEnd, firstStart, "SP-48 first duration");
        gt(secondEnd, secondStart, "SP-48 second duration");
        gte(secondStart, firstEnd, "SP-48 overlap");
    }

    /// @notice SP-49: Allocation cursor is bounded and consumed queues have no reserve.
    function property_allocationCursor(
        uint256 cursor,
        uint256 count,
        uint256 refundableGross,
        uint256 unearnedSum
    ) internal {
        lte(cursor, count, "SP-49 cursor");
        if (cursor == count) {
            eq(refundableGross, 0, "SP-49 refundable gross");
            eq(unearnedSum, 0, "SP-49 unearned allocation");
        }
    }

    /// @notice SP-50: Allocation lot canceled flag exactly reflects generation mismatch.
    function property_allocationGeneration(
        uint256 sampledGeneration,
        uint256 currentGeneration,
        bool canceled
    ) internal {
        eq(canceled ? 1 : 0, sampledGeneration == currentGeneration ? 0 : 1, "SP-50 canceled flag");
    }
}
