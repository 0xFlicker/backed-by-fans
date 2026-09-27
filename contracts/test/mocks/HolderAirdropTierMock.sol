// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @dev Disposable local fixture for the cast runner. Real tier integration is in HolderAirdrop.t.sol.
contract HolderAirdropTierMock is ERC721 {
    using SafeERC20 for IERC20;

    IERC20 public immutable paymentToken;
    uint256 public constant pricePerPeriod = 1000e6;
    uint64 public constant periodDuration = 30 days;
    uint256 public totalMinted;

    constructor(IERC20 token) ERC721("Runner fixture", "FIXTURE") {
        paymentToken = token;
    }

    function giftMembership(address recipient, uint64 periods, uint256) external returns (uint256) {
        require(periods == 1, "One period only");
        paymentToken.safeTransferFrom(msg.sender, address(this), pricePerPeriod);
        uint256 id = ++totalMinted;
        _safeMint(recipient, id);
        return id;
    }
}
