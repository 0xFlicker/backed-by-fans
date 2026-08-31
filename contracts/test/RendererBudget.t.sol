// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Test, console2} from "forge-std/Test.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {RendererPrimitives} from "../src/renderer/RendererPrimitives.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

/// @notice Shipping-path budgets for Robinhood's larger code and initcode limits.
/// @dev Large media is etched because Forge's test VM cannot model Robinhood's raised
///      EIP-3860 ceiling. The real deployment transaction is exercised against configured
///      Anvil/fork nodes by the local lifecycle script.
contract RendererBudgetTest is Test {
    using SafeCast for uint256;

    struct SurfaceBudget {
        uint256 svgBytes;
        uint256 tokenURIBytes;
        uint256 svgGas;
        uint256 tokenURIGas;
    }

    uint256 private constant _ROBINHOOD_RUNTIME_LIMIT = 98_304;
    uint256 private constant _ROBINHOOD_INITCODE_LIMIT = 196_608;
    uint256 private constant _RENDERER_RUNTIME_LIMIT = 88_000;
    uint256 private constant _RENDERER_INITCODE_LIMIT = 176_000;
    uint256 private constant _MAX_RENDERABLE_MEDIA_BYTES = 90 * 1024;
    uint256 private constant _MAX_TOKEN_URI_BYTES = 600_000;
    uint256 private constant _MAX_RPC_HEX_BYTES = 1_200_002;

    MockUSDG private paymentToken;
    OnchainMediaStoreFactory private mediaFactory;
    OnchainMetadataRenderer private renderer;

    function setUp() public {
        paymentToken = new MockUSDG();
        mediaFactory = new OnchainMediaStoreFactory();
        renderer = new OnchainMetadataRenderer();
    }

    function test_contractArtifactsStayInsideRobinhoodAndProjectLimits() public pure {
        assertLe(type(OnchainMetadataRenderer).runtimeCode.length, _RENDERER_RUNTIME_LIMIT);
        assertLe(type(OnchainMetadataRenderer).creationCode.length, _RENDERER_INITCODE_LIMIT);
        assertLe(type(OnchainMediaStoreFactory).runtimeCode.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLe(type(OnchainMediaStoreFactory).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLe(type(MembershipFactory).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLe(type(MembershipTier).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
        assertLe(type(MembershipTierDeployer).creationCode.length, _ROBINHOOD_INITCODE_LIMIT);
    }

    function test_lowLevelCodeStoreBoundaryReservesOneSTOPByte() public view {
        assertEq(mediaFactory.maxCodeStorePayloadBytes(), _ROBINHOOD_RUNTIME_LIMIT - 1);
        assertEq(mediaFactory.maxRenderableMediaBytes(), _MAX_RENDERABLE_MEDIA_BYTES);
    }

    function test_noMediaRealFactoryTierMintAndTokenURIPath() public {
        MembershipFactory factory = new MembershipFactory(
            IERC20(address(paymentToken)), address(mediaFactory), address(this), address(this)
        );
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer));
        MembershipTier tier = MembershipTier(factory.createTier(config));
        uint256 tokenId = tier.grantTime(makeAddr("no-media-member"), 1);

        uint256 gasBefore = gasleft();
        string memory tokenURI = tier.tokenURI(tokenId);
        uint256 gasUsed = gasBefore - gasleft();

        _assertOutputBudget("none", 0, gasUsed, bytes(tokenURI).length);
        assertTrue(factory.isRegisteredTier(address(tier)));
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        assertLe(address(factory).code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLe(address(tier).code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLe(address(tierDeployer).code.length, _ROBINHOOD_RUNTIME_LIMIT);
        assertLe(tierDeployer.creationCodeStoreA().code.length, 24_576);
        assertLe(tierDeployer.creationCodeStoreB().code.length, 24_576);
    }

    function test_24KiBPublicTierTokenURIPath() public {
        _measureNativePath(24 * 1024, 0);
    }

    function test_64KiBPublicTierTokenURIPath() public {
        _measureNativePath(64 * 1024, 0);
    }

    function test_80KiBPublicTierTokenURIPath() public {
        _measureNativePath(80 * 1024, 0);
    }

    function test_90KiBStackPublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 0);
    }

    function test_90KiBChorusPublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 1);
    }

    function test_90KiBLoomPublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 2);
    }

    function test_90KiBBloomPublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 3);
    }

    function test_90KiBMarqueePublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 4);
    }

    function test_90KiBAfterimagePublicTierTokenURIPath() public {
        _measureNativePath(_MAX_RENDERABLE_MEDIA_BYTES, 5);
    }

    function _measureNativePath(uint256 mediaLength, uint16 engine) private {
        (MembershipTier tier, MembershipTypes.TierConfig memory config, uint256 tokenId) =
            _deployNativeTier(mediaLength, engine);
        MembershipTypes.PreviewContext memory preview = _preview(tier, config, tokenId);
        SurfaceBudget memory surfaces = _measureSurfaces(preview, tier, tokenId);
        string memory engineName = RendererPrimitives.engineName(engine);
        console2.log("renderer budget engine", engineName);
        console2.log("renderer budget media bytes", mediaLength);
        console2.log("renderer budget SVG bytes", surfaces.svgBytes);
        console2.log("renderer budget tokenURI bytes", surfaces.tokenURIBytes);
        console2.log("renderer budget SVG gas", surfaces.svgGas);
        console2.log("renderer budget public tokenURI gas", surfaces.tokenURIGas);

        assertTrue(surfaces.svgBytes > mediaLength);
        _assertOutputBudget(engineName, mediaLength, surfaces.tokenURIGas, surfaces.tokenURIBytes);
    }

    function _deployNativeTier(uint256 mediaLength, uint16 engine)
        private
        returns (MembershipTier tier, MembershipTypes.TierConfig memory config, uint256 tokenId)
    {
        (address store, bytes32 digest, bytes32 runtimeCodehash) =
            _etchNativePayload(mediaLength, engine);
        config = MembershipTestConfig.defaultConfig(address(this), address(renderer));
        config.tierSalt = keccak256(abi.encode("budget-tier", mediaLength, engine));
        config.art.engine = engine;
        config.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.JPEG,
            store: store,
            length: mediaLength.toUint32(),
            digest: digest,
            runtimeCodehash: runtimeCodehash
        });
        tier = new MembershipTier(address(this), IERC20(address(paymentToken)), config);
        tokenId = tier.grantTime(
            makeAddr(
                string.concat(
                    "member-", vm.toString(mediaLength), "-", vm.toString(uint256(engine))
                )
            ),
            1
        );
    }

    function _etchNativePayload(uint256 mediaLength, uint16 engine)
        private
        returns (address store, bytes32 digest, bytes32 runtimeCodehash)
    {
        bytes memory payload = _jpeg(mediaLength);
        store =
            address(uint160(uint256(keccak256(abi.encode("budget-store", mediaLength, engine)))));
        bytes memory runtime = new bytes(mediaLength + 1);
        assembly ("memory-safe") {
            mcopy(add(runtime, 0x21), add(payload, 0x20), mload(payload))
        }
        vm.etch(store, runtime);
        digest = keccak256(payload);
        runtimeCodehash = keccak256(runtime);
    }

    function _preview(
        MembershipTier tier,
        MembershipTypes.TierConfig memory config,
        uint256 tokenId
    ) private view returns (MembershipTypes.PreviewContext memory) {
        return MembershipTypes.PreviewContext({
            token: MembershipTypes.TokenRenderData({
                tierName: config.name,
                description: config.metadata.description,
                externalURI: config.metadata.externalURI,
                tierIdentity: tier.tierIdentity(),
                art: config.art,
                media: config.media,
                tokenId: tokenId,
                expiration: tier.expiresAt(tokenId),
                active: true
            }),
            nativeMedia: new bytes(0)
        });
    }

    function _measureSurfaces(
        MembershipTypes.PreviewContext memory preview,
        MembershipTier tier,
        uint256 tokenId
    ) private view returns (SurfaceBudget memory budget) {
        uint256 gasBefore = gasleft();
        budget.svgBytes = bytes(renderer.previewSVG(preview)).length;
        budget.svgGas = gasBefore - gasleft();
        gasBefore = gasleft();
        budget.tokenURIBytes = bytes(tier.tokenURI(tokenId)).length;
        budget.tokenURIGas = gasBefore - gasleft();
    }

    function _assertOutputBudget(
        string memory label,
        uint256 mediaLength,
        uint256 gasUsed,
        uint256 tokenURIBytes
    ) private pure {
        console2.log("renderer budget mode", label);
        console2.log("renderer budget media bytes", mediaLength);
        console2.log("renderer budget public tokenURI gas", gasUsed);
        console2.log("renderer budget tokenURI bytes", tokenURIBytes);
        assertLt(gasUsed, 100_000_000);
        assertLe(tokenURIBytes, _MAX_TOKEN_URI_BYTES);
        assertLe(tokenURIBytes * 2 + 2, _MAX_RPC_HEX_BYTES);
    }

    function _jpeg(uint256 length) private pure returns (bytes memory payload) {
        bytes memory base = RealImageFixtures.jpeg(0x42);
        require(length >= base.length);
        payload = new bytes(length);
        payload[0] = base[0];
        payload[1] = base[1];

        // Keep the shipping-path budget realistic: grow a browser-decodable JPEG
        // with legal COM metadata segments instead of etching a framing-only stub.
        uint256 padding = length - base.length;
        uint256 cursor = 2;
        while (padding != 0) {
            uint256 segmentTotal = padding > 65_537 ? 65_537 : padding;
            uint256 remainder = padding - segmentTotal;
            if (remainder != 0 && remainder < 4) {
                segmentTotal -= 4 - remainder;
            }
            require(segmentTotal >= 4);
            uint256 segmentLength = segmentTotal - 2;
            payload[cursor] = 0xff;
            payload[cursor + 1] = 0xfe;
            payload[cursor + 2] = _byte(segmentLength >> 8);
            payload[cursor + 3] = _byte(segmentLength);
            for (uint256 index = 4; index < segmentTotal; ++index) {
                payload[cursor + index] = bytes1(uint8((cursor + index) % 251));
            }
            cursor += segmentTotal;
            padding -= segmentTotal;
        }

        for (uint256 index = 2; index < base.length; ++index) {
            payload[cursor + index - 2] = base[index];
        }
    }

    function _byte(uint256 value) private pure returns (bytes1 result) {
        assembly ("memory-safe") {
            result := shl(248, and(value, 0xff))
        }
    }
}
