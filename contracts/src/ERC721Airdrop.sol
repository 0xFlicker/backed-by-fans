// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Noncustodial, atomic ERC721 gifts from the caller's own wallet.
/// @dev No admin, fees, deposits, or ability to transfer another caller's NFTs.
contract ERC721Airdrop {
    uint256 public constant MAX_BATCH_SIZE = 200;

    error InvalidBatch();
    error InvalidCollection();
    error InvalidRecipient(uint256 index);

    event Airdropped(
        address indexed sender,
        address indexed collection,
        bytes32 indexed distributionHash,
        uint256 count
    );

    function airdropERC721(
        IERC721 collection,
        address[] calldata recipients,
        uint256[] calldata tokenIds
    ) external {
        uint256 count = recipients.length;
        if (count == 0 || count > MAX_BATCH_SIZE || count != tokenIds.length) {
            revert InvalidBatch();
        }
        if (
            address(collection).code.length == 0
                || !collection.supportsInterface(type(IERC721).interfaceId)
        ) revert InvalidCollection();

        for (uint256 i; i < count; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || recipient == msg.sender || recipient == address(this)) {
                revert InvalidRecipient(i);
            }
            collection.safeTransferFrom(msg.sender, recipient, tokenIds[i]);
        }
        emit Airdropped(
            msg.sender, address(collection), keccak256(abi.encode(recipients, tokenIds)), count
        );
    }
}
