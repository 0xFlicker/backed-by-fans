// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {CustomRenderer} from "../src/CustomRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";

/// @dev Test-only stand-in for the protocol's STOP-prefixed immutable media store.
contract TestMediaStore {
    constructor(bytes memory payload) {
        bytes memory runtime = bytes.concat(hex"00", payload);
        assembly ("memory-safe") {
            return(add(runtime, 0x20), mload(runtime))
        }
    }
}

contract CustomRendererTest {
    bytes32 private constant _RENDERER_SCHEMA = keccak256("BackedByFans.MembershipRenderer.v1");

    CustomRenderer private renderer;

    function setUp() public {
        renderer = new CustomRenderer();
    }

    function test_implementsCanonicalRendererSurface() public view {
        _assertEq(renderer.rendererSchema(), _RENDERER_SCHEMA, "renderer schema");
        _assertEq(renderer.rendererName(), "CUSTOM / DUOTONE WINDOW", "renderer name");
        _assertEq(renderer.engineCount(), 1, "engine count");
        _assertEq(renderer.engineName(0), "DUOTONE WINDOW", "engine name");

        MembershipTypes.TokenRenderData memory token = _token();
        renderer.validateConfiguration(token.art, token.media);
    }

    function test_generatedOnlyPreviewIsDeterministicAndComplete() public view {
        MembershipTypes.TokenRenderData memory token = _token();
        MembershipTypes.PreviewContext memory context = _preview(token, "");

        string memory firstSVG = renderer.previewSVG(context);
        string memory secondSVG = renderer.previewSVG(context);
        _assertEq(firstSVG, secondSVG, "generated SVG must be deterministic");
        _assertContains(firstSVG, 'data-mode="generated-only"', "generated-only marker");
        _assertContains(firstSVG, "<svg", "complete SVG");
        _assertNotContains(firstSVG, "<image", "generated output must not invent media");

        string memory previewURI = renderer.previewTokenURI(context);
        string memory productionURI = renderer.renderTokenURI(token);
        _assertStartsWith(previewURI, "data:application/json;base64,", "complete metadata data URI");
        _assertEq(previewURI, productionURI, "generated preview and production metadata");
    }

    function test_nativeMediaGetsVisibleDuotoneCropTransformation() public view {
        bytes memory png = _png();
        MembershipTypes.TokenRenderData memory token = _token();
        token.media = _previewMedia(png);

        string memory transformed = renderer.previewSVG(_preview(token, png));
        _assertContains(transformed, 'data-mode="transformed-media"', "media mode marker");
        _assertContains(
            transformed,
            'data-transform="duotone-filter circular-crop"',
            "documented transform marker"
        );
        _assertContains(transformed, 'filter="url(#duotone)"', "visible duotone filter");
        _assertContains(transformed, 'clip-path="url(#media-window)"', "visible circular crop");
        _assertContains(transformed, "data:image/png;base64,", "embedded media data URI");

        MembershipTypes.TokenRenderData memory generatedToken = _token();
        string memory generated = renderer.previewSVG(_preview(generatedToken, ""));
        _assertNotEq(transformed, generated, "media must change the visible result");
    }

    function test_onchainMediaUsesSameTransformationAsPreviewBytes() public {
        bytes memory png = _png();
        TestMediaStore store = new TestMediaStore(png);

        MembershipTypes.TokenRenderData memory storedToken = _token();
        storedToken.media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: address(store),
            length: uint32(png.length),
            digest: keccak256(png),
            runtimeCodehash: address(store).codehash
        });

        string memory storedSVG = renderer.previewSVG(_preview(storedToken, ""));
        _assertContains(storedSVG, 'data-mode="transformed-media"', "stored media mode");
        _assertContains(storedSVG, 'filter="url(#duotone)"', "stored media filter");
        _assertContains(storedSVG, 'clip-path="url(#media-window)"', "stored media circular crop");

        MembershipTypes.TokenRenderData memory previewToken = _token();
        previewToken.media = _previewMedia(png);
        string memory previewURI = renderer.previewTokenURI(_preview(previewToken, png));
        string memory productionURI = renderer.renderTokenURI(storedToken);
        _assertEq(previewURI, productionURI, "preview bytes and stored media transformation");
    }

    function test_nativeMediaDigestMismatchFailsClearly() public {
        bytes memory png = _png();
        MembershipTypes.TokenRenderData memory token = _token();
        token.media = _previewMedia(png);
        token.media.digest = bytes32(uint256(1));

        (bool success,) = address(renderer)
            .call(abi.encodeCall(CustomRenderer.previewSVG, (_preview(token, png))));
        _assert(!success, "digest mismatch must revert");
    }

    function _token() private pure returns (MembershipTypes.TokenRenderData memory token) {
        token = MembershipTypes.TokenRenderData({
            tierName: "Backstage Circle",
            description: "A membership rendered entirely from contract inputs.",
            externalURI: "https://backedbyfans.com",
            tierIdentity: keccak256("backstage-circle"),
            art: MembershipTypes.ArtConfig({
                engine: 0,
                collectionSeed: 1337,
                palette: 0,
                intensity: 70,
                density: 60,
                symmetry: 50,
                typographyScale: 60,
                typographyStyle: 0,
                textVisibility: 1,
                imageFit: MembershipTypes.ImageFit.Cover,
                focalX: 50,
                focalY: 50,
                grain: 35,
                mediaMix: 80,
                primary: 65,
                secondary: 40,
                tertiary: 25
            }),
            media: MembershipTypes.MediaConfig({
                mime: MembershipTypes.MediaMIME.None,
                store: address(0),
                length: 0,
                digest: bytes32(0),
                runtimeCodehash: bytes32(0)
            }),
            tokenId: 7,
            expiration: 1_900_000_000,
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

    function _previewMedia(bytes memory payload)
        private
        pure
        returns (MembershipTypes.MediaConfig memory)
    {
        return MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: address(0),
            length: uint32(payload.length),
            digest: keccak256(payload),
            runtimeCodehash: bytes32(0)
        });
    }

    function _png() private pure returns (bytes memory) {
        return hex"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154089963600000020001e221bc330000000049454e44ae426082";
    }

    function _assert(bool condition, string memory message) private pure {
        require(condition, message);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertEq(string memory actual, string memory expected, string memory message)
        private
        pure
    {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), message);
    }

    function _assertNotEq(string memory actual, string memory expected, string memory message)
        private
        pure
    {
        require(keccak256(bytes(actual)) != keccak256(bytes(expected)), message);
    }

    function _assertStartsWith(string memory value, string memory prefix, string memory message)
        private
        pure
    {
        bytes memory haystack = bytes(value);
        bytes memory needle = bytes(prefix);
        require(haystack.length >= needle.length, message);
        for (uint256 index; index < needle.length; ++index) {
            require(haystack[index] == needle[index], message);
        }
    }

    function _assertContains(string memory value, string memory fragment, string memory message)
        private
        pure
    {
        require(_contains(value, fragment), message);
    }

    function _assertNotContains(string memory value, string memory fragment, string memory message)
        private
        pure
    {
        require(!_contains(value, fragment), message);
    }

    function _contains(string memory value, string memory fragment) private pure returns (bool) {
        bytes memory haystack = bytes(value);
        bytes memory needle = bytes(fragment);
        if (needle.length == 0) return true;
        if (needle.length > haystack.length) return false;

        for (uint256 start; start <= haystack.length - needle.length; ++start) {
            bool matches = true;
            for (uint256 offset; offset < needle.length; ++offset) {
                if (haystack[start + offset] != needle[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return true;
        }
        return false;
    }
}
