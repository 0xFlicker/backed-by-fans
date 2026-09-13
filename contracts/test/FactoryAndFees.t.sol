// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IMembershipFactory} from "../src/interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "../src/interfaces/IMembershipRenderer.sol";
import {IOnchainMediaStoreFactory} from "../src/interfaces/IOnchainMediaStoreFactory.sol";
import {RewardCurve} from "../src/libraries/RewardCurve.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract WrongSchemaRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return bytes32(uint256(1));
    }

    function engineCount() external pure returns (uint16) {
        return 1;
    }
}

contract EmptyManifestRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return 0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    }

    function engineCount() external pure returns (uint16) {
        return 0;
    }
}

contract FutureRenderer is IMembershipRenderer {
    error UnsupportedEngine(uint16 engine);

    function rendererSchema() external pure returns (bytes32) {
        return 0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    }

    function rendererName() external pure returns (string memory) {
        return "Future collection";
    }

    function engineCount() external pure returns (uint16) {
        return 7;
    }

    function engineName(uint16 engine) external pure returns (string memory) {
        if (engine >= 7) revert UnsupportedEngine(engine);
        return "FUTURE";
    }

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata
    ) external pure {
        if (art.engine >= 7) {
            revert UnsupportedEngine(art.engine);
        }
    }

    function previewSVG(MembershipTypes.PreviewContext calldata)
        external
        pure
        returns (string memory)
    {
        return '<svg xmlns="http://www.w3.org/2000/svg"/>';
    }

    function previewTokenURI(MembershipTypes.PreviewContext calldata)
        external
        pure
        returns (string memory)
    {
        return "data:application/json;base64,e30=";
    }

    function renderTokenURI(MembershipTypes.TokenRenderData calldata)
        external
        pure
        returns (string memory)
    {
        return "data:application/json;base64,e30=";
    }
}

