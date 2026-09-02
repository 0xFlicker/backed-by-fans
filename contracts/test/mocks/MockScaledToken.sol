// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {
    ERC8056InterfaceIds,
    IScaledUIAmount,
    IScaledUIAmountNewUIMultiplier
} from "../../src/interfaces/IERC8056.sol";

contract MockScaledToken is ERC20, IERC165, IScaledUIAmount, IScaledUIAmountNewUIMultiplier {
    uint256 private _uiMultiplier = 1e18;
    uint256 private _newUIMultiplier = 1e18;
    uint256 private _effectiveAt;

    error InvalidMultiplier();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == ERC8056InterfaceIds.SCALED_UI_AMOUNT
            || interfaceId == ERC8056InterfaceIds.PENDING_UI_MULTIPLIER;
    }

    function uiMultiplier() public view override returns (uint256) {
        return
            _effectiveAt != 0 && block.timestamp >= _effectiveAt ? _newUIMultiplier : _uiMultiplier; // forge-lint: disable-line(block-timestamp)
    }

    function newUIMultiplier() external view override returns (uint256) {
        return _newUIMultiplier;
    }

    function effectiveAt() external view override returns (uint256) {
        return _effectiveAt;
    }

    function setUIMultiplier(uint256 multiplier, uint256 effectiveAtTimestamp) external {
        if (multiplier == 0) revert InvalidMultiplier();
        _checkpointMultiplier();

        uint256 oldMultiplier = _uiMultiplier;
        _newUIMultiplier = multiplier;
        _effectiveAt = effectiveAtTimestamp;
        // forge-lint: disable-next-line(block-timestamp)
        if (effectiveAtTimestamp == 0 || effectiveAtTimestamp <= block.timestamp) {
            _uiMultiplier = multiplier;
            _effectiveAt = 0;
        }
        emit UIMultiplierUpdated(oldMultiplier, multiplier, effectiveAtTimestamp);
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function _checkpointMultiplier() private {
        // forge-lint: disable-next-line(block-timestamp)
        if (_effectiveAt != 0 && block.timestamp >= _effectiveAt) {
            _uiMultiplier = _newUIMultiplier;
            _effectiveAt = 0;
        }
    }
}
