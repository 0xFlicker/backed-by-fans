// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import "../Base.sol";
import {Properties} from "../Properties.sol";

contract WrongSchemaRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return bytes32(0);
    }
}

/// @notice High-signal factory actions plus a raw-call layer for edge exploration.
abstract contract MembershipFactoryHandler is Properties {
    function membershipFactory_claimEverything_clamped(uint256 maxAccountingSteps) public {
        MembershipTypes.TierClaimRequest[] memory requests =
            new MembershipTypes.TierClaimRequest[](2);
        uint256[] memory fixedIds = _singleOwnedId(fixedTier, actor);
        uint256[] memory contributionIds = _singleOwnedId(contributionTier, actor);

        if (address(fixedTier) < address(contributionTier)) {
            requests[0] = MembershipTypes.TierClaimRequest(address(fixedTier), fixedIds);
            requests[1] =
                MembershipTypes.TierClaimRequest(address(contributionTier), contributionIds);
        } else {
            requests[0] =
                MembershipTypes.TierClaimRequest(address(contributionTier), contributionIds);
            requests[1] = MembershipTypes.TierClaimRequest(address(fixedTier), fixedIds);
        }
        membershipFactory_claimEverything(requests, 1 + maxAccountingSteps % 64);
    }

    function membershipFactory_createTier_clamped(uint256 seed, bool contribution) public {
        if (!factory.isPaymentTokenEnabled(address(paymentToken))) return;
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(actor, address(renderer), address(paymentToken));
        config.tierSalt = keccak256(abi.encode("fizz-generated-tier", actor, seed));
        config.minimumPayment = factory.minimumPayment(address(paymentToken));
        config.pricePerPeriod = contribution ? 0 : 10e6;
        config.periodDuration = 1 days;
        config.supplyCap = 4;
        config.maxPrepaidPeriods = 4;
        membershipFactory_createTier(config);
    }

    function membershipFactory_secondary(uint8 selector, uint112 minimum, bool enabled) public {
        if (selector % 2 == 0) {
            _membershipFactory_setMinimumPayment(address(paymentToken), 1 + minimum % 100e6);
        } else {
            _membershipFactory_setPaymentTokenEnabled(address(paymentToken), enabled);
        }
    }

    function membershipFactory_listSecondaryToken(uint112 minimum) public {
        _membershipFactory_setMinimumPayment(address(secondaryPaymentToken), 1 + minimum % 100e6);
        _membershipFactory_setPaymentTokenEnabled(address(secondaryPaymentToken), true);
    }

    function membershipFactory_probeCreateTierGuards(uint8 selector, uint256 seed) public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(actor, address(renderer), address(paymentToken));
        config.tierSalt = keccak256(abi.encode("fizz-guard", selector, seed));
        config.minimumPayment = factory.minimumPayment(address(paymentToken));

        uint8 guard = selector % 8;
        if (guard == 0) {
            config.protocolFeeBps = 0;
        } else if (guard == 1) {
            config.paymentToken = address(0);
        } else if (guard == 2) {
            config.minimumPayment += 1;
        } else if (guard == 3) {
            config.renderer = address(0);
        } else if (guard == 4) {
            config.renderer = actors[1];
        } else if (guard == 5) {
            config.renderer = address(this);
        } else if (guard == 6) {
            config.renderer = address(new WrongSchemaRenderer());
        } else {
            config.art.engine = type(uint16).max;
        }

        vm.prank(actor);
        // Expected validation reverts are the behavior under test.
        _expectFactoryRevert(abi.encodeCall(factory.createTier, (config)));
    }

    function membershipFactory_probeOwnershipGuards(address candidate) public {
        vm.prank(admin);
        _expectFactoryRevert(abi.encodeCall(factory.transferOwnership, (candidate)));
        vm.prank(actor);
        _expectFactoryRevert(abi.encodeCall(factory.acceptOwnership, ()));
        _expectFactoryRevert(abi.encodeCall(factory.renounceOwnership, ()));
    }

    function membershipFactory_probeViews(uint256 seed) public view {
        bytes32 salt = keccak256(abi.encode("fizz-probe", seed));
        bytes32 identity = factory.predictTierIdentity(actor, salt);
        factory.protocolToken();
        factory.buybackVault();
        factory.burnRouter();
        factory.implementation();
        factory.rendererSchema();
        factory.mediaStoreFactory();
        factory.mediaStoreFactoryRuntimeCodehash();
        factory.minimumPayment(address(paymentToken));
        factory.isPaymentTokenListed(address(paymentToken));
        factory.isPaymentTokenEnabled(address(paymentToken));
        factory.paymentTokens(seed % factory.paymentTokenCount(), 2);
        factory.isTierSaltUsed(actor, salt);
        factory.tierForIdentity(identity);
        factory.isRegisteredTier(address(fixedTier));
        factory.tiers(seed % factory.tierCount(), 2);
    }

    function membershipFactory_claimEverything(
        MembershipTypes.TierClaimRequest[] memory requests,
        uint256 maxAccountingSteps
    ) public asActor {
        snapshotBefore(fixedTier, 0, actor, address(0));
        factory.claimEverything(requests, maxAccountingSteps);
        _syncFactoryClaimGhosts(fixedTier);
        _syncFactoryClaimGhosts(contributionTier);
        snapshotAfter(fixedTier, 0, actor, address(0));
    }

    function membershipFactory_createTier(MembershipTypes.TierConfig memory config) public asActor {
        snapshotBefore(MembershipTier(address(0)), 0, actor, address(0));
        uint256 countBefore = factory.tierCount();
        bytes32 predicted = factory.predictTierIdentity(actor, config.tierSalt);
        address created = factory.createTier(config);
        snapshotAfter(MembershipTier(created), 0, actor, address(0));
        property_tierCreationIdentity(
            countBefore,
            factory.tierCount(),
            factory.isTierSaltUsed(actor, config.tierSalt),
            factory.isRegisteredTier(created),
            predicted,
            MembershipTier(created).tierIdentity(),
            factory.tierForIdentity(predicted),
            created
        );
    }

    function _membershipFactory_setMinimumPayment(address token, uint112 minimum) internal asAdmin {
        snapshotBefore(MembershipTier(address(0)), 0, admin, address(0));
        factory.setMinimumPayment(token, minimum);
        snapshotAfter(MembershipTier(address(0)), 0, admin, address(0));
    }

    function _membershipFactory_setPaymentTokenEnabled(address token, bool enabled)
        internal
        asAdmin
    {
        snapshotBefore(MembershipTier(address(0)), 0, admin, address(0));
        factory.setPaymentTokenEnabled(token, enabled);
        snapshotAfter(MembershipTier(address(0)), 0, admin, address(0));
    }

    function _expectFactoryRevert(bytes memory callData) internal {
        (bool success,) = address(factory).call(callData);
        require(!success, "expected factory guard");
    }

    function _singleOwnedId(MembershipTier target, address owner)
        internal
        view
        returns (uint256[] memory ids)
    {
        uint256 balance = target.balanceOf(owner);
        ids = new uint256[](balance == 0 ? 0 : 1);
        if (balance != 0) ids[0] = target.tokenOfOwnerByIndex(owner, 0);
    }

    function _syncFactoryClaimGhosts(MembershipTier target) internal {
        uint256 minted = target.totalMinted();
        ghosts.mintedCountByTier[address(target)] = minted;
        ghosts.retiredCountByTier[address(target)] = minted - target.totalSupply();
    }
}
