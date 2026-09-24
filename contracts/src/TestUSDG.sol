// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only payment token with a caller-funded, per-address daily faucet.
contract TestUSDG is ERC20 {
    uint256 public constant CLAIM_AMOUNT = 100 * 10 ** 6;
    uint256 public constant COOLDOWN = 1 days;
    mapping(address => uint256) public nextClaimAt;

    error CooldownActive(uint256 availableAt);
    error UnsupportedChain(uint256 chainId);
    event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);

    constructor() ERC20("TestUSDG", "bUSD") {
        if (block.chainid != 46_630 && block.chainid != 31_337) {
            revert UnsupportedChain(block.chainid);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function claim() external {
        uint256 availableAt = nextClaimAt[msg.sender];
        // forge-lint: disable-next-item(block-timestamp)
        if (block.timestamp < availableAt) revert CooldownActive(availableAt);
        uint256 next = block.timestamp + COOLDOWN;
        nextClaimAt[msg.sender] = next;
        _mint(msg.sender, CLAIM_AMOUNT);
        emit Claimed(msg.sender, CLAIM_AMOUNT, next);
    }
}
