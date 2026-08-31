// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Immutable renderer implementation admitted by the membership factory.
interface IMembershipRenderer {
    function rendererSchema() external pure returns (bytes32);

    function rendererName() external pure returns (string memory);

    function engineCount() external pure returns (uint16);

    function engineName(uint16 engine) external pure returns (string memory);

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata media
    ) external view;

    function previewSVG(MembershipTypes.PreviewContext calldata context)
        external
        view
        returns (string memory rawSVG);

    function previewTokenURI(MembershipTypes.PreviewContext calldata context)
        external
        view
        returns (string memory tokenURI);

    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external
        view
        returns (string memory tokenURI);
}
