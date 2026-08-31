// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice Monumental offset planes derived from the Backed By Fans stack mark.
library StackEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    uint256 private constant _PLANE_COUNT = 5;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        (uint256 apertureX, uint256 apertureY, uint256 apertureWidth, uint256 apertureHeight) =
            _aperture(context);

        output.defs = string.concat(
            '<clipPath id="engine-media-clip"><rect x="',
            RendererPrimitives.decimal(apertureX),
            '" y="',
            RendererPrimitives.decimal(apertureY),
            '" width="',
            RendererPrimitives.decimal(apertureWidth),
            '" height="',
            RendererPrimitives.decimal(apertureHeight),
            '" rx="54"/></clipPath>'
        );

        output.underlay = _underlay(context);
        output.overlay = _overlay(context, apertureX, apertureY, apertureWidth, apertureHeight);
    }

    function _underlay(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (string memory)
    {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(10_000);
        uint256 spread = 22 + uint256(context.art.primary) * 46 / 100;
        uint256 compression = uint256(context.art.secondary) * 52 / 100;

        buffer.append('<g class="stack-field">');
        for (uint256 index; index < _PLANE_COUNT; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, index);
            uint256 x = 91 + index * spread + random % 31;
            uint256 y = 105 + index * (spread + 8) + (random >> 8) % 27;
            uint256 width = 865 - index * (30 + compression / 5);
            uint256 height = 610 - index * (27 + compression / 7);
            string memory planeClass =
                string.concat("stack-plane plane-", RendererPrimitives.decimal(index));

            buffer.append('<rect class="');
            buffer.append(planeClass);
            buffer.append('" x="');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append('" y="');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append('" width="');
            buffer.append(RendererPrimitives.decimal(width));
            buffer.append('" height="');
            buffer.append(RendererPrimitives.decimal(height));
            buffer.append('" rx="');
            buffer.append(RendererPrimitives.decimal(72 - index * 7));
            buffer.append('" transform="rotate(');
            buffer.append(RendererPrimitives.signed((random >> 16) % 17, 8));
            buffer.append(' 600 510)"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="supporter-rhythm" aria-hidden="true">');
        uint256 count = 7 + uint256(context.art.density) * 7 / 100;
        for (uint256 index; index < count; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 20 + index);
            uint256 x = 935 + (random % 72);
            uint256 y = 150 + index * 52 + ((random >> 8) % 19);
            uint256 width = 54 + ((random >> 16) % 94);
            buffer.append('<rect class="supporter-slab" x="');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append('" y="');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append('" width="');
            buffer.append(RendererPrimitives.decimal(width));
            buffer.append('" height="16" rx="8"/>');
        }
        buffer.append("</g>");
        return buffer.finish();
    }

    function _overlay(
        RendererPrimitives.EngineContext memory context,
        uint256 apertureX,
        uint256 apertureY,
        uint256 apertureWidth,
        uint256 apertureHeight
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(9000);
        uint256 lineCount = 6 + uint256(context.art.tertiary) * 7 / 100;
        uint256 lineGap = apertureHeight / (lineCount + 1);

        buffer.append('<g class="generated-aperture" clip-path="url(#engine-media-clip)">');
        buffer.append('<rect class="aperture-ground" x="');
        buffer.append(RendererPrimitives.decimal(apertureX));
        buffer.append('" y="');
        buffer.append(RendererPrimitives.decimal(apertureY));
        buffer.append('" width="');
        buffer.append(RendererPrimitives.decimal(apertureWidth));
        buffer.append('" height="');
        buffer.append(RendererPrimitives.decimal(apertureHeight));
        buffer.append('"/>');
        for (uint256 index; index < lineCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 50 + index);
            uint256 y = apertureY + (index + 1) * lineGap;
            buffer.append('<path class="aperture-line" d="M');
            buffer.append(RendererPrimitives.decimal(apertureX + random % 91 - 135));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append("H");
            buffer.append(RendererPrimitives.decimal(apertureX + apertureWidth + 90));
            buffer.append('"/>');
        }
        uint256 markX = apertureX + 52;
        uint256 markY = apertureY + 48;
        buffer.append('<g class="aperture-sigil" transform="rotate(-7 ');
        buffer.append(RendererPrimitives.decimal(markX + 120));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(markY + 100));
        buffer.append(')"><rect class="aperture-sigil-a" x="');
        buffer.append(RendererPrimitives.decimal(markX));
        buffer.append('" y="');
        buffer.append(RendererPrimitives.decimal(markY));
        buffer.append('" width="230" height="64" rx="22"/><rect class="aperture-sigil-b" x="');
        buffer.append(RendererPrimitives.decimal(markX + 32));
        buffer.append('" y="');
        buffer.append(RendererPrimitives.decimal(markY + 72));
        buffer.append('" width="230" height="64" rx="22"/><rect class="aperture-sigil-c" x="');
        buffer.append(RendererPrimitives.decimal(markX + 64));
        buffer.append('" y="');
        buffer.append(RendererPrimitives.decimal(markY + 144));
        buffer.append('" width="230" height="64" rx="22"/></g>');
        buffer.append("</g>");

        buffer.append('<rect class="aperture-frame" x="');
        buffer.append(RendererPrimitives.decimal(apertureX));
        buffer.append('" y="');
        buffer.append(RendererPrimitives.decimal(apertureY));
        buffer.append('" width="');
        buffer.append(RendererPrimitives.decimal(apertureWidth));
        buffer.append('" height="');
        buffer.append(RendererPrimitives.decimal(apertureHeight));
        buffer.append('" rx="54"/>');

        uint256 ringX = 172 + RendererPrimitives.lane(context.seed, 80) % 88;
        uint256 ringY = 850 + RendererPrimitives.lane(context.seed, 81) % 74;
        buffer.append('<g class="registration-ring" transform-origin="');
        buffer.append(RendererPrimitives.decimal(ringX));
        buffer.append("px ");
        buffer.append(RendererPrimitives.decimal(ringY));
        buffer.append('px"><circle cx="');
        buffer.append(RendererPrimitives.decimal(ringX));
        buffer.append('" cy="');
        buffer.append(RendererPrimitives.decimal(ringY));
        buffer.append('" r="54"/><path d="M');
        buffer.append(RendererPrimitives.decimal(ringX - 72));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(ringY));
        buffer.append("H");
        buffer.append(RendererPrimitives.decimal(ringX + 72));
        buffer.append("M");
        buffer.append(RendererPrimitives.decimal(ringX));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(ringY - 72));
        buffer.append("V");
        buffer.append(RendererPrimitives.decimal(ringY + 72));
        buffer.append('"/></g>');
        return buffer.finish();
    }

    function _aperture(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256 x, uint256 y, uint256 width, uint256 height)
    {
        uint256 random = RendererPrimitives.lane(context.seed, 100);
        x = 286 + random % 94;
        y = 276 + (random >> 8) % 72;
        width = 480 + uint256(context.art.tertiary) * 180 / 100;
        height = 330 + uint256(context.art.tertiary) * 120 / 100;
    }
}
