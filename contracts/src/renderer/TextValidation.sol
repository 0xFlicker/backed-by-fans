// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Strict UTF-8 and XML 1.0 character validation for creator-controlled text.
library TextValidation {
    error InvalidText();

    function validate(string memory value) internal pure {
        if (!isValid(value)) revert InvalidText();
    }

    function isValid(string memory value) internal pure returns (bool) {
        bytes memory input = bytes(value);
        uint256 index;

        while (index < input.length) {
            uint8 first = uint8(input[index]);
            uint32 codepoint;
            uint256 width;

            if (first <= 0x7f) {
                codepoint = first;
                width = 1;
            } else if (first >= 0xc2 && first <= 0xdf) {
                if (index + 2 > input.length) return false;
                uint8 second = uint8(input[index + 1]);
                if (!_isContinuation(second)) return false;
                codepoint = (uint32(first & 0x1f) << 6) | uint32(second & 0x3f);
                width = 2;
            } else if (first >= 0xe0 && first <= 0xef) {
                if (index + 3 > input.length) return false;
                uint8 second = uint8(input[index + 1]);
                uint8 third = uint8(input[index + 2]);
                if (!_isContinuation(third)) return false;
                if (first == 0xe0) {
                    if (second < 0xa0 || second > 0xbf) return false;
                } else if (first == 0xed) {
                    if (second < 0x80 || second > 0x9f) return false;
                } else if (!_isContinuation(second)) {
                    return false;
                }
                codepoint = (uint32(first & 0x0f) << 12) | (uint32(second & 0x3f) << 6)
                    | uint32(third & 0x3f);
                width = 3;
            } else if (first >= 0xf0 && first <= 0xf4) {
                if (index + 4 > input.length) return false;
                uint8 second = uint8(input[index + 1]);
                uint8 third = uint8(input[index + 2]);
                uint8 fourth = uint8(input[index + 3]);
                if (!_isContinuation(third) || !_isContinuation(fourth)) return false;
                if (first == 0xf0) {
                    if (second < 0x90 || second > 0xbf) return false;
                } else if (first == 0xf4) {
                    if (second < 0x80 || second > 0x8f) return false;
                } else if (!_isContinuation(second)) {
                    return false;
                }
                codepoint = (uint32(first & 0x07) << 18) | (uint32(second & 0x3f) << 12)
                    | (uint32(third & 0x3f) << 6) | uint32(fourth & 0x3f);
                width = 4;
            } else {
                return false;
            }

            if (!_isXMLCharacter(codepoint)) return false;
            index += width;
        }

        return true;
    }

    function _isContinuation(uint8 value) private pure returns (bool) {
        return value >= 0x80 && value <= 0xbf;
    }

    function _isXMLCharacter(uint32 codepoint) private pure returns (bool) {
        return codepoint == 0x09 || codepoint == 0x0a || codepoint == 0x0d
            || (codepoint >= 0x20 && codepoint <= 0xd7ff)
            || (codepoint >= 0xe000 && codepoint <= 0xfffd)
            || (codepoint >= 0x10000 && codepoint <= 0x10ffff);
    }
}
