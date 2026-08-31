// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice A shaped auditorium of individual supporter lights around one creator core.
library ChorusEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    uint256 private constant _ARC_COUNT = 3;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        (uint256 coreX, uint256 coreY, uint256 coreRadius) = _core(context);
        uint256 voiceCount = _voiceCount(context);

        output.defs = _defs(coreX, coreY, coreRadius);
        output.underlay = _underlay(context, coreX, coreY, coreRadius);
        output.overlay = _overlay(context, coreX, coreY, coreRadius, voiceCount);
    }

    function _defs(uint256 coreX, uint256 coreY, uint256 coreRadius)
        private
        pure
        returns (string memory)
    {
        RendererPrimitives.Buffer memory defs = RendererPrimitives.init(6500);
        defs.append('<clipPath id="engine-media-clip"><ellipse cx="');
        defs.append(RendererPrimitives.decimal(coreX));
        defs.append('" cy="');
        defs.append(RendererPrimitives.decimal(coreY));
        defs.append('" rx="');
        defs.append(RendererPrimitives.decimal(coreRadius));
        defs.append('" ry="');
        defs.append(RendererPrimitives.decimal(coreRadius * 9 / 10));
        defs.append('"/></clipPath><style><![CDATA[');
        defs.append(
            ".chorus-proscenium{fill:var(--paper);opacity:.055}"
            ".chorus-arc{fill:none;stroke:var(--paper);stroke-width:5;opacity:.28}"
            ".chorus-arc:nth-child(2){stroke:var(--hot);opacity:.42}"
            ".chorus-arc:nth-child(3){stroke:var(--gold);opacity:.34}"
            ".chorus-core-disc{fill:var(--blue);stroke:var(--paper);stroke-width:12}"
            ".chorus-core-cut{fill:var(--bg);opacity:.2}"
            ".chorus-core-ray{stroke:var(--paper);stroke-width:6;opacity:.56}"
            ".chorus-halo,.chorus-core-ring{fill:none;stroke:var(--hot);stroke-width:7;opacity:.68;"
            "transform-box:fill-box;transform-origin:center}"
            ".chorus-halo{stroke:var(--gold);stroke-width:18;opacity:.2}"
            ".chorus-light{fill:var(--paper);stroke:var(--bg);stroke-width:5;transform-box:fill-box;"
            "transform-origin:center}.chorus-light:nth-child(3n+2){fill:var(--hot)}"
            ".chorus-light:nth-child(3n){fill:var(--gold)}"
            ".chorus-trail{fill:none;stroke:var(--blue);stroke-width:5;stroke-linecap:round;"
            "stroke-dasharray:9 15;opacity:.64}" ".chorus-seat-mark{fill:var(--paper);opacity:.42}"
            "svg[data-state='afterglow'] .chorus-core-disc{fill:var(--hot)}"
            "svg[data-state='afterglow'] .chorus-light{fill:var(--gold);stroke:var(--hot);opacity:.74}"
            "svg[data-state='afterglow'] .chorus-trail{stroke:var(--paper);opacity:.4}"
            "svg[data-state='afterglow'] .chorus-arc{stroke:var(--gold);opacity:.46}"
            "svg[data-media='native'] .chorus-core-disc,svg[data-media='native'] .chorus-core-cut{opacity:.2}"
        );
        defs.append("]]></style>");
        return defs.finish();
    }

    function _underlay(
        RendererPrimitives.EngineContext memory context,
        uint256 coreX,
        uint256 coreY,
        uint256 coreRadius
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(12_000);
        uint256 prosceniumInset = 46 + uint256(context.art.symmetry) * 42 / 100;

        buffer.append('<path class="chorus-proscenium" d="M');
        buffer.append(RendererPrimitives.decimal(prosceniumInset));
        buffer.append(" 122Q600 72 ");
        buffer.append(RendererPrimitives.decimal(1200 - prosceniumInset));
        buffer.append(" 122L1135 910Q600 970 65 910Z\"/>");

        buffer.append('<g class="chorus-auditorium" aria-hidden="true">');
        for (uint256 index; index < _ARC_COUNT; ++index) {
            uint256 edgeY = coreY + 190 + index * 126;
            if (edgeY > 900) edgeY = 900;
            uint256 controlY = coreY + 55 + index * 39;
            buffer.append('<path class="chorus-arc" d="M64 ');
            buffer.append(RendererPrimitives.decimal(edgeY));
            buffer.append(" Q");
            buffer.append(RendererPrimitives.decimal(coreX));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(controlY));
            buffer.append(" 1136 ");
            buffer.append(RendererPrimitives.decimal(edgeY));
            buffer.append('"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="chorus-core-generated" aria-hidden="true">');
        buffer.append('<ellipse class="chorus-halo" cx="');
        buffer.append(RendererPrimitives.decimal(coreX));
        buffer.append('" cy="');
        buffer.append(RendererPrimitives.decimal(coreY));
        buffer.append('" rx="');
        buffer.append(RendererPrimitives.decimal(coreRadius + 48));
        buffer.append('" ry="');
        buffer.append(RendererPrimitives.decimal(coreRadius * 9 / 10 + 48));
        buffer.append('"/><ellipse class="chorus-core-disc" cx="');
        buffer.append(RendererPrimitives.decimal(coreX));
        buffer.append('" cy="');
        buffer.append(RendererPrimitives.decimal(coreY));
        buffer.append('" rx="');
        buffer.append(RendererPrimitives.decimal(coreRadius));
        buffer.append('" ry="');
        buffer.append(RendererPrimitives.decimal(coreRadius * 9 / 10));
        buffer.append('"/><path class="chorus-core-cut" d="M');
        buffer.append(RendererPrimitives.decimal(coreX - coreRadius));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(coreY + 18));
        buffer.append("Q");
        buffer.append(RendererPrimitives.decimal(coreX));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(coreY - coreRadius / 2));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(coreX + coreRadius));
        buffer.append(" ");
        buffer.append(RendererPrimitives.decimal(coreY + 18));
        buffer.append("V");
        buffer.append(RendererPrimitives.decimal(coreY + coreRadius));
        buffer.append("H");
        buffer.append(RendererPrimitives.decimal(coreX - coreRadius));
        buffer.append('Z"/></g>');

        return buffer.finish();
    }

    function _overlay(
        RendererPrimitives.EngineContext memory context,
        uint256 coreX,
        uint256 coreY,
        uint256 coreRadius,
        uint256 voiceCount
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory buffer = RendererPrimitives.init(18_000);
        uint256 trailCount = 3 + uint256(context.art.tertiary) * 5 / 100;

        buffer.append('<g class="chorus-trails" aria-hidden="true">');
        for (uint256 index; index < trailCount; ++index) {
            uint256 voiceIndex = index * voiceCount / trailCount;
            (uint256 x, uint256 y,) = _voice(context, voiceIndex, voiceCount);
            buffer.append('<path class="chorus-trail" d="M');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append(" Q");
            buffer.append(RendererPrimitives.decimal((x + coreX) / 2));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal((y + coreY) / 2 - 38));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(coreX));
            buffer.append(" ");
            buffer.append(RendererPrimitives.decimal(coreY));
            buffer.append('"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="chorus-voices" aria-hidden="true">');
        for (uint256 index; index < voiceCount; ++index) {
            (uint256 x, uint256 y, uint256 radius) = _voice(context, index, voiceCount);
            buffer.append('<circle class="chorus-light" cx="');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append('" cy="');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append('" r="');
            buffer.append(RendererPrimitives.decimal(radius));
            buffer.append('"/>');
        }
        buffer.append("</g>");

        buffer.append('<g class="chorus-core-rings" aria-hidden="true">');
        buffer.append('<ellipse class="chorus-core-ring" cx="');
        buffer.append(RendererPrimitives.decimal(coreX));
        buffer.append('" cy="');
        buffer.append(RendererPrimitives.decimal(coreY));
        buffer.append('" rx="');
        buffer.append(RendererPrimitives.decimal(coreRadius + 16));
        buffer.append('" ry="');
        buffer.append(RendererPrimitives.decimal(coreRadius * 9 / 10 + 16));
        buffer.append('"/><ellipse class="chorus-core-ring" cx="');
        buffer.append(RendererPrimitives.decimal(coreX));
        buffer.append('" cy="');
        buffer.append(RendererPrimitives.decimal(coreY));
        buffer.append('" rx="');
        buffer.append(RendererPrimitives.decimal(coreRadius - 28));
        buffer.append('" ry="');
        buffer.append(RendererPrimitives.decimal(coreRadius * 9 / 10 - 28));
        buffer.append('" stroke-dasharray="16 18"/></g>');

        uint256 markCount = 5 + uint256(context.art.density) * 5 / 100;
        buffer.append('<g class="chorus-seat-marks" aria-hidden="true">');
        for (uint256 index; index < markCount; ++index) {
            uint256 random = RendererPrimitives.lane(context.seed, 260 + index);
            uint256 x = 104 + index * 990 / markCount + random % 23;
            uint256 y = 905 + (random >> 8) % 42;
            buffer.append('<rect class="chorus-seat-mark" x="');
            buffer.append(RendererPrimitives.decimal(x));
            buffer.append('" y="');
            buffer.append(RendererPrimitives.decimal(y));
            buffer.append('" width="');
            buffer.append(RendererPrimitives.decimal(36 + (random >> 16) % 72));
            buffer.append('" height="7" rx="3"/>');
        }
        buffer.append("</g>");
        return buffer.finish();
    }

    function _core(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256 x, uint256 y, uint256 radius)
    {
        uint256 random = RendererPrimitives.lane(context.seed, 200);
        x = 450 + random % 201;
        y = 410 + (random >> 8) % 101;
        radius = 145 + uint256(context.art.secondary) * 60 / 100;
    }

    function _voiceCount(RendererPrimitives.EngineContext memory context)
        private
        pure
        returns (uint256)
    {
        return 8 + uint256(context.art.primary) * 8 / 100 + uint256(context.art.density) * 8 / 100;
    }

    function _voice(RendererPrimitives.EngineContext memory context, uint256 index, uint256 count)
        private
        pure
        returns (uint256 x, uint256 y, uint256 radius)
    {
        uint256 random = RendererPrimitives.lane(context.seed, 220 + index);
        x = 92 + index * 1016 / (count - 1);
        uint256 band = (index + (random >> 24) % _ARC_COUNT) % _ARC_COUNT;
        uint256 coreX = 450 + RendererPrimitives.lane(context.seed, 200) % 201;
        uint256 coreY = 410 + (RendererPrimitives.lane(context.seed, 200) >> 8) % 101;
        uint256 distance = x > coreX ? x - coreX : coreX - x;
        y = coreY + 164 + band * 91 + distance * distance / 2600 + (random >> 8) % 19;
        if (y > 900) y = 900;
        radius = 10 + (random >> 16) % 15 + uint256(context.art.intensity) * 5 / 100;
    }
}
