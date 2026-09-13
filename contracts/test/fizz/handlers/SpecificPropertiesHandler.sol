// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import "../Base.sol";
import {Properties} from "../Properties.sol";

contract FizzNonReceiver {}

/// @notice Operation-gated sequences that exercise the synthesized specific properties.
abstract contract SpecificPropertiesHandler is Properties {
    function membershipTier_probePaidCreation(uint64 periods, address referralEntropy) public {
        if (
            fixedTier.paused() || !_hasSpecificCapacity(fixedTier)
                || !fixedTier.accountingStatus().complete
        ) return;
        periods = 1 + periods % 3;
        uint256 gross = fixedTier.pricePerPeriod() * periods;
        if (paymentToken.balanceOf(actor) < gross) return;

        MembershipTypes.ShareQuote memory quote = fixedTier.previewShares(gross);
        uint256 lifetimeBefore = fixedTier.lifetimeGross();
        uint256 mintedBefore = fixedTier.totalMinted();
        uint256 supplyBefore = fixedTier.totalSupply();
        uint256 occupiedBefore = fixedTier.occupiedSupply();
        uint256 ownerBalanceBefore = fixedTier.balanceOf(actor);

        vm.prank(actor);
        uint256 tokenId =
            fixedTier.createMembership(periods, _specificReferrer(referralEntropy), 64);
        ++ghosts.mintedCountByTier[address(fixedTier)];

        MembershipTypes.AllocationState memory allocation = fixedTier.allocationState(tokenId);
        MembershipTypes.AllocationLot[] memory lots =
            fixedTier.allocationLots(tokenId, allocation.generation, allocation.lotCount - 1, 1);
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            sum += lots[0].allocations[i];
        }
        property_paymentAppendsLot(
            gross,
            lifetimeBefore,
            fixedTier.lifetimeGross(),
            0,
            allocation.lotCount,
            lots[0].gross,
            sum
        );
        property_sharePreviewMatchesIssue(
            quote.sharesAdded,
            0,
            fixedTier.sharesOf(tokenId),
            quote.grossAfter,
            fixedTier.lifetimeGross()
        );
        property_paymentAllocationRounding(
            lots[0].gross,
            lots[0].allocations[0],
            lots[0].allocations[1],
            lots[0].allocations[2],
            lots[0].allocations[3],
            fixedTier.rewardBps(),
            fixedTier.referralBps(),
            fixedTier.protocolFeeBps(),
            lots[0].referrer != address(0)
        );
        property_fixedCreationCounts(
            mintedBefore,
            fixedTier.totalMinted(),
            supplyBefore,
            fixedTier.totalSupply(),
            occupiedBefore,
            fixedTier.occupiedSupply(),
            ownerBalanceBefore,
            fixedTier.balanceOf(actor)
        );
        _syncSpecificGhosts(fixedTier);
    }

    function membershipTier_releaseProtocolFeesChecked(bool contribution) public {
        MembershipTier target = _specificTier(contribution);
        MembershipTypes.PaymentTotals memory beforeTotals = target.previewPaymentTotals(0);
        uint256 tierBefore = paymentToken.balanceOf(address(target));
        uint256 vaultBefore = paymentToken.balanceOf(target.buybackVault());
        uint256 amount = target.releaseProtocolFees();
        MembershipTypes.PaymentTotals memory afterTotals = target.previewPaymentTotals(0);
        property_protocolFeeRelease(
            amount,
            tierBefore,
            paymentToken.balanceOf(address(target)),
            vaultBefore,
            paymentToken.balanceOf(target.buybackVault()),
            beforeTotals.paidRaw[3],
            afterTotals.paidRaw[3]
        );
    }

    function membershipTier_refundAccountingChecked(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        if (!target.accountingStatus().complete) return;
        (uint256 tokenId, address owner) = _specificLiveToken(target, seed);
        if (tokenId == 0) return;
        MembershipTypes.PaymentTotals memory beforeTotals = target.previewPaymentTotals(0);
        uint256 recipientBefore = paymentToken.balanceOf(owner);
        uint256 tierBefore = paymentToken.balanceOf(address(target));
        uint256 lifetimeBefore = target.lifetimeGross();
        uint256 mintedBefore = target.totalMinted();
        uint256 supplyBefore = target.totalSupply();
        uint256 occupiedBefore = target.occupiedSupply();
        vm.prank(creator);
        uint256 amount = target.refund(tokenId, owner, type(uint256).max, 64);
        ++ghosts.retiredCountByTier[address(target)];
        MembershipTypes.PaymentTotals memory afterTotals = target.previewPaymentTotals(0);
        property_refundAccounting(
            keccak256(
                abi.encode(
                    beforeTotals.refunded + amount,
                    recipientBefore + amount,
                    tierBefore - amount,
                    lifetimeBefore
                )
            ),
            _specificRefundHash(target, owner, afterTotals.refunded)
        );
        property_refundRetiresPosition(
            _specificTokenExists(target, tokenId),
            keccak256(abi.encode(mintedBefore, supplyBefore - 1, occupiedBefore - 1)),
            _specificCountHash(target)
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_roundTripPurchaseRefund(bool contribution, uint256 amount) public {
        MembershipTier target = _specificTier(contribution);
        if (target.paused() || !_hasSpecificCapacity(target)) return;
        uint256 gross = contribution ? 1 + amount % 100e6 : target.pricePerPeriod();
        if (paymentToken.balanceOf(actor) < gross) return;
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        uint256 tokenId;
        vm.startPrank(actor);
        if (contribution) {
            tokenId = target.createContributionMembership(gross, address(0), 64);
        } else {
            tokenId = target.createMembership(1, address(0), 64);
        }
        vm.stopPrank();
        ++ghosts.mintedCountByTier[address(target)];
        vm.prank(creator);
        target.refund(tokenId, actor, type(uint256).max, 64);
        ++ghosts.retiredCountByTier[address(target)];
        property_purchaseRefundRoundTrip(balanceBefore, 0, paymentToken.balanceOf(actor));
        _syncSpecificGhosts(target);
    }

    function membershipTier_roundTripGiftRefund(uint64 periods, address recipientEntropy) public {
        if (fixedTier.paused() || !_hasSpecificCapacity(fixedTier)) return;
        periods = 1 + periods % 3;
        address recipient = _specificOtherActor(recipientEntropy);
        uint256 gross = fixedTier.pricePerPeriod() * periods;
        if (paymentToken.balanceOf(actor) < gross) return;
        uint256 payerBefore = paymentToken.balanceOf(actor);
        uint256 recipientBefore = paymentToken.balanceOf(recipient);
        vm.prank(actor);
        uint256 tokenId = fixedTier.giftMembership(recipient, periods, 64);
        ++ghosts.mintedCountByTier[address(fixedTier)];
        (MembershipTypes.ReferralStatus giftStatus, address giftReferrer) =
            fixedTier.referralOf(tokenId);
        property_giftReferralIsolation(
            uint256(MembershipTypes.ReferralStatus.Unset),
            address(0),
            uint256(giftStatus),
            giftReferrer
        );
        vm.prank(creator);
        uint256 refund = fixedTier.refund(tokenId, recipient, type(uint256).max, 64);
        ++ghosts.retiredCountByTier[address(fixedTier)];
        uint256 recipientAfter = paymentToken.balanceOf(recipient);
        property_giftRefundRoundTrip(
            payerBefore + recipientBefore,
            paymentToken.balanceOf(actor) + recipientAfter,
            recipientAfter - recipientBefore,
            refund
        );
        _syncSpecificGhosts(fixedTier);
    }

    function membershipTier_repeatedPurchaseRefund(bool contribution, uint8 cycles, uint256 amount)
        public
    {
        MembershipTier target = _specificTier(contribution);
        if (target.paused()) return;
        cycles = uint8(1 + cycles % 3);
        uint256 gross = contribution ? 1 + amount % 10e6 : target.pricePerPeriod();
        if (paymentToken.balanceOf(actor) < gross * cycles) return;
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        for (uint256 i; i < cycles; ++i) {
            if (!_hasSpecificCapacity(target)) return;
            uint256 tokenId;
            vm.startPrank(actor);
            if (contribution) {
                tokenId = target.createContributionMembership(gross, address(0), 64);
            } else {
                tokenId = target.createMembership(1, address(0), 64);
            }
            vm.stopPrank();
            ++ghosts.mintedCountByTier[address(target)];
            vm.prank(creator);
            target.refund(tokenId, actor, type(uint256).max, 64);
            ++ghosts.retiredCountByTier[address(target)];
            _syncSpecificGhosts(target);
        }
        property_repeatedRefundCycles(balanceBefore, paymentToken.balanceOf(actor));
    }

    function membershipTier_roundTripGrantRevoke(
        bool contribution,
        uint64 periods,
        address recipientEntropy
    ) public {
        MembershipTier target = _specificTier(contribution);
        if (target.paused() || !_hasSpecificCapacity(target) || !target.accountingStatus().complete)
        {
            return;
        }
        periods = 1 + periods % 3;
        address recipient = toActor(recipientEntropy);
        uint256 balanceBefore = paymentToken.balanceOf(recipient);
        uint256 supplyBeforeGrant = target.totalSupply();
        vm.prank(creator);
        uint256 tokenId = target.grantMembership(recipient, periods, 64);
        ++ghosts.mintedCountByTier[address(target)];
        (uint64 paidSeconds, uint64 grantSeconds,) = target.timeBalances(tokenId);
        property_grantCreation(
            grantSeconds,
            uint256(periods) * target.periodDuration(),
            paidSeconds,
            target.sharesOf(tokenId),
            target.isOccupied(tokenId),
            supplyBeforeGrant,
            target.totalSupply()
        );
        uint256 supplyBeforeRevoke = target.totalSupply();
        vm.prank(creator);
        uint64 revoked = target.revokeGrantTime(tokenId, recipient, 64);
        ++ghosts.retiredCountByTier[address(target)];
        property_grantRevokeRoundTrip(
            uint256(periods) * target.periodDuration(),
            revoked,
            balanceBefore,
            paymentToken.balanceOf(recipient)
        );
        bool tokenExistsAfter = _specificTokenExists(target, tokenId);
        uint64 grantSecondsAfter;
        if (tokenExistsAfter) (, grantSecondsAfter,) = target.timeBalances(tokenId);
        property_revokeGrantBranch(
            paidSeconds,
            grantSecondsAfter,
            tokenExistsAfter,
            supplyBeforeRevoke,
            target.totalSupply()
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_roundTripTransfer(bool contribution, uint256 seed, address toEntropy)
        public
    {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        address to = _specificOtherActor(toEntropy);
        bytes32 beforeHash = _specificEconomicHash(target, tokenId);
        uint256 sharesBefore = target.sharesOf(tokenId);
        (MembershipTypes.ReferralStatus statusBefore, address referrerBefore) =
            target.referralOf(tokenId);
        uint256 supplyBefore = target.totalSupply();
        uint256 occupiedBefore = target.occupiedSupply();
        bytes32 preservedHash =
            keccak256(abi.encode(actor, beforeHash, supplyBefore, occupiedBefore));
        uint256 combinedBefore = paymentToken.balanceOf(actor) + paymentToken.balanceOf(to);
        vm.prank(actor);
        target.transferFrom(actor, to, tokenId);
        vm.prank(to);
        target.transferFrom(to, actor, tokenId);
        property_transferRoundTrip(
            beforeHash,
            _specificEconomicHash(target, tokenId),
            combinedBefore,
            paymentToken.balanceOf(actor) + paymentToken.balanceOf(to)
        );
        property_transferPreservesPosition(
            preservedHash,
            keccak256(
                abi.encode(
                    target.ownerOf(tokenId),
                    _specificEconomicHash(target, tokenId),
                    target.totalSupply(),
                    target.occupiedSupply()
                )
            )
        );
        (MembershipTypes.ReferralStatus statusAfter, address referrerAfter) =
            target.referralOf(tokenId);
        property_referralImmutable(
            uint256(statusBefore), referrerBefore, uint256(statusAfter), referrerAfter
        );
        property_extantSharesMonotonic(sharesBefore, target.sharesOf(tokenId), false);
    }

    function membershipTier_probeShareQuotes(bool contribution, uint256 a, uint256 b) public {
        MembershipTier target = _specificTier(contribution);
        uint256 remaining = target.MAX_LIFETIME_GROSS() - target.lifetimeGross();
        if (remaining == 0) return;
        uint256 small = a % (remaining + 1);
        uint256 large = small + b % (remaining - small + 1);
        MembershipTypes.ShareQuote memory zero = target.previewShares(0);
        MembershipTypes.ShareQuote memory qSmall = target.previewShares(small);
        MembershipTypes.ShareQuote memory qLarge = target.previewShares(large);
        property_shareQuoteShape(
            zero.sharesAdded,
            zero.grossBefore,
            zero.grossAfter,
            small,
            qSmall.sharesAdded,
            large,
            qLarge.sharesAdded
        );
    }

    function membershipTier_probeRenewalExactness(bool contribution, uint256 seed, uint64 periods)
        public
    {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0 || target.paused() || !target.accountingStatus().complete) return;
        periods = contribution ? 1 : uint64(1 + periods % 3);
        uint256 gross = contribution ? 0 : target.pricePerPeriod() * periods;
        if (paymentToken.balanceOf(actor) < gross) return;
        if (!contribution) {
            (MembershipTypes.ReferralStatus status,) = target.referralOf(tokenId);
            if (status == MembershipTypes.ReferralStatus.Unset) return;
        }
        uint64 duration = periods * target.periodDuration();
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        uint256 sharesBefore = target.sharesOf(tokenId);
        MembershipTypes.ShareQuote memory quote = target.previewShares(gross);
        bytes32 expectedHash = keccak256(
            abi.encode(
                target.ownerOf(tokenId),
                target.expiresAt(tokenId) + duration,
                gross,
                quote.sharesAdded,
                target.totalMinted(),
                target.totalSupply()
            )
        );
        vm.prank(actor);
        target.renewSubscription(tokenId, duration);
        property_renewalExactness(
            expectedHash, _specificRenewalHash(target, tokenId, balanceBefore, sharesBefore)
        );
        (uint64 paidSeconds,,) = target.timeBalances(tokenId);
        property_prepaidLimit(paidSeconds, target.maxPrepaidPeriods(), target.periodDuration());
        _syncSpecificGhosts(target);
    }

    function membershipTier_refundFromPreview(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        (uint256 tokenId,) = _specificLiveToken(target, seed);
        if (tokenId == 0) return;
        MembershipTypes.RefundPreview memory quote = target.previewRefund(tokenId);
        if (!quote.complete && !quote.projected) return;
        uint256 funded;
        for (uint256 i; i < 4; ++i) {
            funded += quote.fundingScaled[i];
        }
        uint256 recipientBefore = paymentToken.balanceOf(quote.recipient);
        vm.prank(creator);
        uint256 actual = target.refund(tokenId, quote.recipient, quote.grossRefund, 64);
        property_refundPreviewMatches(
            quote.grossRefund,
            actual,
            funded,
            target.ACCOUNTING_SCALE(),
            paymentToken.balanceOf(quote.recipient) - recipientBefore
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_processFromAccountingPreview(
        bool contribution,
        uint256 seed,
        uint256 budget
    ) public {
        MembershipTier target = _specificTier(contribution);
        if (target.totalMinted() == 0) return;
        uint256 tokenId = 1 + seed % target.totalMinted();
        budget = 1 + budget % 64;
        MembershipTypes.AccountingPreview memory preview =
            target.previewAccounting(tokenId, actor, actor, budget);
        bytes32 previewStatus = keccak256(abi.encode(preview.current.status));
        bytes32 previewBalances = keccak256(abi.encode(preview.current));
        MembershipTypes.MaintenanceResult memory actual = target.processAccounting(budget);
        ghosts.retiredCountByTier[address(target)] += actual.retiredCount;
        MembershipTypes.AccountingPreview memory settled =
            target.previewAccounting(tokenId, actor, actor, 0);
        property_accountingPreviewMatches(
            preview.processedSteps,
            actual.processedSteps,
            previewStatus,
            keccak256(abi.encode(target.accountingStatus())),
            previewBalances,
            keccak256(abi.encode(settled.settled))
        );
        MembershipTypes.AccountingStatus memory afterStatus = target.accountingStatus();
        property_accountingProgress(
            budget,
            actual.processedSteps,
            actual.retiredCount,
            preview.settled.status.accountedThrough,
            afterStatus.accountedThrough,
            target.totalSupply() + actual.retiredCount,
            target.totalSupply(),
            afterStatus.complete,
            afterStatus.nextBoundary,
            block.timestamp
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_processFromPaymentTotalsPreview(bool contribution, uint256 budget)
        public
    {
        MembershipTier target = _specificTier(contribution);
        budget = 1 + budget % 64;
        MembershipTypes.PaymentTotals memory projected = target.previewPaymentTotals(budget);
        uint256 previewSteps = projected.processedSteps;
        projected.processedSteps = 0;
        MembershipTypes.MaintenanceResult memory actual = target.processAccounting(budget);
        ghosts.retiredCountByTier[address(target)] += actual.retiredCount;
        MembershipTypes.PaymentTotals memory settled = target.previewPaymentTotals(0);
        property_paymentTotalsPreviewMatches(
            previewSteps,
            actual.processedSteps,
            keccak256(abi.encode(projected)),
            keccak256(abi.encode(settled))
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_claimFromPreview(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificOwnedToken(target, actor, seed);
        uint256[] memory ids = new uint256[](tokenId == 0 ? 0 : 1);
        if (tokenId != 0) ids[0] = tokenId;
        MembershipTypes.ClaimPreview memory preview = target.previewClaimRewards(actor, ids, 64);
        if (!preview.complete) return;
        uint256 scale = target.ACCOUNTING_SCALE();
        uint256 expectedLive;
        for (uint256 i; i < preview.positions.length; ++i) {
            expectedLive += preview.positions[i].creditScaled / scale;
        }
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        uint256 supplyBefore = target.totalSupply();
        vm.prank(actor);
        MembershipTypes.ClaimResult memory actual = target.claimRewards(ids, 64);
        ghosts.retiredCountByTier[address(target)] += supplyBefore - target.totalSupply();
        property_claimPreviewMatches(
            preview.processedSteps,
            actual.processedSteps,
            expectedLive,
            actual.liveReward,
            preview.retiredCreditScaled / scale,
            actual.retiredReward,
            preview.referralCreditScaled / scale,
            actual.referral,
            preview.creatorCreditScaled / scale,
            actual.creator,
            paymentToken.balanceOf(actor) - balanceBefore
        );
        uint256 expectedTotal = expectedLive + preview.retiredCreditScaled / scale
            + preview.referralCreditScaled / scale + preview.creatorCreditScaled / scale;
        property_claimLiveness(
            true,
            expectedTotal,
            actual.liveReward + actual.retiredReward + actual.referral + actual.creator
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_probeClaimLiveness(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificOwnedToken(target, actor, seed);
        uint256[] memory ids = new uint256[](tokenId == 0 ? 0 : 1);
        if (tokenId != 0) ids[0] = tokenId;
        MembershipTypes.ClaimPreview memory preview = target.previewClaimRewards(actor, ids, 64);
        if (!preview.complete) return;
        uint256 scale = target.ACCOUNTING_SCALE();
        uint256 expected = preview.retiredCreditScaled / scale + preview.referralCreditScaled
            / scale + preview.creatorCreditScaled / scale;
        for (uint256 i; i < preview.positions.length; ++i) {
            expected += preview.positions[i].creditScaled / scale;
        }
        if (expected == 0) return;
        vm.prank(actor);
        MembershipTypes.ClaimResult memory actual = target.claimRewards(ids, 64);
        _syncSpecificGhosts(target);
        property_claimLiveness(
            true,
            expected,
            actual.liveReward + actual.retiredReward + actual.referral + actual.creator
        );
    }

    function membershipFactory_probeTierCreationIdentity(uint256 seed, bool contribution) public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(actor, address(renderer), address(paymentToken));
        config.tierSalt = keccak256(abi.encode("fizz-sp17", actor, seed));
        if (factory.isTierSaltUsed(actor, config.tierSalt)) return;
        config.minimumPayment = factory.minimumPayment(address(paymentToken));
        config.pricePerPeriod = contribution ? 0 : 10e6;
        uint256 countBefore = factory.tierCount();
        bytes32 predicted = factory.predictTierIdentity(actor, config.tierSalt);
        vm.prank(actor);
        address created = factory.createTier(config);
        bytes32 deployed = MembershipTier(created).tierIdentity();
        property_tierCreationIdentity(
            countBefore,
            factory.tierCount(),
            factory.isTierSaltUsed(actor, config.tierSalt),
            factory.isRegisteredTier(created),
            predicted,
            deployed,
            factory.tierForIdentity(predicted),
            created
        );
    }

    function membershipTier_probeZeroGrossCreation() public {
        if (contributionTier.paused() || !_hasSpecificCapacity(contributionTier)) return;
        uint256 lifetimeBefore = contributionTier.lifetimeGross();
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        vm.prank(actor);
        uint256 tokenId = contributionTier.createContributionMembership(0, address(0), 64);
        ++ghosts.mintedCountByTier[address(contributionTier)];
        MembershipTypes.AllocationState memory allocation =
            contributionTier.allocationState(tokenId);
        (uint64 paidSeconds,,) = contributionTier.timeBalances(tokenId);
        property_zeroGrossCreation(
            lifetimeBefore,
            contributionTier.lifetimeGross(),
            contributionTier.sharesOf(tokenId),
            allocation.lotCount,
            paidSeconds,
            contributionTier.periodDuration(),
            balanceBefore,
            paymentToken.balanceOf(actor)
        );
        _syncSpecificGhosts(contributionTier);
    }

    function membershipFactory_probePaymentTokenEnablement(bool enabled) public {
        address token = address(secondaryPaymentToken);
        if (factory.minimumPayment(token) == 0) factory.setMinimumPayment(token, 1);
        bool listedBefore = factory.isPaymentTokenListed(token);
        uint256 countBefore = factory.paymentTokenCount();
        factory.setPaymentTokenEnabled(token, enabled);
        property_paymentTokenEnablement(
            enabled,
            listedBefore,
            factory.isPaymentTokenListed(token),
            factory.isPaymentTokenEnabled(token),
            countBefore,
            factory.paymentTokenCount()
        );
    }

    function membershipFactory_probeAdminGuards(uint8 selector) public {
        address unauthorized = actors[1];
        bytes32 beforeHash = _specificFactoryPolicyHash(address(paymentToken));
        vm.prank(unauthorized);
        bool success;
        if (selector % 2 == 0) {
            (success,) = address(factory)
                .call(
                    abi.encodeCall(factory.setMinimumPayment, (address(paymentToken), uint112(2)))
                );
        } else {
            (success,) = address(factory)
                .call(
                    abi.encodeCall(factory.setPaymentTokenEnabled, (address(paymentToken), false))
                );
        }
        property_factoryAdminGuards(
            success, beforeHash, _specificFactoryPolicyHash(address(paymentToken))
        );
    }

    function membershipTier_probeAdminGuards(bool contribution, uint8 selector) public {
        MembershipTier target = _specificTier(contribution);
        address unauthorized = creator == actors[1] ? actors[2] : actors[1];
        bytes32 beforeHash = _specificTierAdminHash(target);
        vm.prank(unauthorized);
        bool success;
        if (selector % 3 == 0) {
            (success,) = address(target).call(abi.encodeCall(target.setPaused, (!target.paused())));
        } else if (selector % 3 == 1) {
            (success,) = address(target)
                .call(abi.encodeCall(target.setMaxPrepaidPeriods, (target.maxPrepaidPeriods() + 1)));
        } else {
            (success,) = address(target)
                .call(abi.encodeCall(target.setSupplyCap, (target.occupiedSupply() + 10)));
        }
        property_tierAdminGuards(success, beforeHash, _specificTierAdminHash(target));
    }

    function membershipTier_probeForeignOwnerGuards(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        (uint256 tokenId, address owner) = _specificLiveToken(target, seed);
        if (tokenId == 0) return;
        address attacker = owner == actors[1] ? actors[2] : actors[1];
        vm.prank(attacker);
        (bool renewSuccess,) = address(target)
            .call(
                abi.encodeCall(
                    target.renewContributionMembership,
                    (tokenId, uint256(0), address(0), uint256(64))
                )
            );
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        vm.prank(attacker);
        (bool claimSuccess,) =
            address(target).call(abi.encodeCall(target.claimRewards, (ids, uint256(64))));
        property_foreignOwnerGuards(renewSuccess, claimSuccess);
    }

    function membershipTier_probeClaimFactoryGuard(bool contribution) public {
        MembershipTier target = _specificTier(contribution);
        uint256[] memory ids = new uint256[](0);
        vm.prank(actor);
        (bool success,) =
            address(target).call(abi.encodeCall(target.claimRewardsFor, (actor, ids, uint256(64))));
        property_claimFactoryGuard(success);
    }

    function membershipTier_probeExpiredGuards(bool contribution, address recipientEntropy) public {
        MembershipTier target = _specificTier(contribution);
        if (target.paused() || !_hasSpecificCapacity(target)) return;
        vm.prank(creator);
        uint256 tokenId = target.grantMembership(actor, 1, 64);
        ++ghosts.mintedCountByTier[address(target)];
        skipTime(target.periodDuration());
        address recipient = _specificOtherActor(recipientEntropy);
        vm.prank(actor);
        (bool transferSuccess,) =
            address(target).call(abi.encodeCall(target.transferFrom, (actor, recipient, tokenId)));
        vm.prank(actor);
        (bool renewSuccess,) = address(target)
            .call(abi.encodeCall(target.renewSubscription, (tokenId, target.periodDuration())));
        vm.prank(creator);
        (bool grantSuccess,) = address(target)
            .call(abi.encodeCall(target.addGrantTime, (tokenId, actor, uint64(1), uint256(64))));
        property_expiredGuards(transferSuccess, renewSuccess, grantSuccess);
        _syncSpecificGhosts(target);
    }

    function membershipFactory_probeDuplicateSalt(uint256 seed) public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(actor, address(renderer), address(paymentToken));
        config.tierSalt = keccak256(abi.encode("fizz-sp33", actor, seed));
        if (factory.isTierSaltUsed(actor, config.tierSalt)) return;
        config.minimumPayment = factory.minimumPayment(address(paymentToken));
        vm.prank(actor);
        address created = factory.createTier(config);
        bytes32 identity = MembershipTier(created).tierIdentity();
        uint256 countBefore = factory.tierCount();
        address mappedBefore = factory.tierForIdentity(identity);
        vm.prank(actor);
        (bool success,) = address(factory).call(abi.encodeCall(factory.createTier, (config)));
        property_duplicateSaltGuard(
            success,
            countBefore,
            factory.tierCount(),
            mappedBefore,
            factory.tierForIdentity(identity)
        );
    }

    function membershipTier_probePausedExitLiveness() public {
        MembershipTier target = fixedTier;
        if (target.paused()) {
            vm.prank(creator);
            target.setPaused(false);
        }
        if (
            !_hasSpecificCapacity(target) || paymentToken.balanceOf(actor) < target.pricePerPeriod()
        ) {
            return;
        }
        vm.prank(actor);
        uint256 tokenId = target.createMembership(1, address(0), 64);
        ++ghosts.mintedCountByTier[address(target)];
        vm.prank(creator);
        target.setPaused(true);

        vm.prank(actor);
        (bool purchaseSuccess,) = address(target)
            .call(abi.encodeCall(target.createMembership, (uint64(1), address(0), uint256(64))));
        (bool maintenanceSuccess, bytes memory maintenanceData) =
            address(target).call(abi.encodeCall(target.processAccounting, (uint256(64))));
        if (maintenanceSuccess) {
            MembershipTypes.MaintenanceResult memory maintenance =
                abi.decode(maintenanceData, (MembershipTypes.MaintenanceResult));
            ghosts.retiredCountByTier[address(target)] += maintenance.retiredCount;
        }
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        vm.prank(actor);
        (bool claimSuccess,) =
            address(target).call(abi.encodeCall(target.claimRewards, (ids, uint256(64))));
        (bool feeReleaseSuccess,) =
            address(target).call(abi.encodeCall(target.releaseProtocolFees, ()));
        vm.prank(creator);
        (bool refundSuccess,) = address(target)
            .call(abi.encodeCall(target.refund, (tokenId, actor, type(uint256).max, uint256(64))));
        if (refundSuccess) ++ghosts.retiredCountByTier[address(target)];
        vm.prank(creator);
        target.setPaused(false);
        property_pausedExitLiveness(
            purchaseSuccess, maintenanceSuccess, claimSuccess, feeReleaseSuccess, refundSuccess
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_processDueBoundary(bool contribution) public {
        MembershipTier target = _specificTier(contribution);
        if (target.paused() || !_hasSpecificCapacity(target)) return;
        vm.prank(creator);
        target.grantMembership(actor, 1, 64);
        ++ghosts.mintedCountByTier[address(target)];
        skipTime(target.periodDuration());
        (bool success, bytes memory data) =
            address(target).call(abi.encodeCall(target.processAccounting, (uint256(1))));
        uint256 processed;
        if (success) {
            MembershipTypes.MaintenanceResult memory result =
                abi.decode(data, (MembershipTypes.MaintenanceResult));
            processed = result.processedSteps;
            ghosts.retiredCountByTier[address(target)] += result.retiredCount;
        }
        property_dueBoundaryLiveness(success, processed);
        _syncSpecificGhosts(target);
    }

    function membershipTier_probeCurveCapacityGuard(uint256 seed) public {
        MembershipTier target = contributionTier;
        if (target.paused()) return;
        uint256 excessive = target.MAX_LIFETIME_GROSS() - target.lifetimeGross() + 1;
        bytes32 beforeHash = _specificTierStateHash(target);
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        vm.prank(actor);
        (bool success,) = address(target)
            .call(
                abi.encodeCall(
                    target.createContributionMembership,
                    (excessive, _specificReferrer(actors[seed % actors.length]), uint256(64))
                )
            );
        property_curveCapacityGuard(
            success,
            beforeHash,
            _specificTierStateHash(target),
            balanceBefore,
            paymentToken.balanceOf(actor)
        );
    }

    function membershipTier_probeClaimSelectionGuards(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        uint256[] memory ids = new uint256[](2);
        ids[0] = tokenId;
        ids[1] = tokenId;
        bytes32 beforeHash = _specificClaimStateHash(target, actor, tokenId);
        vm.prank(actor);
        (bool success,) =
            address(target).call(abi.encodeCall(target.claimRewards, (ids, uint256(64))));
        property_claimSelectionGuard(
            success, beforeHash, _specificClaimStateHash(target, actor, tokenId)
        );
    }

    function membershipTier_probeDonationIsolation(bool contribution, uint256 amount) public {
        MembershipTier target = _specificTier(contribution);
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance == 0) return;
        amount = 1 + amount % balance;
        uint256 lifetimeBefore = target.lifetimeGross();
        uint256 sharesBefore = target.totalRewardShares();
        uint256 liabilityBefore = target.totalProtectedLiability();
        bool interestBefore = target.hasClaimInterest(actor);
        vm.prank(actor);
        require(paymentToken.transfer(address(target), amount));
        ghosts.donatedByTier[address(target)] += amount;
        property_donationIsolation(
            lifetimeBefore,
            target.lifetimeGross(),
            sharesBefore,
            target.totalRewardShares(),
            liabilityBefore,
            target.totalProtectedLiability(),
            interestBefore,
            target.hasClaimInterest(actor)
        );
    }

    function membershipTier_probeFullBalanceContribution(address referralEntropy) public {
        MembershipTier target = contributionTier;
        if (target.paused() || !_hasSpecificCapacity(target)) return;
        uint256 balance = paymentToken.balanceOf(actor);
        if (balance < target.minimumPayment()) return;
        if (balance > target.MAX_LIFETIME_GROSS() - target.lifetimeGross()) return;
        vm.prank(actor);
        uint256 tokenId =
            target.createContributionMembership(balance, _specificReferrer(referralEntropy), 64);
        ++ghosts.mintedCountByTier[address(target)];
        property_fullBalanceContribution(
            paymentToken.balanceOf(actor), target.sharesOf(tokenId), target.hasClaimInterest(actor)
        );
        _syncSpecificGhosts(target);
    }

    function membershipTier_roundTripApprovedTransfer(
        bool contribution,
        uint256 seed,
        address recipientEntropy
    ) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        address recipient = _specificOtherActor(recipientEntropy);
        vm.prank(actor);
        target.approve(recipient, tokenId);
        vm.prank(recipient);
        target.transferFrom(actor, recipient, tokenId);
        property_approvedTransfer(target.ownerOf(tokenId), recipient, target.getApproved(tokenId));
    }

    function membershipTier_roundTripOperatorTransfer(
        bool contribution,
        uint256 seed,
        address operatorEntropy
    ) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        address operator = _specificOtherActor(operatorEntropy);
        vm.prank(actor);
        target.setApprovalForAll(operator, true);
        vm.prank(operator);
        target.transferFrom(actor, operator, tokenId);
        vm.prank(actor);
        target.setApprovalForAll(operator, false);
        property_operatorTransfer(
            target.ownerOf(tokenId), operator, target.isApprovedForAll(actor, operator)
        );
    }

    function membershipTier_selfTransfer(bool contribution, uint256 seed, address approvalEntropy)
        public
    {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        address approved = _specificOtherActor(approvalEntropy);
        vm.prank(actor);
        target.approve(approved, tokenId);
        bytes32 beforeHash = _specificEconomicHash(target, tokenId);
        uint256 balanceBefore = paymentToken.balanceOf(actor);
        vm.prank(actor);
        target.transferFrom(actor, actor, tokenId);
        property_selfTransfer(
            beforeHash,
            _specificEconomicHash(target, tokenId),
            balanceBefore,
            paymentToken.balanceOf(actor),
            target.getApproved(tokenId)
        );
    }

    function membershipTier_probeSafeTransfer(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0) return;
        address receiver = _specificOtherActor(actors[seed % actors.length]);
        vm.prank(actor);
        (bool receiverSuccess,) = address(target)
            .call(
                abi.encodeWithSignature(
                    "safeTransferFrom(address,address,uint256)", actor, receiver, tokenId
                )
            );
        if (!receiverSuccess) {
            property_safeTransferReceiver(
                false, target.ownerOf(tokenId), receiver, false, bytes32(0), bytes32(0)
            );
            return;
        }
        address receiverOwner = target.ownerOf(tokenId);
        vm.prank(receiver);
        target.transferFrom(receiver, actor, tokenId);
        FizzNonReceiver nonReceiver = new FizzNonReceiver();
        bytes32 beforeFailedHash = _specificTransferHash(target, tokenId, actor);
        vm.prank(actor);
        (bool nonReceiverSuccess,) = address(target)
            .call(
                abi.encodeWithSignature(
                    "safeTransferFrom(address,address,uint256)",
                    actor,
                    address(nonReceiver),
                    tokenId
                )
            );
        property_safeTransferReceiver(
            true,
            receiverOwner,
            receiver,
            nonReceiverSuccess,
            beforeFailedHash,
            _specificTransferHash(target, tokenId, actor)
        );
    }

    function membershipTier_probeRenewableSoundness(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        uint256 tokenId = _specificLiveOwnedToken(target, actor, seed);
        if (tokenId == 0 || !target.accountingStatus().complete) return;
        bool renewable = target.isRenewable(tokenId);
        if (!renewable) return;
        uint256 requiredBalance = contribution ? 0 : target.pricePerPeriod();
        if (
            paymentToken.balanceOf(actor) < requiredBalance
                || paymentToken.allowance(actor, address(target)) < requiredBalance
        ) return;
        uint256 expirationBefore = target.expiresAt(tokenId);
        uint64 duration = target.periodDuration();
        vm.prank(actor);
        (bool success,) =
            address(target).call(abi.encodeCall(target.renewSubscription, (tokenId, duration)));
        uint256 expirationAfter = success ? target.expiresAt(tokenId) : expirationBefore;
        property_renewableSoundness(renewable, success, expirationBefore, expirationAfter, duration);
        _syncSpecificGhosts(target);
    }

    function membershipTier_probeAllocationOrder(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        if (target.totalMinted() == 0) return;
        uint256 tokenId = 1 + seed % target.totalMinted();
        MembershipTypes.AllocationState memory state = target.allocationState(tokenId);
        if (state.lotCount < 2) return;
        uint256 offset = seed % (state.lotCount - 1);
        MembershipTypes.AllocationLot[] memory lots =
            target.allocationLots(tokenId, state.generation, offset, 2);
        property_allocationOrder(lots[0].start, lots[0].end, lots[1].start, lots[1].end);
    }

    function membershipTier_probeAllocationCursor(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        if (target.totalMinted() == 0) return;
        MembershipTypes.AllocationState memory state =
            target.allocationState(1 + seed % target.totalMinted());
        uint256 unearnedSum;
        for (uint256 i; i < 4; ++i) {
            unearnedSum += state.unearnedScaled[i];
        }
        property_allocationCursor(
            state.lotCursor, state.lotCount, state.refundableGross, unearnedSum
        );
    }

    function membershipTier_probeAllocationGeneration(bool contribution, uint256 seed) public {
        MembershipTier target = _specificTier(contribution);
        if (target.totalMinted() == 0) return;
        uint256 tokenId = 1 + seed % target.totalMinted();
        uint256 currentGeneration = target.allocationState(tokenId).generation;
        uint256 sampledGeneration = currentGeneration == 0 ? 0 : seed % (currentGeneration + 1);
        MembershipTypes.AllocationLot[] memory lots =
            target.allocationLots(tokenId, sampledGeneration, 0, 1);
        if (lots.length == 0) return;
        property_allocationGeneration(sampledGeneration, currentGeneration, lots[0].canceled);
    }

    function _specificTier(bool contribution) internal view returns (MembershipTier) {
        return contribution ? contributionTier : fixedTier;
    }

    function _hasSpecificCapacity(MembershipTier target) internal view returns (bool) {
        return target.supplyCap() == 0 || target.occupiedSupply() < target.supplyCap();
    }

    function _specificOtherActor(address entropy) internal view returns (address other) {
        other = toActor(entropy);
        if (other == actor) other = actors[(uint256(uint160(entropy)) + 1) % actors.length];
    }

    function _specificReferrer(address entropy) internal view returns (address) {
        return uint160(entropy) % 3 == 0 ? address(0) : _specificOtherActor(entropy);
    }

    function _specificOwnedToken(MembershipTier target, address owner, uint256 seed)
        internal
        view
        returns (uint256)
    {
        uint256 balance = target.balanceOf(owner);
        return balance == 0 ? 0 : target.tokenOfOwnerByIndex(owner, seed % balance);
    }

    function _specificLiveOwnedToken(MembershipTier target, address owner, uint256 seed)
        internal
        view
        returns (uint256 tokenId)
    {
        tokenId = _specificOwnedToken(target, owner, seed);
        if (tokenId != 0 && !target.isActiveToken(tokenId)) tokenId = 0;
    }

    function _specificLiveToken(MembershipTier target, uint256 seed)
        internal
        view
        returns (uint256 tokenId, address owner)
    {
        for (uint256 i; i < actors.length; ++i) {
            owner = actors[(seed + i) % actors.length];
            tokenId = _specificLiveOwnedToken(target, owner, seed);
            if (tokenId != 0) return (tokenId, owner);
        }
        return (0, address(0));
    }

    function _specificTokenExists(MembershipTier target, uint256 tokenId)
        internal
        view
        returns (bool)
    {
        (bool success,) = address(target).staticcall(abi.encodeCall(target.ownerOf, (tokenId)));
        return success;
    }

    function _specificEconomicHash(MembershipTier target, uint256 tokenId)
        internal
        view
        returns (bytes32)
    {
        (uint64 paid, uint64 grant, uint64 checkpoint) = target.timeBalances(tokenId);
        (MembershipTypes.ReferralStatus status, address referrer) = target.referralOf(tokenId);
        return keccak256(
            abi.encode(
                keccak256(
                    abi.encode(
                        target.sharesOf(tokenId), target.expiresAt(tokenId), paid, grant, checkpoint
                    )
                ),
                keccak256(
                    abi.encode(
                        status,
                        referrer,
                        target.allocationState(tokenId),
                        target.claimableReward(tokenId)
                    )
                )
            )
        );
    }

    function _specificRenewalHash(
        MembershipTier target,
        uint256 tokenId,
        uint256 balanceBefore,
        uint256 sharesBefore
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                target.ownerOf(tokenId),
                target.expiresAt(tokenId),
                balanceBefore - paymentToken.balanceOf(actor),
                target.sharesOf(tokenId) - sharesBefore,
                target.totalMinted(),
                target.totalSupply()
            )
        );
    }

    function _specificRefundHash(MembershipTier target, address owner, uint256 refunded)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                refunded,
                paymentToken.balanceOf(owner),
                paymentToken.balanceOf(address(target)),
                target.lifetimeGross()
            )
        );
    }

    function _specificCountHash(MembershipTier target) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(target.totalMinted(), target.totalSupply(), target.occupiedSupply())
            );
    }

    function _specificFactoryPolicyHash(address token) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                factory.owner(),
                factory.paymentTokenCount(),
                factory.minimumPayment(token),
                factory.isPaymentTokenListed(token),
                factory.isPaymentTokenEnabled(token)
            )
        );
    }

    function _specificTierAdminHash(MembershipTier target) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                target.owner(),
                target.paused(),
                target.supplyCap(),
                target.maxPrepaidPeriods(),
                target.creatorProceeds(),
                target.protocolFeeEarnedHeld()
            )
        );
    }

    function _specificTierStateHash(MembershipTier target) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                target.lifetimeGross(),
                target.totalMinted(),
                target.totalSupply(),
                target.occupiedSupply(),
                target.totalRewardShares(),
                target.totalProtectedLiability(),
                target.previewPaymentTotals(0)
            )
        );
    }

    function _specificClaimStateHash(MembershipTier target, address owner, uint256 tokenId)
        internal
        view
        returns (bytes32)
    {
        (uint256 retiredRaw, uint256 retiredFraction) = target.claimableRetiredReward(owner);
        return keccak256(
            abi.encode(
                target.claimableReward(tokenId),
                retiredRaw,
                retiredFraction,
                target.claimableReferral(owner),
                target.creatorProceeds(),
                paymentToken.balanceOf(owner)
            )
        );
    }

    function _specificTransferHash(MembershipTier target, uint256 tokenId, address owner)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                target.ownerOf(tokenId),
                target.balanceOf(owner),
                target.getApproved(tokenId),
                target.totalSupply(),
                target.occupiedSupply(),
                _specificEconomicHash(target, tokenId)
            )
        );
    }

    function _syncSpecificGhosts(MembershipTier target) internal {
        uint256 minted = target.totalMinted();
        ghosts.mintedCountByTier[address(target)] = minted;
        ghosts.retiredCountByTier[address(target)] = minted - target.totalSupply();
    }
}
