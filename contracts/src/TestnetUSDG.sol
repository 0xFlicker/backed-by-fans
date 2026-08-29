// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {RobinhoodProtocolAuthority} from "./RobinhoodProtocolAuthority.sol";

/// @notice Deployer-mintable USDG stand-in used only on Robinhood Chain Testnet.
contract TestnetUSDG is ERC20, Ownable {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    error UnauthorizedDeploymentOrigin(address origin);
    error UnsupportedChain(uint256 chainId);

    constructor() ERC20("LOL Dollar", "USDG") Ownable(RobinhoodProtocolAuthority.APPROVED_DEPLOYER) {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (tx.origin != RobinhoodProtocolAuthority.APPROVED_DEPLOYER) {
            revert UnauthorizedDeploymentOrigin(tx.origin);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }
}
