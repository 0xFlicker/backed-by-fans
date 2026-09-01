// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {Base64} from "./lib/Base64.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Minimal one-engine custom renderer for Backed By Fans memberships.
/// @dev With media, the SVG visibly recolors and circularly crops the JPEG/PNG. That treatment is
///      a visual transformation only: callers must not treat the output as proof that source bytes,
///      dimensions, palette, encoding, or appearance were preserved. With no media, the same engine
///      returns deterministic generated-only art. The contract has no owner, keys, or storage.
contract CustomRenderer is IMembershipRenderer {
    uint256 public constant MAX_RENDERABLE_MEDIA_BYTES = 90 * 1024;
    uint256 public constant MAX_NAME_BYTES = 100;
    uint256 public constant MAX_DESCRIPTION_BYTES = 500;
    uint256 public constant MAX_URI_BYTES = 2048;

    error InvalidCodeStore(address store);
    error InvalidCodeStoreHash(bytes32 expected, bytes32 actual);
    error InvalidCodeStoreLength(uint256 expected, uint256 actual);
    error InvalidCodeStorePrefix(bytes1 actual);
    error InvalidMediaConfig();
    error InvalidNativeMediaDigest(bytes32 expected, bytes32 actual);
    error InvalidNativeMediaLength(uint256 expected, uint256 actual);
    error InvalidNativeMediaSignature(MembershipTypes.MediaMIME mime);
    error InvalidText(uint8 field);
    error InvalidTextLength(uint8 field, uint256 length, uint256 maximum);
    error UnsupportedEngine(uint16 engine);

    function rendererSchema() external pure override returns (bytes32) {
        return keccak256("BackedByFans.MembershipRenderer.v1");
    }

    function rendererName() external pure override returns (string memory) {
        return "CUSTOM / DUOTONE WINDOW";
    }

    function engineCount() external pure override returns (uint16) {
        return 1;
    }

    function engineName(uint16 engine) external pure override returns (string memory) {
        if (engine != 0) revert UnsupportedEngine(engine);
        return "DUOTONE WINDOW";
    }

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata media
    ) external pure override {
        _validateArt(art);
        _validateMediaShape(media, false);
    }

    function previewSVG(MembershipTypes.PreviewContext calldata context)
        external
        view
        override
        returns (string memory rawSVG)
    {
        MembershipTypes.TokenRenderData memory token = context.token;
        bytes memory supplied = context.nativeMedia;
        _validateToken(token);
        rawSVG = _buildSVG(token, _resolveMedia(token.media, supplied));
    }

    function previewTokenURI(MembershipTypes.PreviewContext calldata context)
        external
        view
        override
        returns (string memory tokenURI)
    {
        MembershipTypes.TokenRenderData memory token = context.token;
        bytes memory supplied = context.nativeMedia;
        _validateToken(token);
        tokenURI = _buildTokenURI(token, _resolveMedia(token.media, supplied));
    }

    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external
        view
        override
        returns (string memory tokenURI)
    {
        MembershipTypes.TokenRenderData memory token = data;
        _validateToken(token);
        tokenURI = _buildTokenURI(token, _resolveMedia(token.media, new bytes(0)));
    }

    function _buildTokenURI(MembershipTypes.TokenRenderData memory token, bytes memory media)
        private
        view
        returns (string memory)
    {
        string memory image = string.concat(
            "data:image/svg+xml;base64,", Base64.encode(bytes(_buildSVG(token, media)))
        );
        string memory jsonHead = string.concat(
            '{"name":"',
            _jsonEscape(token.tierName),
            " #",
            _decimal(token.tokenId),
            '","description":"',
            _jsonEscape(token.description),
            '","image":"',
            image
        );
        string memory jsonTail = string.concat(
            '","external_url":"',
            _jsonEscape(token.externalURI),
            '","attributes":[{"trait_type":"Active","value":"',
            token.active ? "Yes" : "No",
            '"},{"display_type":"date","trait_type":"Expiration","value":',
            _decimal(token.expiration),
            "}]}"
        );
        return string.concat(
            "data:application/json;base64,", Base64.encode(bytes(string.concat(jsonHead, jsonTail)))
        );
    }

    function _buildSVG(MembershipTypes.TokenRenderData memory token, bytes memory media)
        private
        view
        returns (string memory)
    {
        bytes32 seed = keccak256(
            abi.encode(block.chainid, token.tierIdentity, token.tokenId, token.art.collectionSeed)
        );
        uint256 orbit = 170 + uint256(seed) % 180;
        string memory accent = token.active ? "#ff684d" : "#7d8799";
        string memory mode = media.length == 0 ? "generated-only" : "transformed-media";
        string memory transform = media.length == 0 ? "none" : "duotone-filter circular-crop";

        string memory head = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" ',
            'data-mode="',
            mode,
            '" data-transform="',
            transform,
            '"><title>',
            _xmlEscape(token.tierName),
            " membership #",
            _decimal(token.tokenId),
            "</title><desc>Deterministic custom membership art. Supplied media is visibly ",
            "recolored and cropped; no source-byte preservation is claimed.</desc><defs>",
            '<linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1">',
            '<stop stop-color="#11131a"/><stop offset="1" stop-color="#050609"/></linearGradient>',
            '<clipPath id="media-window"><circle cx="600" cy="520" r="360"/></clipPath>',
            '<filter id="duotone" color-interpolation-filters="sRGB">',
            '<feColorMatrix type="matrix" values="0.20 0.20 0.20 0 0.10 ',
            '0.08 0.08 0.08 0 0.02 0.02 0.02 0.02 0 0.01 0 0 0 1 0"/>',
            '<feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="0.12"/>',
            '<feFuncG type="linear" slope="0.55" intercept="0.06"/>',
            '<feFuncB type="linear" slope="0.35" intercept="0.10"/></feComponentTransfer>',
            "</filter></defs>"
        );

        string memory body = string.concat(
            '<rect width="1200" height="1200" rx="72" fill="url(#backdrop)"/>',
            '<circle cx="600" cy="520" r="',
            _decimal(orbit),
            '" fill="none" stroke="',
            accent,
            '" stroke-width="42" opacity=".76"/>',
            _mediaLayer(token.media.mime, media),
            '<path d="M110 900H1090" stroke="',
            accent,
            '" stroke-width="8"/><text x="110" y="1010" fill="#f4eddf" ',
            'font-family="ui-monospace,monospace" font-size="70" font-weight="700">',
            _xmlEscape(token.tierName),
            '</text><text x="110" y="1080" fill="#aeb5c4" ',
            'font-family="ui-monospace,monospace" font-size="30">TOKEN ',
            _decimal(token.tokenId),
            token.active ? "  /  ACTIVE" : "  /  EXPIRED",
            "</text></svg>"
        );
        return string.concat(head, body);
    }

    /// @dev The SVG filter and circular clip visibly reinterpret media. Embedding media in an SVG
    ///      data URI is transport for rendering, not an exact-byte-preservation guarantee.
    function _mediaLayer(MembershipTypes.MediaMIME mime, bytes memory media)
        private
        pure
        returns (string memory)
    {
        if (media.length == 0) {
            return string.concat(
                '<g data-generated="true"><circle cx="600" cy="520" r="250" ',
                'fill="#212a3a"/><path d="M390 610L600 305 810 610 600 760Z" ',
                'fill="#f2c879" opacity=".88"/></g>'
            );
        }

        return string.concat(
            '<image href="data:',
            mime == MembershipTypes.MediaMIME.PNG ? "image/png" : "image/jpeg",
            ";base64,",
            Base64.encode(media),
            '" x="180" y="100" width="840" height="840" preserveAspectRatio="xMidYMid slice" ',
            'clip-path="url(#media-window)" filter="url(#duotone)"/>'
        );
    }

    function _resolveMedia(MembershipTypes.MediaConfig memory config, bytes memory supplied)
        private
        view
        returns (bytes memory media)
    {
        bool empty = _validateMediaShape(config, supplied.length != 0);
        if (empty) return new bytes(0);

        if (supplied.length != 0) {
            _validateMediaBytes(config, supplied);
            return supplied;
        }

        media = _readStoredMedia(config);
        _validateMediaBytes(config, media);
    }

    function _readStoredMedia(MembershipTypes.MediaConfig memory config)
        private
        view
        returns (bytes memory payload)
    {
        uint256 actualLength;
        bytes32 actualCodehash;
        address store = config.store;
        assembly ("memory-safe") {
            actualLength := extcodesize(store)
            actualCodehash := extcodehash(store)
        }
        if (actualLength == 0) revert InvalidCodeStore(store);

        uint256 expectedLength = uint256(config.length) + 1;
        if (actualLength != expectedLength) {
            revert InvalidCodeStoreLength(expectedLength, actualLength);
        }
        if (actualCodehash != config.runtimeCodehash) {
            revert InvalidCodeStoreHash(config.runtimeCodehash, actualCodehash);
        }

        bytes memory prefix = new bytes(1);
        payload = new bytes(config.length);
        assembly ("memory-safe") {
            extcodecopy(store, add(prefix, 0x20), 0, 1)
            extcodecopy(store, add(payload, 0x20), 1, mload(payload))
        }
        if (prefix[0] != 0) revert InvalidCodeStorePrefix(prefix[0]);
    }

    function _validateMediaShape(MembershipTypes.MediaConfig memory config, bool supplied)
        private
        pure
        returns (bool empty)
    {
        empty = config.mime == MembershipTypes.MediaMIME.None && config.store == address(0)
            && config.length == 0 && config.digest == bytes32(0)
            && config.runtimeCodehash == bytes32(0);
        if (empty) {
            if (supplied) revert InvalidMediaConfig();
            return true;
        }

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

        bool valid = config.mime == MembershipTypes.MediaMIME.PNG
            ? media.length >= 8 && media[0] == 0x89 && media[1] == 0x50 && media[2] == 0x4e
                && media[3] == 0x47 && media[4] == 0x0d && media[5] == 0x0a && media[6] == 0x1a
                && media[7] == 0x0a
            : media.length >= 3 && media[0] == 0xff && media[1] == 0xd8 && media[2] == 0xff;
        if (!valid) revert InvalidNativeMediaSignature(config.mime);
    }

    function _validateToken(MembershipTypes.TokenRenderData memory token) private pure {
        _validateText(0, token.tierName, MAX_NAME_BYTES, true);
        _validateText(1, token.description, MAX_DESCRIPTION_BYTES, false);
        _validateText(2, token.externalURI, MAX_URI_BYTES, false);
        _validateArt(token.art);
    }

    function _validateArt(MembershipTypes.ArtConfig memory art) private pure {
        if (art.engine != 0) revert UnsupportedEngine(art.engine);
        _validateControl(art.palette, 100);
        _validateControl(art.intensity, 100);
        _validateControl(art.density, 100);
        _validateControl(art.symmetry, 100);
        _validateControl(art.typographyScale, 100);
        _validateControl(art.typographyStyle, 3);
        _validateControl(art.textVisibility, 1);
        _validateControl(art.focalX, 100);
        _validateControl(art.focalY, 100);
        _validateControl(art.grain, 100);
        _validateControl(art.mediaMix, 100);
        _validateControl(art.primary, 100);
        _validateControl(art.secondary, 100);
        _validateControl(art.tertiary, 100);
    }

    function _validateControl(uint8 value, uint8 maximum) private pure {
        if (value > maximum) revert InvalidMediaConfig();
    }

    function _validateText(uint8 field, string memory value, uint256 maximum, bool required)
        private
        pure
    {
        bytes memory input = bytes(value);
        if ((required && input.length == 0) || input.length > maximum) {
            revert InvalidTextLength(field, input.length, maximum);
        }
        for (uint256 index; index < input.length; ++index) {
            bytes1 character = input[index];
            if (uint8(character) < 0x20 && character != 0x09 && character != 0x0a) {
                revert InvalidText(field);
            }
        }
    }

    function _xmlEscape(string memory value) private pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length * 6);
        uint256 cursor;
        for (uint256 index; index < input.length; ++index) {
            bytes1 character = input[index];
            if (character == "&") cursor = _append(output, cursor, "&amp;");
            else if (character == "<") cursor = _append(output, cursor, "&lt;");
            else if (character == ">") cursor = _append(output, cursor, "&gt;");
            else if (character == '"') cursor = _append(output, cursor, "&quot;");
            else if (character == "'") cursor = _append(output, cursor, "&apos;");
            else output[cursor++] = character;
        }
        assembly ("memory-safe") {
            mstore(output, cursor)
        }
        return string(output);
    }

    function _jsonEscape(string memory value) private pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length * 2);
        uint256 cursor;
        for (uint256 index; index < input.length; ++index) {
            bytes1 character = input[index];
            if (character == '"') cursor = _append(output, cursor, '\\"');
            else if (character == "\\") cursor = _append(output, cursor, "\\\\");
            else if (character == 0x0a) cursor = _append(output, cursor, "\\n");
            else if (character == 0x09) cursor = _append(output, cursor, "\\t");
            else output[cursor++] = character;
        }
        assembly ("memory-safe") {
            mstore(output, cursor)
        }
        return string(output);
    }

    function _append(bytes memory destination, uint256 cursor, string memory value)
        private
        pure
        returns (uint256)
    {
        bytes memory source = bytes(value);
        for (uint256 index; index < source.length; ++index) {
            destination[cursor++] = source[index];
        }
        return cursor;
    }

    function _decimal(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        uint256 remaining = value;
        while (remaining != 0) {
            ++digits;
            remaining /= 10;
        }

        bytes memory output = new bytes(digits);
        while (value != 0) {
            // The remainder is 0-9, so adding the ASCII zero offset always fits in uint8.
            // forge-lint: disable-next-line(unsafe-typecast)
            output[--digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(output);
    }
}
