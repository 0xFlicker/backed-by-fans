// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Shared bounded building blocks for the fixed onchain art engines.
library RendererPrimitives {
    using Strings for int256;
    using Strings for uint256;

    uint8 internal constant MAX_PALETTE = 4;
    uint8 internal constant MAX_PERCENT_CONTROL = 100;
    uint256 internal constant MAX_RENDERABLE_MEDIA_BYTES = 90 * 1024;

    bytes32 internal constant RENDER_SEED_DOMAIN = keccak256("BackedByFans.OnchainRenderer.v1");

    struct Buffer {
        bytes data;
        uint256 cursor;
    }

    struct Palette {
        string backstage;
        string houseLight;
        string applause;
        string fanBlue;
        string encore;
    }

    struct EngineContext {
        bytes32 seed;
        MembershipTypes.ArtConfig art;
        uint256 tokenId;
        bool hasNativeMedia;
    }

    struct EngineOutput {
        string defs;
        string underlay;
        string overlay;
    }

    error BufferCapacityExceeded(uint256 required, uint256 capacity);
    error InvalidArtControl(uint8 control, uint8 value, uint8 maximum);
    error InvalidEngine(uint16 engine);

    function validateArt(MembershipTypes.ArtConfig memory art) internal pure {
        if (art.engine >= 6) revert InvalidEngine(art.engine);
        _validate(0, art.palette, MAX_PALETTE);
        _validate(1, art.intensity, MAX_PERCENT_CONTROL);
        _validate(2, art.density, MAX_PERCENT_CONTROL);
        _validate(3, art.symmetry, MAX_PERCENT_CONTROL);
        _validate(4, art.typographyScale, MAX_PERCENT_CONTROL);
        _validate(5, art.typographyStyle, 3);
        _validate(6, art.textVisibility, 1);
        _validate(7, art.focalX, MAX_PERCENT_CONTROL);
        _validate(8, art.focalY, MAX_PERCENT_CONTROL);
        _validate(9, art.grain, MAX_PERCENT_CONTROL);
        _validate(10, art.mediaMix, MAX_PERCENT_CONTROL);
        _validate(11, art.primary, MAX_PERCENT_CONTROL);
        _validate(12, art.secondary, MAX_PERCENT_CONTROL);
        _validate(13, art.tertiary, MAX_PERCENT_CONTROL);
    }

    function renderSeed(
        uint256 chainId,
        bytes32 tierIdentity,
        uint256 tokenId,
        uint128 collectionSeed
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(RENDER_SEED_DOMAIN, chainId, tierIdentity, tokenId, collectionSeed)
        );
    }

    function lane(bytes32 seed, uint256 index) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, index)));
    }

    function palette(uint8 index) internal pure returns (Palette memory colors) {
        if (index == 0) {
            return Palette("#120b0a", "#f4e6c8", "#ff6047", "#4d7cfe", "#f6b73c");
        }
        if (index == 1) {
            return Palette("#111419", "#f3efe4", "#ef476f", "#73a6ff", "#ffd166");
        }
        if (index == 2) {
            return Palette("#17110f", "#fff0d1", "#ff7a3d", "#247ba0", "#e8c547");
        }
        if (index == 3) {
            return Palette("#151116", "#f7e8dc", "#dc5a7d", "#646ee4", "#ffbd69");
        }
        return Palette("#101512", "#f2eadf", "#ff5b4d", "#2d89c8", "#e0b44c");
    }

    function init(uint256 capacity) internal pure returns (Buffer memory buffer) {
        buffer.data = new bytes(capacity);
    }

    function append(Buffer memory buffer, string memory value) internal pure {
        appendBytes(buffer, bytes(value));
    }

    function appendBytes(Buffer memory buffer, bytes memory value) internal pure {
        uint256 end = buffer.cursor + value.length;
        if (end > buffer.data.length) {
            revert BufferCapacityExceeded(end, buffer.data.length);
        }

        bytes memory destination = buffer.data;
        uint256 cursor = buffer.cursor;
        uint256 length = value.length;
        assembly ("memory-safe") {
            mcopy(add(add(destination, 0x20), cursor), add(value, 0x20), length)
        }
        buffer.cursor = end;
    }

    function finish(Buffer memory buffer) internal pure returns (string memory value) {
        bytes memory data = buffer.data;
        uint256 length = buffer.cursor;
        assembly ("memory-safe") {
            mstore(data, length)
        }
        value = string(data);
    }

    function xmlEscape(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        Buffer memory output = init(input.length * 6);
        for (uint256 index; index < input.length; ++index) {
            bytes1 character = input[index];
            if (character == "&") {
                append(output, "&amp;");
            } else if (character == "<") {
                append(output, "&lt;");
            } else if (character == ">") {
                append(output, "&gt;");
            } else if (character == '"') {
                append(output, "&quot;");
            } else if (character == "'") {
                append(output, "&apos;");
            } else {
                uint256 cursor = output.cursor;
                output.data[cursor] = character;
                output.cursor = cursor + 1;
            }
        }
        return finish(output);
    }

    function jsonEscape(string memory value) internal pure returns (string memory) {
        return Strings.escapeJSON(value);
    }

    function signed(int256 value) internal pure returns (string memory) {
        return value.toStringSigned();
    }

    function signed(uint256 value, uint256 midpoint) internal pure returns (string memory) {
        if (value >= midpoint) return decimal(value - midpoint);
        return string.concat("-", decimal(midpoint - value));
    }

    function decimal(uint256 value) internal pure returns (string memory) {
        return value.toString();
    }

    function opacity(uint8 percentage) internal pure returns (string memory) {
        if (percentage == 0) return "0";
        if (percentage == 100) return "1";
        if (percentage < 10) return string.concat("0.0", uint256(percentage).toString());
        return string.concat("0.", uint256(percentage).toString());
    }

    function geometryID(bytes32 seed) internal pure returns (string memory) {
        return Strings.toHexString(uint256(seed), 32);
    }

    function engineName(uint16 engine) internal pure returns (string memory) {
        if (engine == 0) return "STACK";
        if (engine == 1) return "CHORUS";
        if (engine == 2) return "LOOM";
        if (engine == 3) return "BLOOM";
        if (engine == 4) return "MARQUEE";
        if (engine == 5) return "AFTERIMAGE";
        revert InvalidEngine(engine);
    }

    function mediaMIME(MembershipTypes.MediaMIME mime) internal pure returns (string memory) {
        if (mime == MembershipTypes.MediaMIME.JPEG) return "image/jpeg";
        if (mime == MembershipTypes.MediaMIME.PNG) return "image/png";
        return "";
    }

    function preserveAspectRatio(MembershipTypes.ImageFit fit, uint8 focalX, uint8 focalY)
        internal
        pure
        returns (string memory)
    {
        string memory x = focalX < 34 ? "xMin" : focalX < 67 ? "xMid" : "xMax";
        string memory y = focalY < 34 ? "YMin" : focalY < 67 ? "YMid" : "YMax";
        return string.concat(x, y, fit == MembershipTypes.ImageFit.Contain ? " meet" : " slice");
    }

    function _validate(uint8 control, uint8 value, uint8 maximum) private pure {
        if (value > maximum) revert InvalidArtControl(control, value, maximum);
    }
}
