// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Stateless, one-way renderer for membership token metadata.
contract OnchainMetadataRenderer {
    using Strings for string;
    using Strings for uint256;

    /// @notice Builds a self-contained metadata URI without reading tier state.
    function renderTokenURI(MembershipTypes.TokenRenderData calldata data)
        external
        pure
        returns (string memory)
    {
        bytes memory json = abi.encodePacked(
            '{"name":"',
            data.tierName.escapeJSON(),
            " #",
            data.tokenId.toString(),
            '","description":"',
            data.description.escapeJSON(),
            '","image":"',
            data.imageURI.escapeJSON(),
            '","external_url":"',
            data.externalURI.escapeJSON(),
            '","attributes":[{"trait_type":"Active","value":"',
            data.active ? "Yes" : "No",
            '"},{"display_type":"date","trait_type":"Expiration","value":',
            uint256(data.expiration).toString(),
            "}]}"
        );

        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
