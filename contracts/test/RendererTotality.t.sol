// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Test} from "forge-std/Test.sol";

import {ImmutableCodeStore} from "../src/ImmutableCodeStore.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {RendererPrimitives} from "../src/renderer/RendererPrimitives.sol";
import {TextValidation} from "../src/renderer/TextValidation.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";

contract RendererTotalityTest is Test {
    using SafeCast for uint256;

    string private constant _GALLERY_MEDIA_BASE64 =
        "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";

    OnchainMetadataRenderer private renderer;

    function setUp() public {
        renderer = new OnchainMetadataRenderer();
    }

    function test_previewAndProductionAreDeterministicForStoredMedia() public {
        bytes memory jpeg = _jpeg(0x01);
        ImmutableCodeStore store = new ImmutableCodeStore(jpeg);
        MembershipTypes.TokenRenderData memory stored = _token();
        stored.media = _storedMedia(address(store), jpeg, MembershipTypes.MediaMIME.JPEG);
        MembershipTypes.PreviewContext memory preview = _preview(stored, new bytes(0));

        string memory first = renderer.previewTokenURI(preview);
        string memory second = renderer.previewTokenURI(preview);
        string memory production = renderer.renderTokenURI(stored);

        assertEq(first, second);
        assertEq(first, production);
        assertTrue(
            _contains(
                renderer.previewSVG(preview),
                string.concat("data:image/jpeg;base64,", Base64.encode(jpeg))
            )
        );
    }

    function test_metadataPublishesOneSelfContainedArtworkWithoutHTMLOrRemoteLoaders() public view {
        MembershipTypes.TokenRenderData memory token = _token();
        MembershipTypes.PreviewContext memory preview = _preview(token, new bytes(0));
        string memory svg = renderer.previewSVG(preview);
        string memory metadata =
            _decodeDataURI(renderer.previewTokenURI(preview), "data:application/json;base64,");

        assertTrue(_contains(metadata, '"image":"data:image/svg+xml;base64,'));
        assertFalse(_contains(metadata, "animation_url"));
        assertFalse(_contains(svg, "<script"));
        assertFalse(_contains(svg, "remote-media"));
        assertFalse(_contains(svg, "ar://"));
        assertFalse(_contains(svg, "ipfs://"));
        assertFalse(_contains(svg, "https://"));
    }

    function test_preStoreAndStoredNativeMediaRenderExactlyTheSame() public {
        bytes memory png = Base64.decode(_GALLERY_MEDIA_BASE64);
        MembershipTypes.TokenRenderData memory preStore = _token();
        preStore.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: address(0),
            length: png.length.toUint32(),
            digest: keccak256(png),
            runtimeCodehash: bytes32(0)
        });
        ImmutableCodeStore store = new ImmutableCodeStore(png);
        MembershipTypes.TokenRenderData memory stored = _token();
        stored.media = _storedMedia(address(store), png, MembershipTypes.MediaMIME.PNG);

        MembershipTypes.PreviewContext memory beforeContext = _preview(preStore, png);
        MembershipTypes.PreviewContext memory afterContext = _preview(stored, new bytes(0));

        assertEq(renderer.previewSVG(beforeContext), renderer.previewSVG(afterContext));
        assertEq(renderer.previewTokenURI(beforeContext), renderer.previewTokenURI(afterContext));
    }

    function test_everySeedDomainComponentChangesGeometry() public {
        MembershipTypes.TokenRenderData memory token = _token();
        string memory baseline = _geometry(renderer.previewSVG(_preview(token, new bytes(0))));

        vm.chainId(block.chainid + 1);
        assertNotEq(_geometry(renderer.previewSVG(_preview(token, new bytes(0)))), baseline);
        vm.chainId(block.chainid - 1);

        token.tierIdentity = keccak256("another tier");
        assertNotEq(_geometry(renderer.previewSVG(_preview(token, new bytes(0)))), baseline);
        token = _token();
        token.tokenId += 1;
        assertNotEq(_geometry(renderer.previewSVG(_preview(token, new bytes(0)))), baseline);
        token = _token();
        token.art.collectionSeed += 1;
        assertNotEq(_geometry(renderer.previewSVG(_preview(token, new bytes(0)))), baseline);
    }

    function test_activeAndAfterglowKeepGeometryAndRemainDesirable() public view {
        MembershipTypes.TokenRenderData memory token = _token();
        string memory active = renderer.previewSVG(_preview(token, new bytes(0)));
        token.active = false;
        string memory afterglow = renderer.previewSVG(_preview(token, new bytes(0)));

        assertEq(_geometry(active), _geometry(afterglow));
        assertTrue(_contains(active, 'data-state="active"'));
        assertTrue(_contains(afterglow, 'data-state="afterglow"'));
        assertTrue(_contains(afterglow, "ARCHIVAL AFTERGLOW"));
        assertTrue(_contains(afterglow, "--hot:#f4e6c8"));
    }

    function test_creatorTextIsEscapedInEveryDocumentContext() public view {
        MembershipTypes.TokenRenderData memory token = _token();
        token.tierName = "A & <B> \"C\" 'D' </script>";
        token.description = string.concat("Line \\ one & two", string(hex"e280a8e280a9"));
        MembershipTypes.PreviewContext memory preview = _preview(token, new bytes(0));

        string memory svg = renderer.previewSVG(preview);
        string memory metadata =
            _decodeDataURI(renderer.previewTokenURI(preview), "data:application/json;base64,");

        assertTrue(_contains(svg, "A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos; &lt;/script&gt;"));
        assertFalse(_contains(svg, "</script>"));
        assertTrue(_contains(metadata, "A & <B> \\\"C\\\" 'D' </script>"));
    }

    function test_invalidUTF8AndXMLCharactersRejectBeforeRendering() public {
        MembershipTypes.TokenRenderData memory token = _token();
        token.description = _rawString(hex"410142");
        vm.expectRevert(TextValidation.InvalidText.selector);
        renderer.previewSVG(_preview(token, new bytes(0)));

        token = _token();
        token.description = _rawString(hex"c080");
        vm.expectRevert(TextValidation.InvalidText.selector);
        renderer.previewSVG(_preview(token, new bytes(0)));
    }

    function test_invalidArtFailsSpecifically() public {
        MembershipTypes.TokenRenderData memory token = _token();
        token.art.intensity = 101;
        vm.expectRevert(
            abi.encodeWithSelector(RendererPrimitives.InvalidArtControl.selector, 1, 101, 100)
        );
        renderer.previewSVG(_preview(token, new bytes(0)));

        token = _token();
        token.art.typographyStyle = 4;
        vm.expectRevert(
            abi.encodeWithSelector(RendererPrimitives.InvalidArtControl.selector, 5, 4, 3)
        );
        renderer.previewSVG(_preview(token, new bytes(0)));

        token = _token();
        token.art.textVisibility = 2;
        vm.expectRevert(
            abi.encodeWithSelector(RendererPrimitives.InvalidArtControl.selector, 6, 2, 1)
        );
        renderer.previewSVG(_preview(token, new bytes(0)));
    }

    function test_typographyFocalAndMediaMixControlsChangeRenderedOutput() public view {
        MembershipTypes.TokenRenderData memory token = _token();
        bytes32[4] memory typographyHashes;
        string memory defaultSVG = renderer.previewSVG(_preview(token, new bytes(0)));
        typographyHashes[0] = keccak256(bytes(defaultSVG));
        token.art.typographyStyle = 1;
        string memory outlinedSVG = renderer.previewSVG(_preview(token, new bytes(0)));
        typographyHashes[1] = keccak256(bytes(outlinedSVG));
        token.art.typographyStyle = 2;
        string memory editorialSVG = renderer.previewSVG(_preview(token, new bytes(0)));
        typographyHashes[2] = keccak256(bytes(editorialSVG));
        token.art.typographyStyle = 3;
        string memory monoSVG = renderer.previewSVG(_preview(token, new bytes(0)));
        typographyHashes[3] = keccak256(bytes(monoSVG));

        for (uint256 index; index < typographyHashes.length; ++index) {
            for (uint256 prior; prior < index; ++prior) {
                assertNotEq(typographyHashes[index], typographyHashes[prior]);
            }
        }
        assertTrue(_contains(outlinedSVG, "font-family:Impact"));
        assertTrue(_contains(editorialSVG, "font-family:Georgia"));
        assertTrue(_contains(monoSVG, "font-family:'Courier New'"));

        token = _token();
        bytes memory png = RealImageFixtures.png();
        token.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: address(0),
            length: png.length.toUint32(),
            digest: keccak256(png),
            runtimeCodehash: bytes32(0)
        });
        token.art.focalX = 0;
        token.art.focalY = 100;
        token.art.mediaMix = 50;
        string memory lowerLeft = renderer.previewSVG(_preview(token, png));
        assertTrue(_contains(lowerLeft, 'preserveAspectRatio="xMinYMax slice"'));

        token.art.focalX = 100;
        token.art.focalY = 0;
        string memory upperRight = renderer.previewSVG(_preview(token, png));
        assertTrue(_contains(upperRight, 'preserveAspectRatio="xMaxYMin slice"'));
        assertNotEq(keccak256(bytes(lowerLeft)), keccak256(bytes(upperRight)));

        token.art.mediaMix = 0;
        string memory lowMix = renderer.previewSVG(_preview(token, png));
        token.art.mediaMix = 100;
        string memory highMix = renderer.previewSVG(_preview(token, png));
        assertTrue(
            _contains(
                lowMix, 'class="native-media" clip-path="url(#engine-media-clip)" opacity="0.35"'
            )
        );
        assertTrue(
            _contains(
                highMix, 'class="native-media" clip-path="url(#engine-media-clip)" opacity="1"'
            )
        );
        assertNotEq(keccak256(bytes(lowMix)), keccak256(bytes(highMix)));
    }

    function test_allEnginesAreDistinctAndKeepGeometryAcrossStates() public view {
        bytes32[6] memory activeHashes;
        for (uint8 engineIndex; engineIndex < 6; ++engineIndex) {
            MembershipTypes.TokenRenderData memory token = _token();
            token.art.engine = _engine(engineIndex);
            string memory active = renderer.previewSVG(_preview(token, new bytes(0)));
            token.active = false;
            string memory afterglow = renderer.previewSVG(_preview(token, new bytes(0)));

            assertEq(_geometry(active), _geometry(afterglow));
            assertTrue(
                _contains(
                    active,
                    string.concat(
                        'data-engine="', RendererPrimitives.engineName(token.art.engine), '"'
                    )
                )
            );
            assertTrue(_contains(active, "engine-media-clip"));
            assertTrue(_contains(afterglow, "ARCHIVAL AFTERGLOW"));
            activeHashes[engineIndex] = keccak256(bytes(active));
            for (uint8 prior; prior < engineIndex; ++prior) {
                assertNotEq(activeHashes[engineIndex], activeHashes[prior]);
            }
        }
    }

    function test_editorialOverlayIsBalancedTopLevelAndPaintedLastForEveryEngine() public view {
        for (uint8 engineIndex; engineIndex < 6; ++engineIndex) {
            MembershipTypes.TokenRenderData memory token = _token();
            token.art.engine = _engine(engineIndex);
            bytes memory svg = bytes(renderer.previewSVG(_preview(token, new bytes(0))));
            uint256 editorial = _indexOf(svg, bytes('<g class="editorial">'));
            uint256 grain = _indexOf(svg, bytes('<rect class="grain"'));

            assertNotEq(editorial, type(uint256).max);
            assertNotEq(grain, type(uint256).max);
            assertLt(grain, editorial);
            assertEq(
                _countBefore(svg, bytes("<g"), editorial),
                _countBefore(svg, bytes("</g>"), editorial)
            );
            assertEq(
                _countBefore(svg, bytes("<g"), svg.length),
                _countBefore(svg, bytes("</g>"), svg.length)
            );
            assertEq(
                _countBefore(svg, bytes("<clipPath"), svg.length),
                _countBefore(svg, bytes("</clipPath>"), svg.length)
            );
            assertTrue(_endsWith(svg, bytes("</g></svg>")));
        }
    }

    function test_nativeMediaWorksAcrossEveryEngine() public view {
        bytes memory png = RealImageFixtures.png();
        for (uint8 engineIndex; engineIndex < 6; ++engineIndex) {
            MembershipTypes.TokenRenderData memory token = _token();
            token.art.engine = _engine(engineIndex);
            token.media = MembershipTypes.MediaConfig({
                mime: MembershipTypes.MediaMIME.PNG,
                store: address(0),
                length: png.length.toUint32(),
                digest: keccak256(png),
                runtimeCodehash: bytes32(0)
            });
            string memory svg = renderer.previewSVG(_preview(token, png));
            assertTrue(_contains(svg, 'data-media="native"'));
            assertTrue(_contains(svg, string.concat("data:image/png;base64,", Base64.encode(png))));
        }
    }

    function test_invalidPreviewMediaNeverProducesApproximateArt() public {
        bytes memory jpeg = hex"ffd8ffe00010";
        MembershipTypes.TokenRenderData memory token = _token();
        token.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.JPEG,
            store: address(0),
            length: jpeg.length.toUint32(),
            digest: bytes32(uint256(1)),
            runtimeCodehash: bytes32(0)
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                OnchainMetadataRenderer.InvalidNativeMediaDigest.selector,
                bytes32(uint256(1)),
                keccak256(jpeg)
            )
        );
        renderer.previewSVG(_preview(token, jpeg));

        token.media.digest = keccak256(jpeg);
        token.media.length += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                OnchainMetadataRenderer.InvalidNativeMediaLength.selector,
                jpeg.length + 1,
                jpeg.length
            )
        );
        renderer.previewSVG(_preview(token, jpeg));

        token.media.length = jpeg.length.toUint32();
        bytes memory invalidJPEG = hex"000102030405";
        token.media.digest = keccak256(invalidJPEG);
        vm.expectRevert(
            abi.encodeWithSelector(
                OnchainMetadataRenderer.InvalidNativeMediaSignature.selector,
                MembershipTypes.MediaMIME.JPEG
            )
        );
        renderer.previewSVG(_preview(token, invalidJPEG));
    }

    function test_previewRejectsUnsafePNGAndMalformedJPEGDimensions() public {
        MembershipTypes.TokenRenderData memory token = _token();
        bytes memory unsafePNG = _pngWithDimensions(1281, 1281);
        token.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: address(0),
            length: unsafePNG.length.toUint32(),
            digest: keccak256(unsafePNG),
            runtimeCodehash: bytes32(0)
        });
        vm.expectRevert(
            abi.encodeWithSelector(
                OnchainMetadataRenderer.InvalidNativeMediaSignature.selector,
                MembershipTypes.MediaMIME.PNG
            )
        );
        renderer.previewSVG(_preview(token, unsafePNG));

        bytes memory malformedJPEG = hex"ffd8ffe00010ffd9";
        token.media.mime = MembershipTypes.MediaMIME.JPEG;
        token.media.length = malformedJPEG.length.toUint32();
        token.media.digest = keccak256(malformedJPEG);
        vm.expectRevert(
            abi.encodeWithSelector(
                OnchainMetadataRenderer.InvalidNativeMediaSignature.selector,
                MembershipTypes.MediaMIME.JPEG
            )
        );
        renderer.previewSVG(_preview(token, malformedJPEG));
    }

    function testFuzz_admittedEngineInputsAreTotalAndByteDeterministic(
        uint128 collectionSeed,
        uint256 tokenId,
        uint8 controls,
        uint8 palette,
        uint8 engineIndex,
        bool active
    ) public view {
        MembershipTypes.TokenRenderData memory token = _token();
        uint8 bounded = controls % 101;
        token.art.engine = _engine(engineIndex);
        token.art.collectionSeed = collectionSeed;
        token.art.palette = palette % 5;
        token.art.intensity = bounded;
        token.art.density = bounded;
        token.art.symmetry = bounded;
        token.art.typographyScale = bounded;
        token.art.typographyStyle = bounded % 4;
        token.art.textVisibility = bounded % 2;
        token.art.focalX = bounded;
        token.art.focalY = bounded;
        token.art.grain = bounded;
        token.art.mediaMix = bounded;
        token.art.primary = bounded;
        token.art.secondary = bounded;
        token.art.tertiary = bounded;
        token.tokenId = tokenId;
        token.active = active;
        MembershipTypes.PreviewContext memory preview = _preview(token, new bytes(0));

        string memory first = renderer.previewSVG(preview);
        string memory second = renderer.previewSVG(preview);
        assertEq(first, second);
        assertLt(bytes(first).length, 65_000);
        assertTrue(_contains(first, "data-geometry="));
        assertTrue(_contains(first, "</svg>"));
    }

    function test_writeStackGalleryWhenRequested() public {
        _writeGallery(0);
    }

    function test_writeChorusGalleryWhenRequested() public {
        _writeGallery(1);
    }

    function test_writeLoomGalleryWhenRequested() public {
        _writeGallery(2);
    }

    function test_writeBloomGalleryWhenRequested() public {
        _writeGallery(3);
    }

    function test_writeMarqueeGalleryWhenRequested() public {
        _writeGallery(4);
    }

    function test_writeAfterimageGalleryWhenRequested() public {
        _writeGallery(5);
    }

    function _token() private view returns (MembershipTypes.TokenRenderData memory token) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        token = MembershipTypes.TokenRenderData({
            tierName: config.name,
            description: config.metadata.description,
            externalURI: config.metadata.externalURI,
            tierIdentity: keccak256("tier identity"),
            art: config.art,
            media: config.media,
            tokenId: 7,
            expiration: (block.timestamp + 30 days).toUint64(),
            active: true
        });
    }

    function _preview(MembershipTypes.TokenRenderData memory token, bytes memory nativeMedia)
        private
        pure
        returns (MembershipTypes.PreviewContext memory)
    {
        return MembershipTypes.PreviewContext({token: token, nativeMedia: nativeMedia});
    }

    function _storedMedia(address store, bytes memory media, MembershipTypes.MediaMIME mime)
        private
        view
        returns (MembershipTypes.MediaConfig memory)
    {
        return MembershipTypes.MediaConfig({
            mime: mime,
            store: store,
            length: media.length.toUint32(),
            digest: keccak256(media),
            runtimeCodehash: store.codehash
        });
    }

    function _jpeg(bytes1 unique) private pure returns (bytes memory) {
        return RealImageFixtures.jpeg(unique);
    }

    function _pngWithDimensions(uint32 width, uint32 height)
        private
        pure
        returns (bytes memory payload)
    {
        payload = RealImageFixtures.png();
        _writeUint32(payload, 16, width);
        _writeUint32(payload, 20, height);
        _writeUint32(payload, 29, _crc32Range(payload, 12, 29));
    }

    function _writeUint32(bytes memory payload, uint256 cursor, uint32 value) private pure {
        payload[cursor] = _byte(value >> 24);
        payload[cursor + 1] = _byte(value >> 16);
        payload[cursor + 2] = _byte(value >> 8);
        payload[cursor + 3] = _byte(value);
    }

    function _byte(uint256 value) private pure returns (bytes1 result) {
        assembly ("memory-safe") {
            result := shl(248, and(value, 0xff))
        }
    }

    function _crc32Range(bytes memory payload, uint256 cursor, uint256 end)
        private
        pure
        returns (uint32)
    {
        uint32 crc = type(uint32).max;
        for (uint256 index = cursor; index < end; ++index) {
            crc ^= uint32(uint8(payload[index]));
            for (uint256 bit; bit < 8; ++bit) {
                crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
            }
        }
        return ~crc;
    }

    function _writeGallery(uint16 engine) private {
        if (!vm.envOr("WRITE_RENDERER_GALLERY", false)) return;
        vm.createDir("deployments/renderer-gallery", true);
        bytes memory media = Base64.decode(_GALLERY_MEDIA_BASE64);
        uint256[3] memory tokenIds = [uint256(1), uint256(7), uint256(42)];
        for (uint256 index; index < tokenIds.length; ++index) {
            MembershipTypes.TokenRenderData memory token = _token();
            token.art.engine = engine;
            token.tokenId = tokenIds[index];
            string memory prefix = string.concat(
                "deployments/renderer-gallery/",
                RendererPrimitives.engineName(engine),
                "-",
                RendererPrimitives.decimal(token.tokenId)
            );
            _writeGalleryPair(string.concat(prefix, "-generated"), token, new bytes(0));

            token.media = MembershipTypes.MediaConfig({
                mime: MembershipTypes.MediaMIME.PNG,
                store: address(0),
                length: media.length.toUint32(),
                digest: keccak256(media),
                runtimeCodehash: bytes32(0)
            });
            token.art.mediaMix = 78;
            _writeGalleryPair(string.concat(prefix, "-onchain"), token, media);
        }
    }

    function _writeGalleryPair(
        string memory prefix,
        MembershipTypes.TokenRenderData memory token,
        bytes memory media
    ) private {
        bool originalState = token.active;
        token.active = true;
        vm.writeFile(
            string.concat(prefix, "-active.svg"), renderer.previewSVG(_preview(token, media))
        );
        token.active = false;
        vm.writeFile(
            string.concat(prefix, "-afterglow.svg"), renderer.previewSVG(_preview(token, media))
        );
        token.active = originalState;
    }

    function _engine(uint8 index) private pure returns (uint16) {
        return uint16(index % 6);
    }

    function _geometry(string memory svg) private pure returns (string memory) {
        bytes memory source = bytes(svg);
        bytes memory prefix = bytes('data-geometry="');
        uint256 start = _indexOf(source, prefix) + prefix.length;
        uint256 end = start;
        while (source[end] != '"') ++end;
        bytes memory value = new bytes(end - start);
        for (uint256 index; index < value.length; ++index) {
            value[index] = source[start + index];
        }
        return string(value);
    }

    function _decodeDataURI(string memory uri, string memory expectedPrefix)
        private
        pure
        returns (string memory)
    {
        bytes memory encodedURI = bytes(uri);
        bytes memory prefix = bytes(expectedPrefix);
        bytes memory payload = new bytes(encodedURI.length - prefix.length);
        for (uint256 index; index < prefix.length; ++index) {
            require(encodedURI[index] == prefix[index], "invalid URI prefix");
        }
        for (uint256 index; index < payload.length; ++index) {
            payload[index] = encodedURI[index + prefix.length];
        }
        return string(Base64.decode(string(payload)));
    }

    function _contains(string memory value, string memory needle) private pure returns (bool) {
        bytes memory source = bytes(value);
        bytes memory search = bytes(needle);
        if (search.length > source.length) return false;
        return _indexOf(source, search) != type(uint256).max;
    }

    function _rawString(bytes memory value) private pure returns (string memory result) {
        assembly ("memory-safe") {
            result := value
        }
    }

    function _indexOf(bytes memory source, bytes memory search) private pure returns (uint256) {
        if (search.length > source.length) return type(uint256).max;
        for (uint256 index; index <= source.length - search.length; ++index) {
            bool matches = true;
            for (uint256 offset; offset < search.length; ++offset) {
                if (source[index + offset] != search[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return index;
        }
        return type(uint256).max;
    }

    function _countBefore(bytes memory source, bytes memory search, uint256 limit)
        private
        pure
        returns (uint256 count)
    {
        if (search.length == 0 || search.length > limit) return 0;
        for (uint256 index; index <= limit - search.length; ++index) {
            bool matches = true;
            for (uint256 offset; offset < search.length; ++offset) {
                if (source[index + offset] != search[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                ++count;
                index += search.length - 1;
            }
        }
    }

    function _endsWith(bytes memory source, bytes memory suffix) private pure returns (bool) {
        if (suffix.length > source.length) return false;
        uint256 start = source.length - suffix.length;
        for (uint256 index; index < suffix.length; ++index) {
            if (source[start + index] != suffix[index]) return false;
        }
        return true;
    }
}
