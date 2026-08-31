// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice Repeated registration arches and silhouettes with media-forward negative space.
library AfterimageEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        uint256 echoes = 3 + uint256(context.art.primary) * 5 / 100;
        uint256 drift = 34 + uint256(context.art.secondary) * 56 / 100;
        uint256 archWidth = 360 + uint256(context.art.tertiary) * 250 / 100;

        output.defs = _defs(context, echoes, drift, archWidth);
        output.underlay = _underlay(context, echoes, drift, archWidth);
        output.overlay = _overlay(context, echoes, drift, archWidth);
    }

    function _defs(
        RendererPrimitives.EngineContext memory context,
        uint256 echoes,
        uint256 drift,
        uint256 archWidth
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory defs = RendererPrimitives.init(9000);
        defs.append(
            "<style><![CDATA[.after-echo{stroke:var(--bg);stroke-width:12}"
            ".after-fill-0{fill:var(--blue)}.after-fill-1{fill:var(--hot)}"
            ".after-fill-2{fill:var(--gold)}.after-fill-3{fill:var(--paper)}"
            ".after-outline{fill:none;stroke:var(--paper);stroke-width:7}"
            ".after-cut{fill:var(--bg)}.after-scan{fill:none;stroke:var(--paper);stroke-width:5;stroke-dasharray:32 20}"
            "svg[data-state='afterglow'] .after-echo{opacity:.82}"
            "svg[data-state='afterglow'] .after-outline{stroke:var(--gold);stroke-width:10}"
            "svg[data-media='native'] .after-generated{opacity:.2}]]></style>"
            '<clipPath id="engine-media-clip">'
        );
        for (uint256 index; index < echoes; ++index) {
            if (index % 2 != 0) continue;
            defs.append(_arch(context.seed, index, drift, archWidth));
        }
        defs.append("</clipPath>");
        return defs.finish();
    }

    function _underlay(
        RendererPrimitives.EngineContext memory context,
        uint256 echoes,
        uint256 drift,
        uint256 archWidth
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(10_000);
        layer.append('<g class="after-field">');
        for (uint256 index; index < echoes; ++index) {
            layer.append('<path class="after-echo after-fill-');
            layer.append(RendererPrimitives.decimal(index % 4));
            layer.append('" d="');
            layer.append(_archData(context.seed, index, drift, archWidth));
            layer.append('"/>');
        }
        layer.append("</g>");
        return layer.finish();
    }

    function _overlay(
        RendererPrimitives.EngineContext memory context,
        uint256 echoes,
        uint256 drift,
        uint256 archWidth
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(10_000);
        layer.append('<g class="after-generated">');
        for (uint256 index; index < echoes; ++index) {
            layer.append('<path class="after-outline" d="');
            layer.append(_archData(context.seed, index, drift, archWidth));
            layer.append('"/>');
        }
        layer.append(
            '<path class="after-cut" d="M80 720L1120 430V540L80 830Z"/>'
            '<path class="after-cut" d="M160 880L1080 630V700L160 950Z"/>'
            '<path class="after-scan" d="M100 760L1100 485M130 900L1070 655"/>'
            '<circle class="after-outline" cx="935" cy="226" r="92"/>'
            '<circle class="after-outline" cx="935" cy="226" r="63"/>' "</g>"
        );
        return layer.finish();
    }

    function _arch(bytes32 seed, uint256 index, uint256 drift, uint256 archWidth)
        private
        pure
        returns (string memory)
    {
        return string.concat('<path d="', _archData(seed, index, drift, archWidth), '"/>');
    }

    function _archData(bytes32 seed, uint256 index, uint256 drift, uint256 archWidth)
        private
        pure
        returns (string memory)
    {
        uint256 random = RendererPrimitives.lane(seed, 400 + index);
        uint256 x = 58 + index * drift + random % 67;
        uint256 y = 128 + index * 38 + (random >> 8) % 71;
        uint256 width = archWidth - index * 28 + (random >> 24) % 51;
        uint256 radius = 90 + (random >> 16) % 110;
        uint256 maximumRadius = width / 2 - 12;
        if (radius > maximumRadius) radius = maximumRadius;
        uint256 right = x + width;
        uint256 shoulder = y + radius;
        return string.concat(
            "M",
            RendererPrimitives.decimal(x),
            " 875V",
            RendererPrimitives.decimal(shoulder),
            "Q",
            RendererPrimitives.decimal(x),
            " ",
            RendererPrimitives.decimal(y),
            " ",
            RendererPrimitives.decimal(x + radius),
            " ",
            RendererPrimitives.decimal(y),
            "H",
            RendererPrimitives.decimal(right - radius),
            "Q",
            RendererPrimitives.decimal(right),
            " ",
            RendererPrimitives.decimal(y),
            " ",
            RendererPrimitives.decimal(right),
            " ",
            RendererPrimitives.decimal(shoulder),
            "V875Z"
        );
    }
}
