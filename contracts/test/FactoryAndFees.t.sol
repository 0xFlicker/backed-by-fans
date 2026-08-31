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
import {IMembershipRenderer} from "../src/interfaces/IMembershipRenderer.sol";
import {IOnchainMediaStoreFactory} from "../src/interfaces/IOnchainMediaStoreFactory.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";
import {AdversarialFeeToken} from "./mocks/AdversarialFeeToken.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {ReentrantFeeRecipient} from "./mocks/ReentrantFeeRecipient.sol";

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
    uint256 private constant _STANDARD_RUNTIME_LIMIT = 24_576;
    uint256 private constant _STANDARD_INITCODE_LIMIT = 49_152;
    uint256 private constant _ROBINHOOD_RUNTIME_LIMIT = 98_304;
    uint256 private constant _ROBINHOOD_INITCODE_LIMIT = 196_608;
    uint256 private constant _RENDERER_RUNTIME_LIMIT = 88_000;
    uint256 private constant _RENDERER_INITCODE_LIMIT = 176_000;
    uint256 private constant _MAX_TIER_DEPLOY_GAS = 6_500_000;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    OnchainMediaStoreFactory private mediaStoreFactory;
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
        mediaStoreFactory = new OnchainMediaStoreFactory();
        factory = new MembershipFactory(
            paymentToken, address(renderer), address(mediaStoreFactory), address(this), feeRecipient
        );
    }

    function test_constructorRegistersInitialRendererAndNonAdminDeployer() public view {
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        MembershipTypes.RendererRecord memory initialRenderer = factory.rendererRecord(1);

        assertEq(address(factory.paymentToken()), address(paymentToken));
        assertEq(factory.mediaStoreFactory(), address(mediaStoreFactory));
        assertEq(factory.rendererSchema(), renderer.rendererSchema());
        assertEq(factory.rendererCount(), 1);
        assertEq(factory.rendererVersionOf(address(renderer)), 1);
        assertEq(initialRenderer.implementation, address(renderer));
        assertEq(initialRenderer.runtimeCodehash, address(renderer).codehash);
        assertTrue(initialRenderer.enabled);
        assertEq(factory.mediaStoreFactoryRuntimeCodehash(), address(mediaStoreFactory).codehash);
        assertEq(factory.protocolFeeBps(), 100);
        assertEq(factory.maxPageSize(), 100);
        assertEq(factory.owner(), address(this));
        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(tierDeployer.factory(), address(factory));
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
        assertEq(firstTier.rendererVersion(), 1);
        assertEq(firstTier.rendererRuntimeCodehash(), address(renderer).codehash);
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
        new MembershipTier(
            address(factory), paymentToken, 1, address(renderer), address(renderer).codehash, config
        );
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

    function test_ownerAppendsDisabledRendererThenEnablesItForNewTiers() public {
        OnchainMetadataRenderer secondRenderer = new OnchainMetadataRenderer();
        uint32 version = factory.registerRenderer(address(secondRenderer));
        MembershipTypes.RendererRecord memory pending = factory.rendererRecord(version);

        assertEq(version, 2);
        assertEq(factory.rendererCount(), 2);
        assertEq(factory.rendererVersionOf(address(secondRenderer)), version);
        assertEq(pending.implementation, address(secondRenderer));
        assertEq(pending.runtimeCodehash, address(secondRenderer).codehash);
        assertFalse(pending.enabled);

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.rendererVersion = version;
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipFactory.RendererNotEnabled.selector, version)
        );
        factory.createTier(config);
        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));

        factory.setRendererEnabled(version, true);
        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        assertEq(tier.rendererVersion(), version);
        assertEq(tier.renderer(), address(secondRenderer));
        assertEq(tier.rendererRuntimeCodehash(), address(secondRenderer).codehash);
    }

    function test_registeredFutureRendererOwnsValidationBeyondFoundingSix() public {
        FutureRenderer futureRenderer = new FutureRenderer();
        uint32 version = factory.registerRenderer(address(futureRenderer));
        factory.setRendererEnabled(version, true);

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.rendererVersion = version;
        config.art.engine = 6;
        config.tierSalt = keccak256("future-renderer-tier");

        MembershipTier tier = MembershipTier(_createTier(factory, creator, config));
        assertEq(tier.rendererVersion(), version);
        assertEq(tier.renderer(), address(futureRenderer));
        assertEq(tier.artConfig().engine, 6);
    }

    function test_registeredFutureRendererRejectsItsOwnUnsupportedEngine() public {
        FutureRenderer futureRenderer = new FutureRenderer();
        uint32 version = factory.registerRenderer(address(futureRenderer));
        factory.setRendererEnabled(version, true);

        MembershipTypes.TierConfig memory config = _defaultConfig(creator);
        config.rendererVersion = version;
        config.art.engine = 7;
        config.tierSalt = keccak256("unsupported-future-engine-tier");

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FutureRenderer.UnsupportedEngine.selector, 7));
        factory.createTier(config);
        assertFalse(factory.isTierSaltUsed(creator, config.tierSalt));
    }

    function test_disablingRendererOnlyBlocksFutureTiers() public {
        MembershipTier published =
            MembershipTier(_createTier(factory, creator, _defaultConfig(creator)));
        vm.prank(creator);
        uint256 tokenId = published.grantTime(creator, 1);
        string memory beforeDisable = published.tokenURI(tokenId);

        factory.setRendererEnabled(1, false);
        assertFalse(factory.rendererRecord(1).enabled);
        assertEq(published.tokenURI(tokenId), beforeDisable);

        MembershipTypes.TierConfig memory next = _defaultConfig(creator);
        next.tierSalt = keccak256("disabled-renderer-tier");
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(MembershipFactory.RendererNotEnabled.selector, 1));
        factory.createTier(next);
        assertFalse(factory.isTierSaltUsed(creator, next.tierSalt));
    }

    function test_rendererRegistryRejectsUnauthorizedDuplicateAndInvalidEntries() public {
        OnchainMetadataRenderer candidate = new OnchainMetadataRenderer();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        factory.registerRenderer(address(candidate));

        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.RendererAlreadyRegistered.selector, address(renderer), 1
            )
        );
        factory.registerRenderer(address(renderer));

        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.registerRenderer(makeAddr("not-renderer"));

        WrongSchemaRenderer wrongSchema = new WrongSchemaRenderer();
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.InvalidRendererSchema.selector,
                factory.rendererSchema(),
                bytes32(uint256(1))
            )
        );
        factory.registerRenderer(address(wrongSchema));

        EmptyManifestRenderer emptyManifest = new EmptyManifestRenderer();
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.registerRenderer(address(emptyManifest));
    }

    function test_changedRendererCodeCannotBeEnabledOrUsedForNewTiers() public {
        OnchainMetadataRenderer candidate = new OnchainMetadataRenderer();
        uint32 version = factory.registerRenderer(address(candidate));
        bytes32 expectedCodehash = address(candidate).codehash;
        vm.etch(address(candidate), hex"00");
        bytes32 actualCodehash = address(candidate).codehash;

        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.RendererCodeChanged.selector,
                address(candidate),
                expectedCodehash,
                actualCodehash
            )
        );
        factory.setRendererEnabled(version, true);
    }

    function test_publishedTierPinsRendererCodeAndNewTiersRequireTheSameCode() public {
        MembershipTier published =
            MembershipTier(_createTier(factory, creator, _defaultConfig(creator)));
        vm.prank(creator);
        uint256 tokenId = published.grantTime(creator, 1);

        bytes32 expectedCodehash = address(renderer).codehash;
        vm.etch(address(renderer), hex"00");
        bytes32 actualCodehash = address(renderer).codehash;

        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.RendererCodeChanged.selector, expectedCodehash, actualCodehash
            )
        );
        published.tokenURI(tokenId);

        MembershipTypes.TierConfig memory next = _defaultConfig(creator);
        next.tierSalt = keccak256("changed-renderer-tier");
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.RendererCodeChanged.selector,
                address(renderer),
                expectedCodehash,
                actualCodehash
            )
        );
        factory.createTier(next);
        assertFalse(factory.isTierSaltUsed(creator, next.tierSalt));
    }

    function test_rendererStatusChangesRequireOwnerAndKnownVersion() public {
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator)
        );
        factory.setRendererEnabled(1, false);

        vm.expectRevert(
            abi.encodeWithSelector(MembershipFactory.UnknownRendererVersion.selector, 2)
        );
        factory.setRendererEnabled(2, true);

        vm.expectRevert(
            abi.encodeWithSelector(MembershipFactory.RendererStatusUnchanged.selector, 1, true)
        );
        factory.setRendererEnabled(1, true);
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
        tierDeployer.deploy(paymentToken, 1, address(renderer), address(renderer).codehash, config);
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

        uint256 invalidPageSize = factory.maxPageSize() + 1;
        vm.expectRevert(MembershipFactory.InvalidPageSize.selector);
        factory.tiers(0, invalidPageSize);
    }

    function test_invalidFactoryConstructorConfigurationReverts() public {
        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(
            IERC20(address(0)),
            address(renderer),
            address(mediaStoreFactory),
            address(this),
            feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(
            paymentToken, address(0), address(mediaStoreFactory), address(this), feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(
            paymentToken, address(renderer), address(0), address(this), feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(
            IERC20(makeAddr("notToken")),
            address(renderer),
            address(mediaStoreFactory),
            address(this),
            feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(
            paymentToken,
            makeAddr("notRenderer"),
            address(mediaStoreFactory),
            address(this),
            feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidContract.selector);
        new MembershipFactory(
            paymentToken,
            address(renderer),
            makeAddr("notMediaFactory"),
            address(this),
            feeRecipient
        );

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MembershipFactory(
            paymentToken, address(renderer), address(mediaStoreFactory), address(0), feeRecipient
        );

        vm.expectRevert(MembershipFactory.InvalidAddress.selector);
        new MembershipFactory(
            paymentToken, address(renderer), address(mediaStoreFactory), address(this), address(0)
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
        MembershipFactory hostileFactory = new MembershipFactory(
            token, address(renderer), address(mediaStoreFactory), address(this), feeRecipient
        );
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

        assertLt(address(factory).code.length, _STANDARD_RUNTIME_LIMIT);
        assertLt(type(MembershipFactory).creationCode.length, _STANDARD_INITCODE_LIMIT);
        assertLt(factory.deployer().code.length, _STANDARD_RUNTIME_LIMIT);
        assertLt(type(MembershipTierDeployer).creationCode.length, _STANDARD_INITCODE_LIMIT);
        assertLt(tierDeployer.creationCodeStoreA().code.length, _STANDARD_RUNTIME_LIMIT);
        assertLt(tierDeployer.creationCodeStoreB().code.length, _STANDARD_RUNTIME_LIMIT);
        assertLt(tier.code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLt(type(MembershipTier).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLt(address(renderer).code.length, _RENDERER_RUNTIME_LIMIT);
        assertLt(type(OnchainMetadataRenderer).creationCode.length, _RENDERER_INITCODE_LIMIT);
        assertLt(address(mediaStoreFactory).code.length, _STANDARD_RUNTIME_LIMIT);
        assertLt(deployGas, _MAX_TIER_DEPLOY_GAS);
    }

    function _hostileFactory()
        private
        returns (AdversarialFeeToken token, MembershipFactory hostileFactory)
    {
        token = new AdversarialFeeToken();
        hostileFactory = new MembershipFactory(
            token, address(renderer), address(mediaStoreFactory), address(this), feeRecipient
        );
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
