// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RendererPrimitives} from "../RendererPrimitives.sol";

/// @notice Recursive radial growth rendered as stage-light petals and luminous rings.
library BloomEngine {
    using RendererPrimitives for RendererPrimitives.Buffer;

    function render(RendererPrimitives.EngineContext memory context)
        internal
        pure
        returns (RendererPrimitives.EngineOutput memory output)
    {
        uint256 petals = 6 + uint256(context.art.primary) * 12 / 100;
        uint256 phase = RendererPrimitives.lane(context.seed, 500) % 30
            + uint256(context.art.secondary) * 24 / 100;
        uint256 petalLength = 250 + uint256(context.art.tertiary) * 150 / 100;
        output.defs = _defs(context, petals, phase, petalLength);
        output.underlay = _underlay(context, petals, phase, petalLength);
        output.overlay = _overlay(context, petals, phase);
    }

    function _defs(
        RendererPrimitives.EngineContext memory context,
        uint256 petals,
        uint256 phase,
        uint256 petalLength
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory defs = RendererPrimitives.init(10_000);
        defs.append(
            "<style><![CDATA[.bloom-halo{fill:none;stroke:var(--paper);stroke-width:6;opacity:.62}"
            ".bloom-petal{stroke:var(--bg);stroke-width:8}.bloom-petal:nth-child(4n+1){fill:var(--hot)}"
            ".bloom-petal:nth-child(4n+2){fill:var(--gold)}.bloom-petal:nth-child(4n+3){fill:var(--blue)}"
            ".bloom-petal:nth-child(4n){fill:var(--paper)}.bloom-core{fill:var(--bg);stroke:var(--paper);stroke-width:10}"
            ".bloom-ray{stroke:var(--paper);stroke-width:5;stroke-dasharray:14 16}"
            ".bloom-orbit{transform-box:fill-box;transform-origin:center}"
            "svg[data-state='afterglow'] .bloom-petal{opacity:.76;stroke:var(--gold)}"
            "svg[data-state='afterglow'] .bloom-core{fill:var(--hot)}"
            "svg[data-media='native'] .bloom-generated{opacity:.18}]]></style>"
            '<clipPath id="engine-media-clip"><circle cx="600" cy="492" r="178"/>'
        );
        for (uint256 index; index < petals; index += 3) {
            defs.append('<path transform="rotate(');
            defs.append(RendererPrimitives.decimal(phase + index * 360 / petals));
            defs.append(' 600 492)" d="');
            defs.append(_petalData(context.seed, index, petalLength));
            defs.append('"/>');
        }
        defs.append("</clipPath>");
        return defs.finish();
    }

    function _underlay(
        RendererPrimitives.EngineContext memory context,
        uint256 petals,
        uint256 phase,
        uint256 petalLength
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(13_000);
        layer.append(
            '<g class="bloom-halos"><circle class="bloom-halo" cx="600" cy="492" r="390"/>'
            '<circle class="bloom-halo" cx="600" cy="492" r="322"/>'
            '<circle class="bloom-halo" cx="600" cy="492" r="250"/></g>'
            '<g class="bloom-petals" transform-origin="600px 492px">'
        );
        for (uint256 index; index < petals; ++index) {
            layer.append('<path class="bloom-petal" transform="rotate(');
            layer.append(RendererPrimitives.decimal(phase + index * 360 / petals));
            layer.append(' 600 492)" d="');
            layer.append(_petalData(context.seed, index, petalLength));
            layer.append('"/>');
        }
        layer.append("</g>");
        return layer.finish();
    }

    function _overlay(
        RendererPrimitives.EngineContext memory context,
        uint256 petals,
        uint256 phase
    ) private pure returns (string memory) {
        RendererPrimitives.Buffer memory layer = RendererPrimitives.init(8000);
        layer.append(
            '<g class="bloom-overlay"><g class="bloom-generated"><circle class="bloom-core" cx="600" cy="492" r="178"/>'
            '<circle class="bloom-halo" cx="600" cy="492" r="126"/>'
            '<circle class="bloom-halo" cx="600" cy="492" r="74"/></g>' '<g class="bloom-orbit">'
        );
        uint256 rays = 6 + uint256(context.art.density) * 8 / 100;
        for (uint256 index; index < rays; ++index) {
            uint256 angle = phase + index * 360 / rays;
            layer.append('<path class="bloom-ray" transform="rotate(');
            layer.append(RendererPrimitives.decimal(angle));
            layer.append(' 600 492)" d="M600 86V148"/>');
        }
        layer.append("</g><!-- petals:");
        layer.append(RendererPrimitives.decimal(petals));
        layer.append(" --></g>");
        return layer.finish();
    }

    function _petalData(bytes32 seed, uint256 index, uint256 length)
        private
        pure
        returns (string memory)
    {
        uint256 random = RendererPrimitives.lane(seed, 520 + index);
        uint256 halfWidth = 58 + random % 58;
        uint256 tipY = 492 - length - (random >> 8) % 35;
        uint256 shoulderY = 492 - length * 55 / 100;
        return string.concat(
            "M600 492C",
            RendererPrimitives.decimal(600 - halfWidth),
            " ",
            RendererPrimitives.decimal(shoulderY),
            " ",
            RendererPrimitives.decimal(600 - halfWidth / 2),
            " ",
            RendererPrimitives.decimal(tipY),
            " 600 ",
            RendererPrimitives.decimal(tipY),
            "C",
            RendererPrimitives.decimal(600 + halfWidth / 2),
            " ",
            RendererPrimitives.decimal(tipY),
            " ",
            RendererPrimitives.decimal(600 + halfWidth),
            " ",
            RendererPrimitives.decimal(shoulderY),
            " 600 492Z"
        );
    }
}
