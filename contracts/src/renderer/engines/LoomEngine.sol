// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice Curved warp and weft ribbons with explicit over-under crossings.
library LoomEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        uint256 warpCount = _warpCount(context);
        uint256 weftCount = _weftCount(context);
        uint256 windowCount = _windowCount(context);

        output.defs = _defs(context, windowCount);
        output.underlay = _underlay(context, warpCount, weftCount);
        output.overlay = _overlay(context, warpCount, weftCount, windowCount);
    }

    function _defs(RendererPrimitives.EngineContext memory context, uint256 windowCount)
        private
        pure
        returns (string memory)
    {
        RendererPrimitives.Buffer memory defs = RendererPrimitives.init(9000);
        defs.append('<clipPath id="engine-media-clip">');
        for (uint256 index; index < windowCount; ++index) {
            (uint256 x, uint256 y, uint256 width, uint256 height, uint256 rotation) =
                _window(context, index);
            uint256 centerX = x + width / 2;
            uint256 centerY = y + height / 2;
            defs.append('<rect x="');
            defs.append(RendererPrimitives.decimal(x));
            defs.append('" y="');
            defs.append(RendererPrimitives.decimal(y));
            defs.append('" width="');
            defs.append(RendererPrimitives.decimal(width));
            defs.append('" height="');
            defs.append(RendererPrimitives.decimal(height));
            defs.append('" rx="28" transform="rotate(');
            defs.append(RendererPrimitives.signed(rotation, 6));
            defs.append(" ");
            defs.append(RendererPrimitives.decimal(centerX));
            defs.append(" ");
            defs.append(RendererPrimitives.decimal(centerY));
            defs.append(')"/>');
        }
        defs.append("</clipPath><style><![CDATA[");
        defs.append(
            ".loom-field{fill:var(--blue);opacity:.12}"
            ".loom-warp,.loom-weft{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.92}"
            ".loom-warp{stroke:var(--blue);stroke-dasharray:280 18}"
            ".loom-warp:nth-child(even){stroke:var(--hot);stroke-dasharray:170 12}"
            ".loom-weft{stroke:var(--paper);stroke-dasharray:330 20}"
            ".loom-weft:nth-child(3n){stroke:var(--gold);stroke-dasharray:210 16}"
            ".loom-window-ground{fill:var(--bg)}.loom-window-signal{fill:none;stroke:var(--paper);"
            "stroke-width:13;opacity:.62}.loom-window-signal:nth-child(3n){stroke:var(--hot)}"
            ".loom-cross{stroke:var(--bg);stroke-width:5}.loom-cross-warp{fill:var(--blue)}"
            ".loom-cross-weft{fill:var(--paper)}.loom-cross:nth-child(3n){fill:var(--hot)}"
            ".loom-window-frame{fill:none;stroke:var(--paper);stroke-width:7;opacity:.88}"
            ".loom-frame{fill:none;stroke:var(--gold);stroke-width:5;stroke-dasharray:18 13;opacity:.58}"
            ".loom-thread-halo{fill:none;stroke:var(--hot);stroke-width:19;opacity:.16}"
            "svg[data-state='afterglow'] .loom-warp{stroke:var(--gold);opacity:.72}"
            "svg[data-state='afterglow'] .loom-weft{stroke:var(--hot);opacity:.7}"
            "svg[data-state='afterglow'] .loom-cross-warp{fill:var(--paper)}"
            "svg[data-state='afterglow'] .loom-cross-weft{fill:var(--gold)}"
            "svg[data-state='afterglow'] .loom-window-frame{stroke:var(--hot);opacity:.72}"
            "svg[data-media='native'] .loom-window-ground,svg[data-media='native'] .loom-window-signal{opacity:.16}"
        );
        defs.append("]]></style>");
        return defs.finish();
    }

    function _underlay(
        RendererPrimitives.EngineContext memory context,
        uint256 warpCount,
        uint256 weftCount
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(25_000);
        uint256 strokeWidth = 34 + uint256(context.art.intensity) * 18 / 100;
        uint256 tension = 36 + uint256(context.art.tertiary);

        buffer.append(
            '<path class="loom-field" d="M28 260Q390 22 790 105T1180 332V820Q820 930 380 900T28 840Z"/>'
        );
        buffer.append('<g class="loom-warp-field" aria-hidden="true">');
        for (uint256 index; index < warpCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 320 + index);
            uint256 x = 105 + index * 990 / (warpCount - 1);
            uint256 bendA = 24 + random % (36 + tension / 3);
            uint256 bendB = 24 + (random >> 8) % (36 + tension / 3);
            uint256 bendC = 24 + (random >> 16) % (36 + tension / 3);
            buffer.append('<path class="loom-warp" style="stroke-width:');
            buffer.append(RendererPrimitives.decimal(strokeWidth));
            buffer.append('" d="M');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append(" 120 C");
            buffer.append(RendererPrimitives.decimal(x + bendA));
            buffer.append(" 330 ");
            buffer.append(RendererPrimitives.decimal(x - bendB));
            buffer.append(" 650 ");
            buffer.append(RendererPrimitives.decimal(x + bendC));
            buffer.append(' 900"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="loom-weft-field" aria-hidden="true">');
        for (uint256 index; index < weftCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 360 + index);
            uint256 y = 160 + index * 675 / (weftCount - 1);
            uint256 bendA = 24 + random % (36 + tension / 3);
            uint256 bendB = 24 + (random >> 8) % (36 + tension / 3);
            uint256 bendC = 24 + (random >> 16) % (36 + tension / 3);
            buffer.append('<path class="loom-weft" style="stroke-width:');
            buffer.append(RendererPrimitives.decimal(strokeWidth));
            buffer.append('" d="M68 ');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append(" C348 ");
            buffer.append(RendererPrimitives.decimal(y + bendA));
            buffer.append(" 790 ");
            buffer.append(RendererPrimitives.decimal(y - bendB));
            buffer.append(" 1132 ");
            buffer.append(RendererPrimitives.decimal(y + bendC));
            buffer.append('"/>');
        }
        buffer.append("</g>");

        buffer.append(
            '<g class="loom-generated-windows" clip-path="url(#engine-media-clip)" aria-hidden="true">'
        );
        buffer.append('<rect class="loom-window-ground" width="1200" height="1200"/>');
        uint256 signalCount = 8 + uint256(context.art.density) * 8 / 100;
        for (uint256 index; index < signalCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 400 + index);
            uint256 y = 250 + index * 600 / signalCount + random % 31;
            buffer.append('<path class="loom-window-signal" d="M210 ');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append(" Q600 ");
            buffer.append(RendererPrimitives.decimal(y + 20 + (random >> 8) % 76));
            buffer.append(" 1040 ");
            buffer.append(RendererPrimitives.decimal(y - 18));
            buffer.append('"/>');
        }
        buffer.append("</g>");

        uint256 haloInset = 72 + uint256(context.art.symmetry) * 52 / 100;
        buffer.append('<rect class="loom-thread-halo" x="');
        buffer.append(RendererPrimitives.decimal(haloInset));
        buffer.append('" y="112" width="');
        buffer.append(RendererPrimitives.decimal(1200 - haloInset * 2));
        buffer.append('" height="786" rx="96"/>');

        return buffer.finish();
    }

    function _overlay(
        RendererPrimitives.EngineContext memory context,
        uint256 warpCount,
        uint256 weftCount,
        uint256 windowCount
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(16_000);
        uint256 strokeWidth = 34 + uint256(context.art.intensity) * 18 / 100;
        uint256 crossingCount = warpCount < weftCount ? warpCount : weftCount;

        buffer.append('<g class="loom-crossings" aria-hidden="true">');
        for (uint256 index; index < crossingCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 440 + index);
            uint256 x = 105 + index * 990 / (warpCount - 1);
            uint256 y = 160 + ((index * 3 + random % weftCount) % weftCount) * 675 / (weftCount - 1);
            uint256 rotation = (random >> 8) % 13;
            if (index % 2 == 0) {
                buffer.append('<rect class="loom-cross loom-cross-warp" x="');
                buffer.append(RendererPrimitives.decimal(x - strokeWidth / 2));
                buffer.append('" y="');
                buffer.append(RendererPrimitives.decimal(y - 46));
                buffer.append('" width="');
                buffer.append(RendererPrimitives.decimal(strokeWidth));
                buffer.append('" height="92" rx="');
                buffer.append(RendererPrimitives.decimal(strokeWidth / 2));
            } else {
                buffer.append('<rect class="loom-cross loom-cross-weft" x="');
                buffer.append(RendererPrimitives.decimal(x - 46));
                buffer.append('" y="');
                buffer.append(RendererPrimitives.decimal(y - strokeWidth / 2));
                buffer.append('" width="92" height="');
                buffer.append(RendererPrimitives.decimal(strokeWidth));
                buffer.append('" rx="');
                buffer.append(RendererPrimitives.decimal(strokeWidth / 2));
            }
            buffer.append('" transform="rotate(');
            buffer.append(RendererPrimitives.signed(rotation, 6));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append(')"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="loom-window-frames" aria-hidden="true">');
        for (uint256 index; index < windowCount; ++index) {
            (uint256 x, uint256 y, uint256 width, uint256 height, uint256 rotation) =
                _window(context, index);
            uint256 centerX = x + width / 2;
            uint256 centerY = y + height / 2;
            buffer.append('<rect class="loom-window-frame" x="');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append('" y="');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append('" width="');
            buffer.append(RendererPrimitives.decimal(width));
            buffer.append('" height="');
            buffer.append(RendererPrimitives.decimal(height));
            buffer.append('" rx="28" transform="rotate(');
            buffer.append(RendererPrimitives.signed(rotation, 6));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(centerX));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(centerY));
            buffer.append(')"/>');
        }
        buffer.append(
            '</g><rect class="loom-frame" x="52" y="112" width="1096" height="786" rx="96"/>'
        );
        return buffer.finish();
    }

    function _window(RendererPrimitives.EngineContext memory context, uint256 index)
        private
        pure
        returns (uint256 x, uint256 y, uint256 width, uint256 height, uint256 rotation)
    {
        uint256 random = RendererPrimitives.lane(context.seed, 300 + index);
        x = 280 + (index % 3) * 220 + random % 45;
        y = 270 + (index >= 3 ? 250 : 0) + (random >> 8) % 35;
        width = 145 + (random >> 16) % 70;
        height = 110 + (random >> 24) % 80;
        rotation = (random >> 32) % 13;
    }

    function _warpCount(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256)
    {
        return 5 + uint256(context.art.primary) * 4 / 100 + uint256(context.art.density) * 2 / 100;
    }

    function _weftCount(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256)
    {
        return 5 + uint256(context.art.secondary) * 4 / 100 + uint256(context.art.density) * 2 / 100;
    }

    function _windowCount(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256)
    {
        return 3 + uint256(context.art.tertiary) * 3 / 100;
    }
}
