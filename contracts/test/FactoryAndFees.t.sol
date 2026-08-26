// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {AdversarialFeeToken} from "./mocks/AdversarialFeeToken.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {ReentrantFeeRecipient} from "./mocks/ReentrantFeeRecipient.sol";

contract FactoryAndFeesTest is Test {
    uint256 private constant _RUNTIME_LIMIT = 24_576;
    uint256 private constant _INITCODE_LIMIT = 49_152;
    uint256 private constant _MAX_TIER_DEPLOY_GAS = 6_500_000;

    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    MembershipFactory private factory;

    address private creator;
    address private feeRecipient;
    address private nextOwner;

    function setUp() public {
        creator = makeAddr("creator");
        feeRecipient = makeAddr("feeRecipient");
        nextOwner = makeAddr("nextOwner");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        factory =
            new MembershipFactory(paymentToken, address(renderer), address(this), feeRecipient);
    }

    function test_constructorBindsTokenRendererAndNonAdminDeployer() public view {
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());

        assertEq(address(factory.paymentToken()), address(paymentToken));
        assertEq(factory.renderer(), address(renderer));
        assertEq(factory.protocolFeeBps(), 100);
        assertEq(factory.maxPageSize(), 100);
        assertEq(factory.owner(), address(this));
        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(tierDeployer.factory(), address(factory));
        assertEq(tierDeployer.renderer(), address(renderer));
    }

    function test_deployerStoresExactStopPrefixedTierCreationCode() public view {
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        bytes memory expected = type(MembershipTier).creationCode;
        bytes memory first = tierDeployer.creationCodeStoreA().code;
        bytes memory second = tierDeployer.creationCodeStoreB().code;

        assertEq(uint8(first[0]), 0);
        assertEq(uint8(second[0]), 0);
        assertEq(first.length + second.length - 2, expected.length);

        bytes memory reconstructed = new bytes(expected.length);
        uint256 firstPayloadLength = first.length - 1;
        for (uint256 i; i < firstPayloadLength; ++i) {
            reconstructed[i] = first[i + 1];
        }
        for (uint256 i; i < second.length - 1; ++i) {
            reconstructed[firstPayloadLength + i] = second[i + 1];
        }

        assertEq(tierDeployer.tierCreationCodeLength(), expected.length);
        assertEq(tierDeployer.tierCreationCodeHash(), keccak256(expected));
        assertEq(keccak256(reconstructed), keccak256(expected));
    }

    function test_factoryAndDeployerRuntimeDoNotEmbedTierCreationCode() public view {
        bytes memory prefix = new bytes(32);
        bytes memory creationCode = type(MembershipTier).creationCode;
        for (uint256 i; i < prefix.length; ++i) {
            prefix[i] = creationCode[i];
        }

        assertFalse(_contains(address(factory).code, prefix));
        assertFalse(_contains(factory.deployer().code, prefix));
    }

    function test_anyCreatorCanDeployMultipleIndependentFullTiers() public {
        address first = _createTier(factory, creator, _defaultConfig(creator));
        MembershipTypes.TierConfig memory secondConfig = _defaultConfig(creator);
        secondConfig.pricePerPeriod = 25_000_000;
        secondConfig.supplyCap = 250;
        address second = _createTier(factory, creator, secondConfig);

        assertTrue(first != second);
        assertEq(factory.tierCount(), 2);
        assertTrue(factory.isRegisteredTier(first));
        assertTrue(factory.isRegisteredTier(second));

        MembershipTier firstTier = MembershipTier(first);
        MembershipTier secondTier = MembershipTier(second);
        assertEq(firstTier.owner(), creator);
        assertEq(firstTier.factory(), address(factory));
        assertEq(address(firstTier.paymentToken()), address(paymentToken));
        assertEq(firstTier.renderer(), address(renderer));
        assertEq(firstTier.pricePerPeriod(), 10_000_000);
        assertEq(firstTier.periodDuration(), 30 days);
        assertEq(firstTier.rewardBps(), 500);
        assertEq(firstTier.referralBps(), 100);
        assertEq(firstTier.protocolFeeBps(), 100);
        assertEq(firstTier.supplyCap(), 0);
        assertEq(firstTier.maxPrepaidPeriods(), 12);
        assertEq(secondTier.pricePerPeriod(), 25_000_000);
        assertEq(secondTier.supplyCap(), 250);
    }

    function test_creatorMustSelfAttributeOfficialTier() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);

        vm.expectRevert(MembershipFactory.CreatorMustBeCaller.selector);
        factory.createTier(config);

        config.creator = address(0);
        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.createTier(config);
    }

    function test_deployerRejectsCallsOutsideBoundFactory() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());

        vm.expectRevert(MembershipTierDeployer.OnlyFactory.selector);
        tierDeployer.deploy(paymentToken, config);
    }

    function test_factoryOwnerHasNoTierAuthority() public {
        MembershipTier tier = MembershipTier(_createTier(factory, creator, _defaultConfig(creator)));

        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this))
        );
        tier.transferOwnership(nextOwner);

        assertEq(tier.owner(), creator);
        assertEq(tier.pendingOwner(), address(0));
    }

    function test_registryPaginationIsStableBoundedAndAuthentic() public {
        address[] memory expected = new address[](5);
        for (uint256 i; i < expected.length; ++i) {
            MembershipTypes.TierConfig memory config = _defaultConfig(creator);
            config.pricePerPeriod += i;
            expected[i] = _createTier(factory, creator, config);
        }

        address[] memory firstPage = factory.tiers(0, 2);
        address[] memory secondPage = factory.tiers(2, 10);
        address[] memory emptyPage = factory.tiers(5, 2);

        assertEq(firstPage.length, 2);
        assertEq(firstPage[0], expected[0]);
        assertEq(firstPage[1], expected[1]);
        assertEq(secondPage.length, 3);
        assertEq(secondPage[0], expected[2]);
        assertEq(secondPage[1], expected[3]);
        assertEq(secondPage[2], expected[4]);
        assertEq(emptyPage.length, 0);
        assertFalse(factory.isRegisteredTier(address(new OnchainMetadataRenderer())));

        uint256 invalidPageSize = factory.maxPageSize() + 1;
        vm.expectRevert(MembershipFactory.InvalidPageSize.selector);
        factory.tiers(0, invalidPageSize);
    }

    function test_invalidFactoryConstructorConfigurationReverts() public {
        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(IERC20(address(0)), address(renderer), address(this), feeRecipient);

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(paymentToken, address(0), address(this), feeRecipient);

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(
            IERC20(makeAddr("notToken")), address(renderer), address(this), feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(paymentToken, makeAddr("notRenderer"), address(this), feeRecipient);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MembershipFactory(paymentToken, address(renderer), address(0), feeRecipient);

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(paymentToken, address(renderer), address(this), address(0));
    }

    function test_invalidTierDurationAndRateTotalRevert() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.periodDuration = 0;
        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidPeriodDuration.selector);
        factory.createTier(config);

        config = _defaultConfig(creator);
        config.rewardBps = 9900;
        config.referralBps = 1;
        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRateTotal.selector);
        factory.createTier(config);

        config.rewardBps = 9800;
        config.referralBps = 100;
        address tier = _createTier(factory, creator, config);
        assertEq(MembershipTier(tier).rewardBps(), 9800);
    }

    function test_factoryAndTierOwnershipAreTwoStepAndCannotBecomeZero() public {
        factory.transferOwnership(nextOwner);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), nextOwner);

        vm.prank(nextOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), nextOwner);
        assertEq(factory.pendingOwner(), address(0));

        vm.prank(nextOwner);
        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.transferOwnership(address(0));

        vm.prank(nextOwner);
        vm.expectRevert(MembershipFactory.OwnershipRenunciationDisabled.selector);
        factory.renounceOwnership();

        MembershipTier tier = MembershipTier(_createTier(factory, creator, _defaultConfig(creator)));
        vm.prank(creator);
        tier.transferOwnership(nextOwner);
        assertEq(tier.owner(), creator);
        assertEq(tier.pendingOwner(), nextOwner);

        vm.prank(nextOwner);
        tier.acceptOwnership();
        assertEq(tier.owner(), nextOwner);

        vm.prank(nextOwner);
        vm.expectRevert(MembershipTier.InvalidAddress.selector);
        tier.transferOwnership(address(0));

        vm.prank(nextOwner);
        vm.expectRevert(MembershipTier.OwnershipRenunciationDisabled.selector);
        tier.renounceOwnership();
    }

    function test_onlyCurrentFeeRecipientWithdrawsEntireBalanceToItself() public {
        paymentToken.mint(address(factory), 1_000_000);

        vm.expectRevert(MembershipFactory.OnlyFeeRecipient.selector);
        factory.withdrawProtocolFees();

        vm.prank(feeRecipient);
        uint256 amount = factory.withdrawProtocolFees();

        assertEq(amount, 1_000_000);
        assertEq(paymentToken.balanceOf(address(factory)), 0);
        assertEq(paymentToken.balanceOf(feeRecipient), 1_000_000);

        vm.prank(feeRecipient);
        assertEq(factory.withdrawProtocolFees(), 0);
    }

    function test_recipientChangeRedirectsPriorAndFutureFactoryBalances() public {
        paymentToken.mint(address(factory), 1_000_000);
        factory.setFeeRecipient(nextOwner);
        paymentToken.mint(address(factory), 2_000_000);

        vm.prank(feeRecipient);
        vm.expectRevert(MembershipFactory.OnlyFeeRecipient.selector);
        factory.withdrawProtocolFees();

        vm.prank(nextOwner);
        assertEq(factory.withdrawProtocolFees(), 3_000_000);
        assertEq(paymentToken.balanceOf(nextOwner), 3_000_000);
    }

    function test_feeRecipientUpdatesRequireOwnerAndValidFixedDestination() public {
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        factory.setFeeRecipient(nextOwner);

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.setFeeRecipient(address(0));

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.setFeeRecipient(address(factory));
    }

    function test_falseReturningFeeTransferRevertsWithoutLosingBalance() public {
        (AdversarialFeeToken token, MembershipFactory hostileFactory) = _hostileFactory();
        token.mint(address(hostileFactory), 500_000);
        token.setTransferMode(AdversarialFeeToken.TransferMode.ReturnFalse);

        vm.prank(feeRecipient);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        hostileFactory.withdrawProtocolFees();

        assertEq(token.balanceOf(address(hostileFactory)), 500_000);
        assertEq(token.balanceOf(feeRecipient), 0);
    }

    function test_shortFeeTransferRevertsAtomically() public {
        (AdversarialFeeToken token, MembershipFactory hostileFactory) = _hostileFactory();
        token.mint(address(hostileFactory), 500_000);
        token.setTransferMode(AdversarialFeeToken.TransferMode.ShortTransfer);

        vm.prank(feeRecipient);
        vm.expectRevert(MembershipFactory.InexactTokenTransfer.selector);
        hostileFactory.withdrawProtocolFees();

        assertEq(token.balanceOf(address(hostileFactory)), 500_000);
        assertEq(token.balanceOf(feeRecipient), 0);
    }

    function test_reentrantRecipientCannotDoubleWithdraw() public {
        AdversarialFeeToken token = new AdversarialFeeToken();
        MembershipFactory hostileFactory =
            new MembershipFactory(token, address(renderer), address(this), feeRecipient);
        ReentrantFeeRecipient recipient = new ReentrantFeeRecipient(hostileFactory, address(token));
        hostileFactory.setFeeRecipient(address(recipient));
        token.mint(address(hostileFactory), 500_000);
        token.setTransferMode(AdversarialFeeToken.TransferMode.Callback);

        assertEq(recipient.withdraw(), 500_000);

        assertTrue(recipient.reentryAttempted());
        assertFalse(recipient.reentrySucceeded());
        assertEq(token.balanceOf(address(hostileFactory)), 0);
        assertEq(token.balanceOf(address(recipient)), 500_000);
    }

    function test_runtimeAndInitcodeRemainBelowNetworkLimits() public {
        uint256 gasBefore = gasleft();
        address tier = _createTier(factory, creator, _defaultConfig(creator));
        uint256 deployGas = gasBefore - gasleft();
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());

        assertLt(address(factory).code.length, _RUNTIME_LIMIT);
        assertLt(type(MembershipFactory).creationCode.length, _INITCODE_LIMIT);
        assertLt(factory.deployer().code.length, _RUNTIME_LIMIT);
        assertLt(type(MembershipTierDeployer).creationCode.length, _INITCODE_LIMIT);
        assertLt(tierDeployer.creationCodeStoreA().code.length, _RUNTIME_LIMIT);
        assertLt(tierDeployer.creationCodeStoreB().code.length, _RUNTIME_LIMIT);
        assertLt(tier.code.length, _RUNTIME_LIMIT);
        assertLt(type(MembershipTier).creationCode.length, _INITCODE_LIMIT);
        assertLt(address(renderer).code.length, _RUNTIME_LIMIT);
        assertLt(type(OnchainMetadataRenderer).creationCode.length, _INITCODE_LIMIT);
        assertLt(deployGas, _MAX_TIER_DEPLOY_GAS);
    }

    function _hostileFactory()
        private
        returns (AdversarialFeeToken token, MembershipFactory hostileFactory)
    {
        token = new AdversarialFeeToken();
        hostileFactory =
            new MembershipFactory(token, address(renderer), address(this), feeRecipient);
    }

    function _createTier(
        MembershipFactory targetFactory,
        address caller,
        MembershipTypes.TierConfig memory config
    ) private returns (address tier) {
        vm.prank(caller);
        tier = targetFactory.createTier(config);
    }

    function _defaultConfig(address tierCreator)
        private
        pure
        returns (MembershipTypes.TierConfig memory config)
    {
        config = MembershipTestConfig.defaultConfig(tierCreator);
    }

    function _contains(bytes memory haystack, bytes memory needle) private pure returns (bool) {
        if (needle.length == 0 || needle.length > haystack.length) return false;
        for (uint256 i; i <= haystack.length - needle.length; ++i) {
            bool matched = true;
            for (uint256 j; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }
        return false;
    }
}
