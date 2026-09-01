// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {IMembershipRenderer} from "../src/interfaces/IMembershipRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract ImageInputRenderer is IMembershipRenderer {
    bytes32 private constant _SCHEMA = keccak256("BackedByFans.MembershipRenderer.v1");

    function rendererSchema() external pure returns (bytes32) {
        return _SCHEMA;
    }

    function rendererName() external pure returns (string memory) {
        return "Image Input Test";
    }

    function engineCount() external pure returns (uint16) {
        return 1;
    }

    function engineName(uint16) external pure returns (string memory) {
        return "TRANSFORM";
    }

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata,
        MembershipTypes.MediaConfig calldata
    ) external pure {}

    function previewSVG(MembershipTypes.PreviewContext calldata context)
        external
        pure
        returns (string memory)
    {
        return string(abi.encode(context.nativeMedia, context.token.media.digest));
    }

    function previewTokenURI(MembershipTypes.PreviewContext calldata context)
        external
        pure
        returns (string memory)
    {
        return string(abi.encode(context.nativeMedia, context.token.media.digest));
    }

    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external
        pure
        returns (string memory)
    {
        return string(abi.encode(data.media.store, data.media.digest, data.media.length));
    }
}

contract CustomRendererImageInputTest is Test {
    MockUSDG private paymentToken;
    OnchainMediaStoreFactory private mediaStoreFactory;
    MembershipFactory private factory;
    ImageInputRenderer private renderer;
    address private creator;

    function setUp() public {
        creator = makeAddr("creator");
        paymentToken = new MockUSDG();
        mediaStoreFactory = new OnchainMediaStoreFactory();
        renderer = new ImageInputRenderer();
        factory = new MembershipFactory(
            paymentToken, address(mediaStoreFactory), address(this), makeAddr("feeRecipient")
        );
    }

    function test_previewContextPassesBrowserNativeMediaWithoutPreservationRules() public view {
        bytes memory browserImage = RealImageFixtures.png();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer));
        config.media.digest = keccak256("configured-media");
        MembershipTypes.TokenRenderData memory token = MembershipTypes.TokenRenderData({
            tierName: config.name,
            description: config.metadata.description,
            externalURI: config.metadata.externalURI,
            tierIdentity: keccak256("tier"),
            art: config.art,
            media: config.media,
            tokenId: 7,
            expiration: uint64(block.timestamp + 1 days),
            active: true
        });
        MembershipTypes.PreviewContext memory context =
            MembershipTypes.PreviewContext({token: token, nativeMedia: browserImage});

        (bytes memory receivedImage, bytes32 receivedDigest) =
            abi.decode(bytes(renderer.previewSVG(context)), (bytes, bytes32));

        assertEq(receivedImage, browserImage);
        assertEq(receivedDigest, config.media.digest);
    }

    function test_tierPassesConfiguredOnchainMediaToCustomRenderer() public {
        bytes memory payload = RealImageFixtures.png();
        vm.prank(creator);
        address store = mediaStoreFactory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaRecord memory record = mediaStoreFactory.mediaRecord(store);
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer));
        config.media = MembershipTypes.MediaConfig({
            mime: record.mime,
            store: record.store,
            length: record.length,
            digest: record.digest,
            runtimeCodehash: record.runtimeCodehash
        });

        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));
        paymentToken.mint(creator, config.pricePerPeriod);
        vm.startPrank(creator);
        paymentToken.approve(address(tier), config.pricePerPeriod);
        uint256 tokenId = tier.purchase(1, address(0));
        vm.stopPrank();

        (address receivedStore, bytes32 receivedDigest, uint32 receivedLength) =
            abi.decode(bytes(tier.tokenURI(tokenId)), (address, bytes32, uint32));

        assertEq(receivedStore, store);
        assertEq(receivedDigest, record.digest);
        assertEq(receivedLength, record.length);
    }
}
