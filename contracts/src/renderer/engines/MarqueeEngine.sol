// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice Kinetic backstage-poster typography, slanted panels, and registration marks.
library MarqueeEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        uint256 panels = 2 + uint256(context.art.primary) * 3 / 100;
        uint256 slant = 30 + uint256(context.art.secondary) * 85 / 100;
        uint256 registration = 5 + uint256(context.art.tertiary) * 22 / 100;
        output.defs = _defs(context, panels, slant);
        output.underlay = _underlay(context, panels, slant);
        output.overlay = _overlay(context, registration);
    }

    function _defs(RendererPrimitives.EngineContext memory context, uint256 panels, uint256 slant)
        private
        pure
        returns (string memory)
    {
        RendererPrimitives.Buffer memory defs = RendererPrimitives.init(5000);
        defs.append(
            "<style><![CDATA[.marquee-panel{stroke:var(--bg);stroke-width:12}.marquee-panel-a{fill:var(--blue)}"
            ".marquee-panel-b{fill:var(--hot)}.marquee-panel-c{fill:var(--gold)}.marquee-panel-d{fill:var(--paper)}"
            ".marquee-word{fill:var(--paper);font-weight:900;letter-spacing:-10px}.marquee-word-dark{fill:var(--bg)}"
            ".marquee-ghost{fill:none;stroke:var(--hot);stroke-width:5;opacity:.48}.marquee-crop{stroke:var(--paper);stroke-width:7}"
            ".marquee-stripe{fill:none;stroke:var(--paper);stroke-width:8;stroke-dasharray:46 24}"
            ".marquee-star{transform-box:fill-box;transform-origin:center;fill:var(--gold)}"
            "svg[data-state='afterglow'] .marquee-panel{stroke:var(--paper)}"
            "svg[data-state='afterglow'] .marquee-ghost{stroke:var(--gold);opacity:.58}"
            "svg[data-media='native'] .marquee-generated{opacity:.16}]]></style>"
            '<clipPath id="engine-media-clip">'
        );
        for (uint256 index; index < panels; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 620 + index);
            uint256 y = 190 + index * 132 + (random >> 8) % 36;
            uint256 left = 54 + index * 36 + random % 45;
            uint256 right = 1128 - index * 22 - (random >> 16) % 56;
            uint256 localSlant = slant + (random >> 24) % 55;
            defs.append('<polygon points="');
            defs.append(RendererPrimitives.decimal(left + 44));
            defs.append(",");
            defs.append(RendererPrimitives.decimal(y + 20));
            defs.append(" ");
            defs.append(RendererPrimitives.decimal(right - 44));
            defs.append(",");
            defs.append(RendererPrimitives.decimal(y - localSlant + 20));
            defs.append(" ");
            defs.append(RendererPrimitives.decimal(right - 70));
            defs.append(",");
            defs.append(RendererPrimitives.decimal(y + 140));
            defs.append(" ");
            defs.append(RendererPrimitives.decimal(left + 24));
            defs.append(",");
            defs.append(RendererPrimitives.decimal(y + 154));
            defs.append('"/>');
        }
        defs.append("</clipPath>");
        return defs.finish();
    }

    function _underlay(
        RendererPrimitives.EngineContext memory context,
        uint256 panels,
        uint256 slant
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(8000);
        layer.append('<g class="marquee-panels">');
        for (uint256 index; index < panels; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 620 + index);
            uint256 y = 190 + index * 132 + (random >> 8) % 36;
            uint256 left = 54 + index * 36 + random % 45;
            uint256 right = 1128 - index * 22 - (random >> 16) % 56;
            uint256 localSlant = slant + (random >> 24) % 55;
            layer.append('<polygon class="marquee-panel marquee-panel-');
            layer.append(_panelClass(index));
            layer.append('" points="');
            layer.append(RendererPrimitives.decimal(left));
            layer.append(",");
            layer.append(RendererPrimitives.decimal(y));
            layer.append(" ");
            layer.append(RendererPrimitives.decimal(right));
            layer.append(",");
            layer.append(RendererPrimitives.decimal(y - localSlant));
            layer.append(" ");
            layer.append(RendererPrimitives.decimal(right - 50));
            layer.append(",");
            layer.append(RendererPrimitives.decimal(y + 132));
            layer.append(" ");
            layer.append(RendererPrimitives.decimal(left - 24));
            layer.append(",");
            layer.append(RendererPrimitives.decimal(y + 166));
            layer.append('"/>');
        }
        layer.append("</g>");
        return layer.finish();
    }

    function _overlay(RendererPrimitives.EngineContext memory context, uint256 registration)
        private
        pure
        returns (string memory)
    {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(8000);
        uint256 random = RendererPrimitives.lane(context.seed, 680);
        uint256 nudge = random % 36;
        uint256 shift = (random >> 8) % 55;
        layer.append('<g class="marquee-generated">');
        layer.append('<text class="marquee-ghost" x="');
        layer.append(RendererPrimitives.decimal(72 + shift + registration));
        layer.append('" y="390" font-size="210">BACKED</text>');
        layer.append('<text class="marquee-word" x="');
        layer.append(RendererPrimitives.decimal(72 + shift));
        layer.append('" y="390" font-size="210">BACKED</text>');
        layer.append('<text class="marquee-ghost" x="');
        layer.append(RendererPrimitives.decimal(260 + shift + registration));
        layer.append('" y="568" font-size="188">BY</text>');
        layer.append('<text class="marquee-word marquee-word-dark" x="');
        layer.append(RendererPrimitives.decimal(260 + shift));
        layer.append('" y="568" font-size="188">BY</text>');
        layer.append('<text class="marquee-ghost" x="');
        layer.append(RendererPrimitives.decimal(90 + shift / 2 + registration));
        layer.append('" y="770" font-size="238">FANS</text>');
        layer.append('<text class="marquee-word" x="');
        layer.append(RendererPrimitives.decimal(90 + shift / 2));
        layer.append('" y="770" font-size="238">FANS</text>');
        layer.append('<path class="marquee-stripe" d="M70 ');
        layer.append(RendererPrimitives.decimal(835 + nudge));
        layer.append("L1120 ");
        layer.append(RendererPrimitives.decimal(770 + nudge));
        layer.append('"/>');
        layer.append(
            '<path class="marquee-crop" d="M72 128v70M72 128h70M1128 128v70M1128 128h-70M72 884v-70M72 884h70M1128 884v-70M1128 884h-70"/>'
            '<path class="marquee-star" d="M1020 735l18 48 50 2-39 31 14 49-43-28-43 28 14-49-39-31 50-2z"/>'
            "</g>"
        );
        return layer.finish();
    }

    function _panelClass(uint256 index) private pure returns (string memory) {
        if (index % 4 == 0) return "a";
        if (index % 4 == 1) return "b";
        if (index % 4 == 2) return "c";
        return "d";
    }
}
