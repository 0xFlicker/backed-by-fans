// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {CodeStoreReader} from "./media/CodeStoreReader.sol";
import {ImageValidation} from "./media/ImageValidation.sol";
import {RendererPrimitives} from "./renderer/RendererPrimitives.sol";
import {TextValidation} from "./renderer/TextValidation.sol";
import {AfterimageEngine} from "./renderer/engines/AfterimageEngine.sol";
import {BloomEngine} from "./renderer/engines/BloomEngine.sol";
import {ChorusEngine} from "./renderer/engines/ChorusEngine.sol";
import {LoomEngine} from "./renderer/engines/LoomEngine.sol";
import {MarqueeEngine} from "./renderer/engines/MarqueeEngine.sol";
import {StackEngine} from "./renderer/engines/StackEngine.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Stateless canonical metadata and self-contained SVG renderer.
contract OnchainMetadataRenderer is IMembershipRenderer {
    using RendererPrimitives for RendererPrimitives.Buffer;

    uint256 public constant MAX_NAME_BYTES = 100;
    uint256 public constant MAX_DESCRIPTION_BYTES = 500;
    uint256 public constant MAX_URI_BYTES = 2048;
    uint256 public constant MAX_RENDERABLE_MEDIA_BYTES =
        RendererPrimitives.MAX_RENDERABLE_MEDIA_BYTES;

    struct SVGParts {
        bytes32 seed;
        RendererPrimitives.EngineOutput engine;
        RendererPrimitives.Palette colors;
        string escapedName;
        string escapedDescription;
        string geometry;
        string mediaLayer;
    }

    error InvalidMediaConfig();
    error InvalidNativeMediaDigest(bytes32 expected, bytes32 actual);
    error InvalidNativeMediaLength(uint256 expected, uint256 actual);
    error InvalidNativeMediaSignature(MembershipTypes.MediaMIME mime);
    error InvalidTextLength(uint8 field, uint256 length, uint256 maximum);
    error UnsupportedEngine(uint16 engine);

    function rendererSchema() external pure override returns (bytes32) {
        return keccak256("BackedByFans.MembershipRenderer.v1");
    }

    function rendererName() external pure override returns (string memory) {
        return "BACKED BY FANS / FOUNDING SIX";
    }

    function engineCount() external pure override returns (uint16) {
        return 6;
    }

    function engineName(uint16 engine) external pure override returns (string memory) {
        return RendererPrimitives.engineName(engine);
    }

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata media
    ) external pure override {
        MembershipTypes.ArtConfig memory artCopy = art;
        MembershipTypes.MediaConfig memory mediaCopy = media;
        RendererPrimitives.validateArt(artCopy);
        _validateMediaShape(mediaCopy, false);
    }

    /// @notice Returns the raw canonical SVG used by token metadata.
    function previewSVG(MembershipTypes.PreviewContext calldata context)
        external
        view
        override
        returns (string memory rawSVG)
    {
        MembershipTypes.TokenRenderData memory token = context.token;
        bytes memory suppliedMedia = context.nativeMedia;
        _validateToken(token);
        bytes memory media = _resolveMedia(token.media, suppliedMedia, true);
        rawSVG = _buildSVG(token, media);
    }

    /// @notice Returns the complete nested metadata URI before tier publication.
    function previewTokenURI(MembershipTypes.PreviewContext calldata context)
        external
        view
        override
        returns (string memory)
    {
        MembershipTypes.TokenRenderData memory token = context.token;
        bytes memory suppliedMedia = context.nativeMedia;
        _validateToken(token);
        bytes memory media = _resolveMedia(token.media, suppliedMedia, true);
        return _buildTokenURI(token, media);
    }

    /// @notice Builds production metadata from immutable tier-supplied state.
    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external
        view
        override
        returns (string memory)
    {
        MembershipTypes.TokenRenderData memory token = data;
        _validateToken(token);
        bytes memory media = _resolveMedia(token.media, new bytes(0), false);
        return _buildTokenURI(token, media);
    }

    function _buildTokenURI(MembershipTypes.TokenRenderData memory token, bytes memory media)
        private
        view
        returns (string memory)
    {
        string memory rawSVG = _buildSVG(token, media);
        string memory image =
            string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(rawSVG)));
        string memory name =
            string.concat(token.tierName, " #", RendererPrimitives.decimal(token.tokenId));
        string memory engine = RendererPrimitives.engineName(token.art.engine);
        string memory state = token.active ? "ACTIVE" : "EXPIRED";
        string memory mediaMode = media.length == 0 ? "GENERATED" : "ONCHAIN";

        RendererPrimitives.Buffer memory json = RendererPrimitives.init(
            bytes(image).length + bytes(token.description).length * 6
                + bytes(token.externalURI).length * 6 + bytes(name).length * 6 + 2048
        );
        json.append('{"name":"');
        json.append(RendererPrimitives.jsonEscape(name));
        json.append('","description":"');
        json.append(RendererPrimitives.jsonEscape(token.description));
        json.append('","image":"');
        json.append(image);
        json.append('","external_url":"');
        json.append(RendererPrimitives.jsonEscape(token.externalURI));
        json.append('","attributes":[{"trait_type":"Engine","value":"');
        json.append(engine);
        json.append('"},{"trait_type":"State","value":"');
        json.append(state);
        json.append('"},{"trait_type":"Media","value":"');
        json.append(mediaMode);
        json.append('"},{"trait_type":"Palette","value":');
        json.append(RendererPrimitives.decimal(token.art.palette));
        json.append('},{"display_type":"date","trait_type":"Expiration","value":');
        json.append(RendererPrimitives.decimal(token.expiration));
        json.append("}]}");

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json.finish())));
    }

    function _buildSVG(MembershipTypes.TokenRenderData memory token, bytes memory media)
        private
        view
        returns (string memory)
    {
        SVGParts memory parts;
        parts.seed = RendererPrimitives.renderSeed(
            block.chainid, token.tierIdentity, token.tokenId, token.art.collectionSeed
        );
        parts.engine = _renderEngine(
            RendererPrimitives.EngineContext({
                seed: parts.seed,
                art: token.art,
                tokenId: token.tokenId,
                hasNativeMedia: media.length != 0
            })
        );
        parts.colors = RendererPrimitives.palette(token.art.palette);
        parts.escapedName = RendererPrimitives.xmlEscape(token.tierName);
        parts.escapedDescription = RendererPrimitives.xmlEscape(token.description);
        parts.geometry = RendererPrimitives.geometryID(parts.seed);
        parts.mediaLayer =
            media.length == 0 ? "" : _nativeMediaLayer(token.art, token.media.mime, media);

        RendererPrimitives.Buffer memory svg = RendererPrimitives.init(
            bytes(parts.engine.defs).length + bytes(parts.engine.underlay).length
                + bytes(parts.engine.overlay).length + bytes(parts.mediaLayer).length
                + bytes(parts.escapedName).length * 2 + bytes(parts.escapedDescription).length
                + 16_000
        );
        _appendSVG(svg, token, parts, media.length != 0);
        return svg.finish();
    }

    function _appendSVG(
        RendererPrimitives.Buffer memory svg,
        MembershipTypes.TokenRenderData memory token,
        SVGParts memory parts,
        bool hasNativeMedia
    ) private pure {
        svg.append(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" '
            'width="1200" height="1200" role="img" aria-labelledby="art-title art-description" '
            'data-engine="'
        );
        svg.append(RendererPrimitives.engineName(token.art.engine));
        svg.append('" data-state="');
        svg.append(token.active ? "active" : "afterglow");
        svg.append('" data-media="');
        svg.append(hasNativeMedia ? "native" : "generated");
        svg.append('" data-geometry="');
        svg.append(parts.geometry);
        svg.append('"><title id="art-title">');
        svg.append(parts.escapedName);
        svg.append(" membership #");
        svg.append(RendererPrimitives.decimal(token.tokenId));
        svg.append('</title><desc id="art-description">');
        svg.append(parts.escapedDescription);
        svg.append("</desc><defs><style><![CDATA[");
        svg.append(_svgCSS(parts.colors, token.art));
        svg.append("]]></style>");
        svg.append(_grainPattern(token.art.grain, parts.seed));
        svg.append(parts.engine.defs);
        svg.append('</defs><rect class="art-bg" width="1200" height="1200"/>');
        svg.append(parts.engine.underlay);
        svg.append(parts.mediaLayer);
        svg.append(parts.engine.overlay);
        svg.append('<rect class="grain" width="1200" height="1200"/>');
        svg.append(_editorialOverlay(token, parts.escapedName));
        svg.append("</svg>");
    }

    function _nativeMediaLayer(
        MembershipTypes.ArtConfig memory art,
        MembershipTypes.MediaMIME mime,
        bytes memory media
    ) private pure returns (string memory) {
        if (media.length == 0) return "";

        string memory dataURI = string.concat(
            "data:", RendererPrimitives.mediaMIME(mime), ";base64,", Base64.encode(media)
        );
        string memory mix = RendererPrimitives.opacity(uint8(35 + uint256(art.mediaMix) * 65 / 100));
        if (art.imageFit == MembershipTypes.ImageFit.Tile) {
            return string.concat(
                '<g class="native-media" clip-path="url(#engine-media-clip)" opacity="',
                mix,
                '"><defs><pattern id="native-tile" patternUnits="userSpaceOnUse" width="260" height="260">',
                '<image href="',
                dataURI,
                '" width="260" height="260" preserveAspectRatio="',
                RendererPrimitives.preserveAspectRatio(
                    MembershipTypes.ImageFit.Cover, art.focalX, art.focalY
                ),
                '"/></pattern></defs>',
                '<rect width="1200" height="1200" fill="url(#native-tile)"/>',
                '<rect class="media-wash" width="1200" height="1200"/></g>'
            );
        }

        return string.concat(
            '<g class="native-media" clip-path="url(#engine-media-clip)" opacity="',
            mix,
            '"><image href="',
            dataURI,
            '" x="240" y="220" width="760" height="650" preserveAspectRatio="',
            RendererPrimitives.preserveAspectRatio(art.imageFit, art.focalX, art.focalY),
            '"/><rect class="media-wash" width="1200" height="1200"/></g>'
        );
    }

    function _editorialOverlay(
        MembershipTypes.TokenRenderData memory token,
        string memory escapedName
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory overlay =
            RendererPrimitives.init(bytes(escapedName).length * 2 + 4000);
        overlay.append('<g class="editorial"><text class="eyebrow" x="112" y="92">');
        overlay.append("BACKED BY FANS  /  ONCHAIN MEMBERSHIP</text>");
        if (token.art.textVisibility != 0) {
            overlay.append(
                '<text class="tier-name" x="112" y="1030" textLength="860" '
                'lengthAdjust="spacingAndGlyphs">'
            );
            overlay.append(escapedName);
            overlay.append("</text>");
        }
        overlay.append('<text class="token-number" x="1090" y="1110" text-anchor="end">NO. ');
        overlay.append(RendererPrimitives.decimal(token.tokenId));
        overlay.append(
            '</text><text class="state-copy state-active" x="1088" y="92" text-anchor="end">'
        );
        overlay.append("ACTIVE</text>");
        overlay.append(
            '<text class="state-copy state-afterglow" x="1088" y="92" text-anchor="end">'
        );
        overlay.append("EXPIRED</text></g>");
        return overlay.finish();
    }

    function _svgCSS(RendererPrimitives.Palette memory colors, MembershipTypes.ArtConfig memory art)
        private
        pure
        returns (string memory)
    {
        uint256 tierSize = 56 + uint256(art.typographyScale) * 44 / 100;
        uint256 frameWidth = 5 + uint256(art.intensity) * 7 / 100;
        RendererPrimitives.Buffer memory css = RendererPrimitives.init(5000);
        css.append("svg{--bg:");
        css.append(colors.backstage);
        css.append(";--paper:");
        css.append(colors.houseLight);
        css.append(";--hot:");
        css.append(colors.applause);
        css.append(";--blue:");
        css.append(colors.fanBlue);
        css.append(";--gold:");
        css.append(colors.encore);
        css.append(
            ";font-family:Arial,Helvetica,sans-serif}.art-bg{fill:var(--bg)}"
            "svg[data-state='afterglow']{--paper:"
        );
        css.append(colors.encore);
        css.append(";--hot:");
        css.append(colors.houseLight);
        css.append(";--blue:");
        css.append(colors.applause);
        css.append(";--gold:");
        css.append(colors.fanBlue);
        css.append(
            "}.stack-plane{stroke:var(--bg);stroke-width:10}.plane-0{fill:var(--blue)}"
            ".plane-1{fill:var(--hot)}.plane-2{fill:var(--gold)}.plane-3{fill:var(--paper)}"
            ".plane-4{fill:var(--bg);stroke:var(--paper)}.supporter-slab{fill:var(--paper)}"
            ".supporter-slab:nth-child(3n+2){fill:var(--hot)}.supporter-slab:nth-child(3n){fill:var(--gold)}"
            ".aperture-ground{fill:var(--bg)}.aperture-line{fill:none;stroke:var(--paper);stroke-width:18}"
            ".aperture-frame{fill:none;stroke:var(--bg);stroke-width:"
        );
        css.append(RendererPrimitives.decimal(frameWidth));
        css.append(
            ";vector-effect:non-scaling-stroke}.media-wash{fill:var(--hot);opacity:.23;mix-blend-mode:multiply}"
            "svg[data-media='native'] .generated-aperture{opacity:.18}"
            ".aperture-sigil-a{fill:var(--blue)}.aperture-sigil-b{fill:var(--hot)}.aperture-sigil-c{fill:var(--gold)}"
            ".registration-ring{fill:none;stroke:var(--paper);stroke-width:5}.registration-ring circle{stroke-dasharray:22 12}"
            ".editorial{pointer-events:none}.eyebrow,.state-copy,.token-number{fill:var(--paper);"
            "font-weight:800;letter-spacing:3px;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}"
            ".eyebrow,.state-copy{font-size:22px}.token-number{font-size:32px}"
            ".tier-name{fill:var(--paper);paint-order:stroke;stroke:var(--bg);stroke-width:9px;stroke-linejoin:round;font-size:"
        );
        css.append(RendererPrimitives.decimal(tierSize));
        css.append("px;");
        css.append(_typographyTreatment(art.typographyStyle));
        css.append(
            "}.state-afterglow{display:none}"
            "svg[data-state='afterglow'] .state-active{display:none}svg[data-state='afterglow'] .state-afterglow{display:block}"
            ".grain{fill:url(#print-grain);pointer-events:none;mix-blend-mode:screen}"
        );
        return css.finish();
    }

    function _grainPattern(uint8 grain, bytes32 seed) private pure returns (string memory) {
        uint256 spacing = 11 + (100 - uint256(grain)) * 13 / 100;
        uint256 offset = RendererPrimitives.lane(seed, 120) % spacing;
        return string.concat(
            '<pattern id="print-grain" width="',
            RendererPrimitives.decimal(spacing),
            '" height="',
            RendererPrimitives.decimal(spacing),
            '" patternUnits="userSpaceOnUse"><circle cx="',
            RendererPrimitives.decimal(offset),
            '" cy="',
            RendererPrimitives.decimal((offset * 7 + 3) % spacing),
            '" r="1" fill="#fff" opacity="',
            RendererPrimitives.opacity(uint8(uint256(grain) * 28 / 100)),
            '"/></pattern>'
        );
    }

    function _renderEngine(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (RendererPrimitives.EngineOutput memory)
    {
        if (context.art.engine == 0) {
            return StackEngine.render(context);
        }
        if (context.art.engine == 1) {
            return ChorusEngine.render(context);
        }
        if (context.art.engine == 2) {
            return LoomEngine.render(context);
        }
        if (context.art.engine == 3) {
            return BloomEngine.render(context);
        }
        if (context.art.engine == 4) {
            return MarqueeEngine.render(context);
        }
        if (context.art.engine == 5) {
            return AfterimageEngine.render(context);
        }
        revert UnsupportedEngine(context.art.engine);
    }

    function _resolveMedia(
        MembershipTypes.MediaConfig memory config,
        bytes memory supplied,
        bool fullValidation
    ) private view returns (bytes memory media) {
        bool empty = _validateMediaShape(config, supplied.length != 0);
        if (empty) {
            if (supplied.length != 0) revert InvalidMediaConfig();
            return new bytes(0);
        }

        if (supplied.length != 0) {
            if (config.store != address(0) || config.runtimeCodehash != bytes32(0)) {
                revert InvalidMediaConfig();
            }
            _validateMediaBytes(config, supplied);
            return supplied;
        }

        if (config.store == address(0) || config.runtimeCodehash == bytes32(0)) {
            revert InvalidMediaConfig();
        }
        media = fullValidation
            ? CodeStoreReader.readAndValidate(
                config.store, config.length, config.digest, config.runtimeCodehash
            )
            : CodeStoreReader.read(config.store, config.length, config.runtimeCodehash);
        if (fullValidation) _validateMediaSignature(config.mime, media);
        return media;
    }

    function _validateMediaShape(MembershipTypes.MediaConfig memory config, bool supplied)
        private
        pure
        returns (bool empty)
    {
        empty = config.mime == MembershipTypes.MediaMIME.None && config.store == address(0)
            && config.length == 0 && config.digest == bytes32(0)
            && config.runtimeCodehash == bytes32(0);
        if (empty) return true;

        if (
            config.length == 0 || config.length > MAX_RENDERABLE_MEDIA_BYTES
                || config.digest == bytes32(0)
                || (config.mime != MembershipTypes.MediaMIME.JPEG
                    && config.mime != MembershipTypes.MediaMIME.PNG)
        ) revert InvalidMediaConfig();

        if (supplied) {
            if (config.store != address(0) || config.runtimeCodehash != bytes32(0)) {
                revert InvalidMediaConfig();
            }
        } else if (config.store == address(0) || config.runtimeCodehash == bytes32(0)) {
            revert InvalidMediaConfig();
        }
    }

    function _validateMediaBytes(MembershipTypes.MediaConfig memory config, bytes memory media)
        private
        pure
    {
        if (media.length != config.length) {
            revert InvalidNativeMediaLength(config.length, media.length);
        }
        bytes32 actualDigest = keccak256(media);
        if (actualDigest != config.digest) {
            revert InvalidNativeMediaDigest(config.digest, actualDigest);
        }
        _validateMediaSignature(config.mime, media);
    }

    function _validateMediaSignature(MembershipTypes.MediaMIME mime, bytes memory media)
        private
        pure
    {
        if (!ImageValidation.isValid(media, mime)) revert InvalidNativeMediaSignature(mime);
    }

    function _validateToken(MembershipTypes.TokenRenderData memory token) private pure {
        _validateText(0, token.tierName, MAX_NAME_BYTES, true);
        _validateText(1, token.description, MAX_DESCRIPTION_BYTES, false);
        _validateText(2, token.externalURI, MAX_URI_BYTES, false);
        RendererPrimitives.validateArt(token.art);
    }

    function _validateText(uint8 field, string memory value, uint256 maximum, bool required)
        private
        pure
    {
        uint256 length = bytes(value).length;
        if ((required && length == 0) || length > maximum) {
            revert InvalidTextLength(field, length, maximum);
        }
        TextValidation.validate(value);
    }

    function _typographyTreatment(uint8 style) private pure returns (string memory) {
        if (style == 1) {
            return "font-family:Impact,'Arial Narrow',sans-serif;font-weight:900;letter-spacing:4px;fill:var(--bg);stroke:var(--paper);stroke-width:3px;paint-order:stroke";
        }
        if (style == 2) {
            return "font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;letter-spacing:-1px;paint-order:stroke;stroke:var(--bg);stroke-width:7px";
        }
        if (style == 3) {
            return "font-family:'Courier New',Courier,monospace;font-weight:700;letter-spacing:7px";
        }
        return "font-family:Arial,Helvetica,sans-serif;font-weight:900;letter-spacing:-2px";
    }
}
