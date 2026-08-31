// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Bounded structural validation for Studio-shaped raster media admitted to the renderer.
/// @dev Full JPEG/PNG decoding is deliberately left to the browser Studio. The protocol enforces
///      the square output envelope and enough framing to reject headers masquerading as images.
library ImageValidation {
    uint256 internal constant MAX_OUTPUT_SIDE = 1280;
    uint32 private constant _IHDR = 0x49484452;
    uint32 private constant _PLTE = 0x504c5445;
    uint32 private constant _IDAT = 0x49444154;
    uint32 private constant _IEND = 0x49454e44;

    struct PNGState {
        bool seenIHDR;
        bool seenIDAT;
        bool endedIDAT;
        bool seenPLTE;
        uint8 colorType;
        uint256 idatBytes;
    }

    struct JPEGState {
        bool seenFrame;
        bool seenQuantizationTable;
        bool seenHuffmanTable;
        bool seenScan;
        uint8 frameComponents;
    }

    function isValid(bytes memory payload, MembershipTypes.MediaMIME mime)
        internal
        pure
        returns (bool)
    {
        if (mime == MembershipTypes.MediaMIME.PNG) return _isValidPNG(payload);
        if (mime == MembershipTypes.MediaMIME.JPEG) return _isValidJPEG(payload);
        return false;
    }

    function _isValidPNG(bytes memory payload) private pure returns (bool) {
        uint256 length = payload.length;
        if (
            length < 45 || payload[0] != 0x89 || payload[1] != 0x50 || payload[2] != 0x4e
                || payload[3] != 0x47 || payload[4] != 0x0d || payload[5] != 0x0a
                || payload[6] != 0x1a || payload[7] != 0x0a
        ) return false;

        uint256 cursor = 8;
        PNGState memory state;
        while (cursor < length) {
            if (length - cursor < 12) return false;

            uint256 chunkLength = _readUint32(payload, cursor);
            uint256 chunkEnd = cursor + 12 + chunkLength;
            if (chunkEnd > length) return false;
            uint32 chunkType = uint32(_readUint32(payload, cursor + 4));

            if (!state.seenIHDR) {
                if (chunkType != _IHDR || chunkLength != 13) return false;
                uint256 width = _readUint32(payload, cursor + 8);
                uint256 height = _readUint32(payload, cursor + 12);
                if (!_dimensionsAreSafe(width, height)) return false;
                state.colorType = uint8(payload[cursor + 17]);
                if (!_validPNGColor(uint8(payload[cursor + 16]), state.colorType)) {
                    return false;
                }
                if (
                    payload[cursor + 18] != 0x00 || payload[cursor + 19] != 0x00
                        || uint8(payload[cursor + 20]) > 1
                ) return false;
                if (!_chunkCRCMatches(payload, cursor, chunkLength)) return false;
                state.seenIHDR = true;
            } else if (chunkType == _IHDR) {
                return false;
            }

            if (chunkType == _PLTE) {
                if (state.seenPLTE || state.seenIDAT || chunkLength == 0 || chunkLength > 768) {
                    return false;
                }
                if (chunkLength % 3 != 0) return false;
                state.seenPLTE = true;
            }
            if (chunkType == _IDAT) {
                if (state.endedIDAT) return false;
                if (!state.seenIDAT) {
                    if (chunkLength < 2 || !_validZlibHeader(payload, cursor + 8)) return false;
                    state.seenIDAT = true;
                }
                state.idatBytes += chunkLength;
            } else if (state.seenIDAT && chunkType != _IEND) {
                state.endedIDAT = true;
            }
            if (chunkType == _IEND) {
                return chunkLength == 0 && state.seenIDAT && state.idatBytes >= 6
                    && chunkEnd == length && (state.colorType != 3 || state.seenPLTE)
                    && _chunkCRCMatches(payload, cursor, chunkLength);
            }
            if (
                _isCriticalChunk(chunkType) && chunkType != _IHDR && chunkType != _PLTE
                    && chunkType != _IDAT
            ) {
                return false;
            }
            cursor = chunkEnd;
        }
        return false;
    }

    function _isValidJPEG(bytes memory payload) private pure returns (bool) {
        uint256 length = payload.length;
        if (
            length < 19 || payload[0] != 0xff || payload[1] != 0xd8 || payload[length - 2] != 0xff
                || payload[length - 1] != 0xd9
        ) return false;

        uint256 cursor = 2;
        JPEGState memory state;
        while (cursor + 1 < length) {
            if (payload[cursor] != 0xff) return false;
            while (cursor < length && payload[cursor] == 0xff) ++cursor;
            if (cursor >= length) return false;

            uint8 marker = uint8(payload[cursor]);
            ++cursor;
            if (marker == 0xd9) {
                return cursor == length && state.seenFrame && state.seenQuantizationTable
                    && state.seenHuffmanTable && state.seenScan;
            }
            if (
                marker == 0x00 || marker == 0xd8 || marker == 0x01
                    || (marker >= 0xd0 && marker <= 0xd7)
            ) return false;
            if (cursor + 1 >= length - 2) return false;

            uint256 segmentLength = _readUint16(payload, cursor);
            if (segmentLength < 2 || cursor + segmentLength > length - 2) return false;
            if (_isStartOfFrame(marker)) {
                if (state.seenFrame) return false;
                if (segmentLength < 11) return false;
                uint8 componentCount = uint8(payload[cursor + 7]);
                if (
                    componentCount == 0 || componentCount > 4
                        || segmentLength != 8 + uint256(componentCount) * 3
                        || uint8(payload[cursor + 2]) != 8
                ) return false;
                uint256 height = _readUint16(payload, cursor + 3);
                uint256 width = _readUint16(payload, cursor + 5);
                if (!_dimensionsAreSafe(width, height)) return false;
                state.frameComponents = componentCount;
                state.seenFrame = true;
            } else if (marker == 0xdb) {
                if (segmentLength <= 2) return false;
                state.seenQuantizationTable = true;
            } else if (marker == 0xc4) {
                if (segmentLength <= 2) return false;
                state.seenHuffmanTable = true;
            } else if (marker == 0xda) {
                uint8 scanComponents = uint8(payload[cursor + 2]);
                if (
                    !state.seenFrame || !state.seenQuantizationTable || !state.seenHuffmanTable
                        || scanComponents == 0 || scanComponents > state.frameComponents
                        || segmentLength != 6 + uint256(scanComponents) * 2
                ) return false;
                cursor += segmentLength;
                bool scanHasEntropy;
                while (cursor + 1 < length) {
                    if (payload[cursor] != 0xff) {
                        scanHasEntropy = true;
                        ++cursor;
                        continue;
                    }
                    uint8 next = uint8(payload[cursor + 1]);
                    if (next == 0x00) {
                        scanHasEntropy = true;
                        cursor += 2;
                        continue;
                    }
                    if (next >= 0xd0 && next <= 0xd7) {
                        cursor += 2;
                        continue;
                    }
                    break;
                }
                if (!scanHasEntropy) return false;
                state.seenScan = true;
                continue;
            }
            cursor += segmentLength;
        }
        return false;
    }

    function _validPNGColor(uint8 bitDepth, uint8 colorType) private pure returns (bool) {
        if (colorType == 0) {
            return
                bitDepth == 1 || bitDepth == 2 || bitDepth == 4 || bitDepth == 8 || bitDepth == 16;
        }
        if (colorType == 2 || colorType == 4 || colorType == 6) {
            return bitDepth == 8 || bitDepth == 16;
        }
        if (colorType == 3) {
            return bitDepth == 1 || bitDepth == 2 || bitDepth == 4 || bitDepth == 8;
        }
        return false;
    }

    function _dimensionsAreSafe(uint256 width, uint256 height) private pure returns (bool) {
        return width != 0 && width == height && width <= MAX_OUTPUT_SIDE;
    }

    function _isStartOfFrame(uint8 marker) private pure returns (bool) {
        return marker == 0xc0 || marker == 0xc1 || marker == 0xc2;
    }

    function _validZlibHeader(bytes memory payload, uint256 cursor) private pure returns (bool) {
        uint8 compression = uint8(payload[cursor]);
        uint8 flags = uint8(payload[cursor + 1]);
        return (compression & 0x0f) == 8 && (compression >> 4) <= 7 && (flags & 0x20) == 0
            && (uint256(compression) * 256 + flags) % 31 == 0;
    }

    function _isCriticalChunk(uint32 chunkType) private pure returns (bool) {
        return (chunkType & 0x20000000) == 0;
    }

    function _chunkCRCMatches(bytes memory payload, uint256 cursor, uint256 chunkLength)
        private
        pure
        returns (bool)
    {
        uint32 crc = type(uint32).max;
        uint256 end = cursor + 8 + chunkLength;
        for (uint256 index = cursor + 4; index < end; ++index) {
            crc ^= uint32(uint8(payload[index]));
            for (uint256 bit; bit < 8; ++bit) {
                crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
            }
        }
        return ~crc == uint32(_readUint32(payload, end));
    }

    function _readUint16(bytes memory payload, uint256 cursor) private pure returns (uint256) {
        return (uint256(uint8(payload[cursor])) << 8) | uint256(uint8(payload[cursor + 1]));
    }

    function _readUint32(bytes memory payload, uint256 cursor) private pure returns (uint256) {
        return (uint256(uint8(payload[cursor])) << 24) | (uint256(uint8(payload[cursor + 1])) << 16)
            | (uint256(uint8(payload[cursor + 2])) << 8) | uint256(uint8(payload[cursor + 3]));
    }
}