contract FactoryAndFeesTest is Test {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }

    uint256 private constant _STANDARD_RUNTIME_LIMIT = 24_576;
    uint256 private constant _STANDARD_INITCODE_LIMIT = 49_152;
    uint256 private constant _ROBINHOOD_RUNTIME_LIMIT = 98_304;
    uint256 private constant _ROBINHOOD_INITCODE_LIMIT = 196_608;
    uint256 private constant _RENDERER_RUNTIME_LIMIT = 88_000;
    uint256 private constant _RENDERER_INITCODE_LIMIT = 176_000;
    // Includes immutable fee terms, protected reserves and the paid-time accounting surface.
    uint256 private constant _MAX_TIER_DEPLOY_GAS = 1_000_000;
    MockUSDG private paymentToken;
    MockUSDG private stockToken;
    OnchainMetadataRenderer private renderer;
    OnchainMediaStoreFactory private mediaStoreFactory;
    MembershipFactory private factory;

    address private creator;
    address private nextOwner;

    function setUp() public {
        new LinkedVestingFixture().install();
        creator = makeAddr("creator");
        nextOwner = makeAddr("nextOwner");

        paymentToken = new MockUSDG();
        stockToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        mediaStoreFactory = new OnchainMediaStoreFactory();
        SyntheticPonsBinding.bind(address(paymentToken));
        factory = new MembershipFactory(
            _tokens(paymentToken, stockToken),
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(paymentToken, stockToken))
        );
    }

    function test_minimumSnapshotBoundariesAndZeroPWYW() public {
        factory.setMinimumPayment(address(paymentToken), 1_000_000);
        MembershipTypes.TierConfig memory cfg =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        cfg.minimumPayment = 1_000_000;
        cfg.pricePerPeriod = 999_999;
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.PaymentBelowMinimum.selector, 999_999, 1_000_000
            )
        );
        factory.createTier(cfg);
        cfg.pricePerPeriod = 1_000_000;
        vm.prank(creator);
        MembershipTier fixedTier = MembershipTier(factory.createTier(cfg));
        assertEq(fixedTier.minimumPayment(), 1_000_000);
        cfg.pricePerPeriod = 0;
        cfg.tierSalt = bytes32(uint256(456));
        vm.prank(creator);
        MembershipTier pwyw = MembershipTier(factory.createTier(cfg));
        pwyw.createContributionMembership(0, address(0), 25);
        assertEq(pwyw.lifetimeGross(), 0);
        uint64 cursor = pwyw.accountingStatus().accountedThrough;
        vm.warp(block.timestamp + 1);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipTier.PaymentBelowMinimum.selector, 999_999, 1_000_000)
        );
        pwyw.createContributionMembership(999_999, address(0), 25);
        assertEq(pwyw.accountingStatus().accountedThrough, cursor);
        factory.setMinimumPayment(address(paymentToken), 2_000_000);
        assertEq(pwyw.minimumPayment(), 1_000_000);
        paymentToken.mint(address(this), 1_000_000);
        paymentToken.approve(address(pwyw), 1_000_000);
        pwyw.createContributionMembership(1_000_000, address(0), 25);
        assertEq(pwyw.lifetimeGross(), 1_000_000);
        cfg.tierSalt = bytes32(uint256(457));
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.MinimumPaymentChanged.selector, 1_000_000, 2_000_000
            )
        );
        factory.createTier(cfg);
        cfg.minimumPayment = 2_000_000;
        vm.prank(creator);
        assertEq(MembershipTier(factory.createTier(cfg)).minimumPayment(), 2_000_000);
    }

    function test_minimumAuthorityAndEnablement() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setMinimumPayment(address(paymentToken), 10);
        vm.expectRevert(MembershipFactory.InvalidMinimumPayment.selector);
        factory.setMinimumPayment(address(paymentToken), 0);
        MockUSDG fresh = new MockUSDG();
        vm.expectRevert(MembershipFactory.InvalidMinimumPayment.selector);
        factory.setPaymentTokenEnabled(address(fresh), true);
        factory.setMinimumPayment(address(fresh), 1_000_000);
        factory.setPaymentTokenEnabled(address(fresh), true);
        assertTrue(factory.isPaymentTokenEnabled(address(fresh)));
    }

    function test_constructorSetsProtocolDependenciesAndNonAdminDeployer() public view {
        assertEq(factory.paymentTokenCount(), 2);
        address[] memory paymentTokens = factory.paymentTokens(0, 10);
        assertEq(paymentTokens.length, 2);
        assertEq(paymentTokens[0], address(paymentToken));
        assertEq(paymentTokens[1], address(stockToken));
        assertTrue(factory.isPaymentTokenListed(address(paymentToken)));
        assertTrue(factory.isPaymentTokenEnabled(address(paymentToken)));
        assertTrue(factory.isPaymentTokenListed(address(stockToken)));
        assertTrue(factory.isPaymentTokenEnabled(address(stockToken)));
        assertEq(factory.mediaStoreFactory(), address(mediaStoreFactory));
        assertEq(factory.rendererSchema(), renderer.rendererSchema());
        assertEq(factory.mediaStoreFactoryRuntimeCodehash(), address(mediaStoreFactory).codehash);
        assertEq(factory.protocolToken(), address(paymentToken));
        assertEq(factory.owner(), address(this));
        assertGt(factory.buybackVault().code.length, 0);
        assertEq(factory.implementation(), MembershipTestConfig.implementation());
    }

    function test_factoryHasNoFeeRecipientWithdrawalOrArbitraryCallPath() public {
        paymentToken.mint(address(factory), 1_000_000);
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeWithSignature("withdrawProtocolFees(address)", address(paymentToken));
        calls[1] = abi.encodeWithSignature("setFeeRecipient(address)", creator);
        calls[2] = abi.encodeWithSignature(
            "execute(address,bytes)",
            address(paymentToken),
            abi.encodeCall(IERC20.transfer, (creator, 1_000_000))
        );
        for (uint256 i; i < calls.length; ++i) {
            (bool success,) = address(factory).call(calls[i]);
            assertFalse(success);
        }
        assertEq(paymentToken.balanceOf(address(factory)), 1_000_000);
        assertEq(paymentToken.balanceOf(creator), 0);
    }

    function test_paymentTokenPaginationIsStableAndBounded() public view {
        address[] memory firstPage = factory.paymentTokens(0, 1);
        address[] memory secondPage = factory.paymentTokens(1, 10);
        address[] memory emptyPage = factory.paymentTokens(2, 10);

        assertEq(firstPage.length, 1);
        assertEq(firstPage[0], address(paymentToken));
        assertEq(secondPage.length, 1);
        assertEq(secondPage[0], address(stockToken));
        assertEq(emptyPage.length, 0);
    }

    function test_paymentTokenPaginationAcceptsCallerLimit() public view {
        assertEq(factory.paymentTokens(0, type(uint256).max).length, 2);
    }

    function test_ownerCanAppendDisableAndReenablePaymentTokenWithoutDuplicateEvents() public {
        MockUSDG laterToken = new MockUSDG();
        factory.setMinimumPayment(address(laterToken), 1);

        vm.expectEmit(true, true, false, true, address(factory));
        emit IMembershipFactory.PaymentTokenListed(address(laterToken), 2);
        vm.expectEmit(true, false, false, true, address(factory));
        emit IMembershipFactory.PaymentTokenEnabled(address(laterToken));
        factory.setPaymentTokenEnabled(address(laterToken), true);

        vm.recordLogs();
        factory.setPaymentTokenEnabled(address(laterToken), true);
        assertEq(vm.getRecordedLogs().length, 0);

        vm.expectEmit(true, false, false, true, address(factory));
        emit IMembershipFactory.PaymentTokenDisabled(address(laterToken));
        factory.setPaymentTokenEnabled(address(laterToken), false);

        vm.recordLogs();
        factory.setPaymentTokenEnabled(address(laterToken), false);
        assertEq(vm.getRecordedLogs().length, 0);

        factory.setPaymentTokenEnabled(address(laterToken), true);
        assertEq(factory.paymentTokenCount(), 3);
        address[] memory listed = factory.paymentTokens(0, 10);
        assertEq(listed[2], address(laterToken));
        assertTrue(factory.isPaymentTokenListed(address(laterToken)));
        assertTrue(factory.isPaymentTokenEnabled(address(laterToken)));
    }

    function test_onlyOwnerCanChangePaymentTokenStatus() public {
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        factory.setPaymentTokenEnabled(address(stockToken), false);
    }

    function test_disabledPaymentTokenCannotPublishAndDoesNotConsumeSalt() public {
        factory.setPaymentTokenEnabled(address(stockToken), false);
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.paymentToken = address(stockToken);

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.PaymentTokenNotEnabled.selector, address(stockToken)
            )
        );
        factory.createTier(config);

        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));
    }

    function test_existingTierKeepsItsSelectedTokenAfterDisable() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.paymentToken = address(stockToken);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));

        factory.setPaymentTokenEnabled(address(stockToken), false);

        assertEq(address(tier.paymentToken()), address(stockToken));
        assertTrue(factory.isPaymentTokenListed(address(stockToken)));
        assertFalse(factory.isPaymentTokenEnabled(address(stockToken)));
    }

    function test_factoryUsesExactSharedImplementationRuntime() public view {
        assertEq(factory.implementation().code, type(MembershipTier).runtimeCode);
    }

    function test_factoryAndDeployerRuntimeDoNotEmbedTierCreationCode() public view {
        bytes memory prefix = new bytes(32);
        bytes memory creationCode = type(MembershipTier).creationCode;
        for (uint256 i; i < prefix.length; ++i) {
            prefix[i] = creationCode[i];
        }

        assertFalse(_contains(address(factory).code, prefix));
    }

    function test_anyCreatorCanDeployMultipleIndependentFullTiers() public {
        address first = _createTier(factory, creator, _defaultConfig(creator));
        MembershipTypes.TierConfig memory secondConfig = _defaultConfig(creator);
        secondConfig.tierSalt = keccak256("second-tier");
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

    function test_creatorTierSaltIsOneTimeAndAnchorsImmutableIdentity() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        bytes32 expectedIdentity = factory.predictTierIdentity(creator, config.tierSalt);

        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));
        address tierAddress = _createTier(factory, creator, config);
        MembershipTier tier = MembershipTier(tierAddress);

        assertTrue(factory.isTierSaltUsed(creator, config.tierSalt));
        assertEq(tier.tierIdentity(), expectedIdentity);
        assertEq(factory.tierForIdentity(expectedIdentity), tierAddress);

        config.pricePerPeriod = 99_000_000;
        config.metadata.description = "A different non-art draft";
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.TierSaltAlreadyUsed.selector, creator, config.tierSalt
            )
        );
        factory.createTier(config);
    }

    function test_tierIdentityDoesNotDependOnEconomicOrMutableMetadataInputs() public view {
        MembershipTypes.TierConfig memory first = _defaultConfig(creator);
        MembershipTypes.TierConfig memory changed = _defaultConfig(creator);
        changed.pricePerPeriod = type(uint96).max;
        changed.rewardBps = 1000;
        changed.metadata.description = "Changed before publication";
        changed.metadata.externalURI = "https://example.com/changed";

        bytes32 firstIdentity = factory.predictTierIdentity(creator, first.tierSalt);
        bytes32 changedIdentity = factory.predictTierIdentity(creator, changed.tierSalt);
        assertEq(firstIdentity, changedIdentity);
    }

    function test_zeroTierSaltRejectedByFactoryAndDirectTierConstruction() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.tierSalt = bytes32(0);

        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidTierSalt.selector);
        factory.createTier(config);

        vm.expectRevert(MembershipTier.InvalidTierSalt.selector);
        MembershipTestConfig.deployTier(address(factory), paymentToken, config);
    }

    function test_onchainMediaAdmissionRequiresCreatorAttributionAndSnapshotsExactConfig() public {
        bytes memory payload = RealImageFixtures.png();
        vm.prank(creator);
        address store = mediaStoreFactory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaRecord memory record = mediaStoreFactory.mediaRecord(store);

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.media = _nativeMedia(record);
        address tierAddress = _createTier(factory, creator, config);
        MembershipTier tier = MembershipTier(tierAddress);

        MembershipTypes.ArtConfig memory storedArt = tier.artConfig();
        MembershipTypes.MediaConfig memory storedMedia = tier.mediaConfig();
        assertEq(keccak256(abi.encode(storedArt)), keccak256(abi.encode(config.art)));
        assertEq(keccak256(abi.encode(storedMedia)), keccak256(abi.encode(config.media)));

        address otherCreator = makeAddr("otherCreator");
        MembershipTypes.TierConfig memory crossCreator = _defaultConfig(otherCreator);
        crossCreator.media = config.media;
        vm.prank(otherCreator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaCreatorMismatch.selector,
                store,
                otherCreator,
                creator
            )
        );
        factory.createTier(crossCreator);
        assertFalse(factory.isTierSaltUsed(otherCreator, crossCreator.tierSalt));
    }

    function test_onchainMediaAdmissionRequiresThePinnedRegistryCode() public {
        bytes memory payload = RealImageFixtures.png();
        vm.prank(creator);
        address store = mediaStoreFactory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaRecord memory record = mediaStoreFactory.mediaRecord(store);

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.media = _nativeMedia(record);

        bytes32 expectedCodehash = address(mediaStoreFactory).codehash;
        vm.etch(address(mediaStoreFactory), hex"00");
        bytes32 actualCodehash = address(mediaStoreFactory).codehash;
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.MediaStoreFactoryCodeChanged.selector,
                expectedCodehash,
                actualCodehash
            )
        );
        factory.createTier(config);
        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));
    }

    function test_onlyDescriptionAndExternalWebsiteCanChangeAfterPublication() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        bytes32 artHash = keccak256(abi.encode(tier.artConfig()));
        bytes32 mediaHash = keccak256(abi.encode(tier.mediaConfig()));
        bytes32 identity = tier.tierIdentity();

        MembershipTypes.TierMetadata memory updated = MembershipTypes.TierMetadata({
            description: "An updated description", externalURI: "https://example.com/updated"
        });
        vm.prank(creator);
        tier.setTierMetadata(updated);

        assertEq(tier.description(), updated.description);
        assertEq(tier.externalURI(), updated.externalURI);
        assertEq(keccak256(abi.encode(tier.artConfig())), artHash);
        assertEq(keccak256(abi.encode(tier.mediaConfig())), mediaHash);
        assertEq(tier.tierIdentity(), identity);
    }

    function test_directFutureRendererOwnsValidationBeyondFoundingSix() public {
        FutureRenderer futureRenderer = new FutureRenderer();

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.renderer = address(futureRenderer);
        config.art.engine = 6;
        config.tierSalt = keccak256("future-renderer-tier");

        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        assertEq(tier.renderer(), address(futureRenderer));
        assertEq(tier.artConfig().engine, 6);
    }

    function test_directFutureRendererRejectsItsOwnUnsupportedEngine() public {
        FutureRenderer futureRenderer = new FutureRenderer();

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.renderer = address(futureRenderer);
        config.art.engine = 7;
        config.tierSalt = keccak256("unsupported-future-engine-tier");

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FutureRenderer.UnsupportedEngine.selector, 7));
        factory.createTier(config);
        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));
    }

    function test_directRendererRejectsWrongSchemaAndEmptyManifest() public {
        WrongSchemaRenderer wrongSchema = new WrongSchemaRenderer();
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.renderer = address(wrongSchema);
        bytes32 expectedSchema = factory.rendererSchema();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.InvalidRendererSchema.selector,
                expectedSchema,
                bytes32(uint256(1))
            )
        );
        factory.createTier(config);

        EmptyManifestRenderer emptyManifest = new EmptyManifestRenderer();
        config.renderer = address(emptyManifest);
        config.tierSalt = keccak256("empty-manifest");
        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.createTier(config);
    }

    function test_creatorMustSelfAttributeOfficialTier() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);

        vm.expectRevert(MembershipFactory.CreatorMustBeCaller.selector);
        factory.createTier(config);

        config.creator = address(0);
        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.createTier(config);
    }

    function test_implementationAndCloneCannotBeReinitialized() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        bytes memory expected = abi.encodePacked(
            hex"363d3d373d3d3d363d73", factory.implementation(), hex"5af43d82803e903d91602b57fd5bf3"
        );
        assertEq(address(tier).code, expected);
        vm.expectRevert(bytes4(keccak256("InvalidInitialization()")));
        tier.initialize(config);
        MembershipTier implementation = MembershipTier(factory.implementation());
        vm.expectRevert(bytes4(keccak256("InvalidInitialization()")));
        implementation.initialize(config);
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

    function test_tierPaginationIsStableBoundedAndAuthentic() public {
        address[] memory expected = new address[](5);
        for (uint256 i; i < expected.length; ++i) {
            MembershipTypes.TierConfig memory config = _defaultConfig(creator);
            config.tierSalt = keccak256(abi.encode("pagination-tier", i));
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

        uint256 invalidPageSize = 100 + 1;
        assertEq(factory.tiers(0, invalidPageSize).length, 5);
    }

    function test_invalidFactoryConstructorConfigurationReverts() public {
        IERC20[] memory emptyTokens = new IERC20[](0);
        vm.expectRevert(MembershipFactory.EmptyPaymentTokenList.selector);
        new MembershipFactory(
            emptyTokens,
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(emptyTokens)
        );

        IERC20[] memory invalidTokens = _tokens(IERC20(address(0)));
        vm.expectRevert(
            abi.encodeWithSelector(MembershipFactory.InvalidPaymentToken.selector, address(0))
        );
        new MembershipFactory(
            invalidTokens,
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(invalidTokens)
        );

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(
            _tokens(paymentToken),
            address(0),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(paymentToken))
        );

        address notToken = makeAddr("notToken");
        vm.expectRevert(
            abi.encodeWithSelector(MembershipFactory.InvalidPaymentToken.selector, notToken)
        );
        new MembershipFactory(
            _tokens(IERC20(notToken)),
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(IERC20(notToken)))
        );

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(
            _tokens(paymentToken),
            makeAddr("notMediaFactory"),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(paymentToken))
        );

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MembershipFactory(
            _tokens(paymentToken),
            address(mediaStoreFactory),
            address(0),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(paymentToken))
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.DuplicatePaymentToken.selector, address(paymentToken)
            )
        );
        new MembershipFactory(
            _tokens(paymentToken, paymentToken),
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(_tokens(paymentToken, paymentToken))
        );
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

    function test_protocolAllocationBoundsMatchFactoryAndDirectTier() public {
        uint16[4] memory invalid = [uint16(0), 99, 10_001, type(uint16).max];
        for (uint256 i; i < invalid.length; ++i) {
            MembershipTypes.TierConfig memory config = _defaultConfig(creator);
            config.protocolFeeBps = invalid[i];
            vm.prank(creator);
            vm.expectRevert(MembershipFactory.InvalidRateTotal.selector);
            factory.createTier(config);
            vm.expectRevert(MembershipTier.InvalidRateTotal.selector);
            MembershipTestConfig.deployTier(address(factory), paymentToken, config);
        }
    }

    function test_protocolAllocationRejectsCombinedRateOverflow() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.protocolFeeBps = 10_000;
        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRateTotal.selector);
        factory.createTier(config);
        vm.expectRevert(MembershipTier.InvalidRateTotal.selector);
        MembershipTestConfig.deployTier(address(factory), paymentToken, config);
    }

    function test_protocolAllocationIsImmutableAcrossOwnershipTransfer() public {
        uint16[3] memory rates = [uint16(100), 1234, 10_000];
        for (uint256 i; i < rates.length; ++i) {
            MembershipTypes.TierConfig memory config = _defaultConfig(creator);
            config.tierSalt = bytes32(i + 1);
            config.protocolFeeBps = rates[i];
            config.rewardBps = 0;
            config.referralBps = 0;
            MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
            vm.prank(creator);
            tier.transferOwnership(nextOwner);
            vm.prank(nextOwner);
            tier.acceptOwnership();
            assertEq(tier.protocolFeeBps(), rates[i]);
            vm.prank(nextOwner);
            (bool changed,) = address(tier)
                .call(abi.encodeWithSignature("setProtocolFeeBps(uint16)", uint16(100)));
            assertFalse(changed);
            assertEq(tier.protocolFeeBps(), rates[i]);
        }
    }

    function testFuzz_protocolAllocationRetainsIndependentFloors(
        uint128 gross,
        uint16 rate,
        bool referred
    ) public {
        gross = uint128(bound(gross, 0, type(uint112).max));
        rate = uint16(bound(rate, 100, 10_000));
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.pricePerPeriod = 0;
        config.protocolFeeBps = rate;
        config.rewardBps = uint16((10_000 - rate) / 2);
        config.referralBps = uint16(10_000 - rate - config.rewardBps);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        paymentToken.mint(address(this), gross);
        paymentToken.approve(address(tier), gross);
        tier.createContributionMembership(gross, referred ? nextOwner : address(0), 25);
        uint256 fee = uint256(gross) * rate / 10_000;
        uint256 reward = uint256(gross) * config.rewardBps / 10_000;
        uint256 referral = referred ? uint256(gross) * config.referralBps / 10_000 : 0;
        uint256 q = 1 << 128;
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        assertEq(reserves.unearnedScaled[0], (uint256(gross) - fee - reward - referral) * q);
        assertEq(reserves.unearnedScaled[1], reward * q);
        assertEq(reserves.unearnedScaled[2], referral * q);
        assertEq(reserves.unearnedScaled[3], fee * q);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.totalProtectedLiability(), gross);
        assertEq(paymentToken.balanceOf(address(tier)), gross);
        assertEq(paymentToken.balanceOf(address(factory)), 0);
        assertEq(paymentToken.balanceOf(factory.buybackVault()), 0);
    }

    function test_fullAllocationProtectsAllGrossFromCreatorWithdrawal() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        paymentToken.mint(address(this), 120_000_000);
        paymentToken.approve(address(tier), 120_000_000);
        tier.createMembership(12, address(0), 25);
        vm.prank(creator);
        assertEq(tier.withdrawCreatorProceeds(), 0);
        assertEq(tier.totalProtectedLiability(), 120_000_000);
        assertEq(paymentToken.balanceOf(address(tier)), 120_000_000);
    }

    function test_factoryRejectsEOASuccessorAndTierOwnershipRemainsTwoStep() public {
        // Canonical Safe successor acceptance is exercised with actual signatures
        // in RobinhoodSafe.t.sol. This old EOA transfer is intentionally rejected.
        vm.expectRevert();
        factory.transferOwnership(nextOwner);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), address(0));

        vm.prank(nextOwner);
        vm.expectRevert();
        factory.acceptOwnership();
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), address(0));

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        factory.transferOwnership(address(0));

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

    function test_curveTermsValidateAtFactoryAndDirectTierAndReadBack() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.startingBoostBps = 15_000;
        config.earlySupportGross = uint112(config.pricePerPeriod * 1000);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        assertEq(tier.startingBoostBps(), 15_000);
        assertEq(tier.earlySupportGross(), config.earlySupportGross);
        MembershipTypes.ShareQuote memory quote = tier.previewShares(config.earlySupportGross);
        assertEq(quote.grossBefore, 0);
        assertEq(quote.grossAfter, config.earlySupportGross);
        assertEq(quote.sharesAdded, uint256(config.earlySupportGross) * 5 / 4);
        config.tierSalt = keccak256("invalid-curve");
        config.earlySupportGross++;
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        _createTier(factory, creator, config);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        MembershipTestConfig.deployTier(address(factory), paymentToken, config);
    }

    function test_runtimeAndInitcodeRemainBelowNetworkLimits() public {
        uint256 gasBefore = gasleft();
        address tier = _createTier(factory, creator, _defaultConfig(creator));
        uint256 deployGas = gasBefore - gasleft();
        emit log_named_uint("creator tier deployment gas", deployGas);

        assertLt(address(factory).code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLt(type(MembershipFactory).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLt(tier.code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLt(type(MembershipTier).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLt(address(renderer).code.length, _RENDERER_RUNTIME_LIMIT);
        assertLt(type(OnchainMetadataRenderer).creationCode.length, _RENDERER_INITCODE_LIMIT);
        assertLt(address(mediaStoreFactory).code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLt(deployGas, _MAX_TIER_DEPLOY_GAS);
    }

    function test_invalidCurveSettingsMatchFactoryAndDirectConstruction() public {
        for (uint256 i; i < 8; ++i) {
            MembershipTypes.TierConfig memory config = _defaultConfig(creator);
            config.startingBoostBps = 15_000;
            config.pricePerPeriod = 1;
            config.earlySupportGross = 1000;
            if (i == 0) config.startingBoostBps = 0;
            if (i == 1) config.startingBoostBps = 10_050;
            if (i == 2) config.startingBoostBps = 100_100;
            if (i == 3) config.startingBoostBps = 10_000; // None requires H=0.
            if (i == 4) config.earlySupportGross = 0;
            if (i == 5) config.pricePerPeriod = 3; // H is not whole periods.
            if (i == 6) config.earlySupportGross = uint112(uint256(type(uint64).max) + 1);
            if (i == 7) config.pricePerPeriod = uint256(type(uint112).max) + 1;
            vm.prank(creator);
            vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
            factory.createTier(config);
            vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
            MembershipTestConfig.deployTier(address(factory), paymentToken, config);
        }
        assertEq(factory.tierCount(), 0);
    }

    function test_curveAndRatesStayImmutableAcrossOwnershipAndLaterPublication() public {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.startingBoostBps = 23_700;
        config.earlySupportGross = uint112(config.pricePerPeriod * 731);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        vm.prank(creator);
        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        tier.acceptOwnership();
        bytes[] memory calls = new bytes[](5);
        calls[0] =
            abi.encodeWithSignature("setRewardCurve(uint32,uint112)", uint32(10_000), uint112(0));
        calls[1] = abi.encodeWithSignature("setStartingBoostBps(uint32)", uint32(30_000));
        calls[2] = abi.encodeWithSignature("setEarlySupportGross(uint112)", uint112(1));
        calls[3] = abi.encodeWithSignature("setRewardBps(uint16)", uint16(0));
        calls[4] = abi.encodeWithSignature("setReferralBps(uint16)", uint16(0));
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(nextOwner);
            (bool changed,) = address(tier).call(calls[i]);
            assertFalse(changed);
        }
        config.tierSalt = keccak256("later publication defaults");
        config.startingBoostBps = 10_000;
        config.earlySupportGross = 0;
        _createTier(factory, creator, config);
        assertEq(tier.startingBoostBps(), 23_700);
        assertEq(tier.earlySupportGross(), config.pricePerPeriod * 731);
        assertEq(tier.rewardBps(), config.rewardBps);
        assertEq(tier.referralBps(), config.referralBps);
    }

    function test_lifetimeCapacityRejectsNewPaymentsWithoutBlockingClaimsRefundsOrFreeAccess()
        public
    {
        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.pricePerPeriod = 0;
        config.periodDuration = 100;
        config.startingBoostBps = 100_000;
        config.earlySupportGross = 1000;
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        uint256 cap = type(uint112).max;
        paymentToken.mint(address(this), cap + 1);
        paymentToken.approve(address(tier), type(uint256).max);
        uint256 id = tier.createContributionMembership(cap, address(0), 25);
        assertEq(tier.lifetimeGross(), cap);
        assertEq(tier.sharesOf(id), cap + 4500);
        uint64 expiry = tier.expiresAt(id);
        bytes32 reservesBefore = keccak256(abi.encode(tier.reserveState()));
        vm.expectRevert(MembershipTier.CurveCapacityExceeded.selector);
        tier.createContributionMembership(1, address(0), 25);
        assertEq(paymentToken.balanceOf(address(this)), 1);
        assertEq(tier.expiresAt(id), expiry);
        assertEq(keccak256(abi.encode(tier.reserveState())), reservesBefore);
        vm.warp(block.timestamp + 50);
        tier.processAccounting(25);
        assertGt(tier.claimReward(id, 25), 0);
        vm.prank(creator);
        assertGt(tier.withdrawCreatorProceeds(), 0);
        vm.prank(creator);
        assertEq(tier.refund(id, address(this), cap, 25), cap / 2);
        assertEq(tier.lifetimeGross(), cap);
        assertEq(tier.sharesOf(id), 0);
        tier.createContributionMembership(0, address(0), 25);
        assertTrue(
            (tier.tokensOfOwner(address(this), 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(address(this), 0, 1).tokenIds[0]))
        );
        assertFalse(tier.rewardEligible(id));
        assertEq(tier.lifetimeGross(), cap);
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
        view
        returns (MembershipTypes.TierConfig memory config)
    {
        config = MembershipTestConfig.defaultConfig(
            tierCreator, address(renderer), address(paymentToken)
        );
    }

    function _tokens(IERC20 token) private pure returns (IERC20[] memory tokens_) {
        tokens_ = new IERC20[](1);
        tokens_[0] = token;
    }

    function _tokens(IERC20 first, IERC20 second) private pure returns (IERC20[] memory tokens_) {
        tokens_ = new IERC20[](2);
        tokens_[0] = first;
        tokens_[1] = second;
    }

    function _nativeMedia(MembershipTypes.MediaRecord memory record)
        private
        pure
        returns (MembershipTypes.MediaConfig memory)
    {
        return MembershipTypes.MediaConfig({
            mime: record.mime,
            store: record.store,
            length: record.length,
            digest: record.digest,
            runtimeCodehash: record.runtimeCodehash
        });
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
