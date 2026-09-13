// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {VestingLedger} from "../../src/libraries/VestingLedger.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice One-lot test fixture: one wallet is the beneficiary of all four allocations.
/// @dev This is not a production tier or a production payout-authorization implementation.
contract VestingLedgerHarness {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    IERC20 public immutable token;
    address public immutable beneficiary;
    VestingLedger.State private _state;
    bool private _funded;

    constructor(IERC20 token_) {
        token = token_;
        beneficiary = msg.sender;
        VestingLedger.initialize(_state, block.timestamp.toUint64());
        VestingLedger.setWeight(_state, 1, 1, true);
    }

    function fund(uint256[4] memory amounts, uint64 duration) external {
        require(msg.sender == beneficiary && !_funded, "fixture already funded or unauthorized");
        uint256 gross;
        for (uint256 i; i < 4; i++) {
            gross += amounts[i];
        }
        token.safeTransferFrom(msg.sender, address(this), gross);
        VestingLedger.append(_state, 1, amounts, block.timestamp.toUint64(), duration, beneficiary);
        _funded = true;
    }

    function advance() public {
        VestingLedger.process(_state, block.timestamp.toUint64(), 25);
    }

    function advanceTo(uint64 through, uint256 steps) external {
        VestingLedger.advanceTo(_state, through, steps);
    }

    function retire(uint256 tokenId) external returns (uint256) {
        return VestingLedger.retireMember(_state, tokenId, beneficiary);
    }

    function retiredCredit() external view returns (uint256) {
        return _state.retiredCreditScaled[beneficiary];
    }

    function totalGross() external view returns (uint256) {
        return _state.totalGross;
    }

    function totalShares() external view returns (uint256) {
        return _state.totalShares;
    }

    function claimRetired() external returns (uint256 amount) {
        require(msg.sender == beneficiary, "unauthorized");
        amount = VestingLedger.takeRetired(_state, beneficiary);
        if (amount != 0) token.safeTransfer(beneficiary, amount);
    }

    function claim(uint256 purpose) external returns (uint256 amount) {
        require(msg.sender == beneficiary, "unauthorized");
        if (purpose == 1) amount = VestingLedger.takeMember(_state, 1);
        else if (purpose == 2) amount = VestingLedger.takeReferrer(_state, beneficiary);
        else amount = VestingLedger.takeEarned(_state, purpose, type(uint256).max);
        if (amount != 0) token.safeTransfer(beneficiary, amount);
    }

    function refund() external returns (uint256 amount) {
        require(msg.sender == beneficiary, "unauthorized");
        advance();
        (amount,,) = VestingLedger.cancelFunding(_state, 1);
        if (amount != 0) token.safeTransfer(beneficiary, amount);
    }

    function earned(uint256 purpose) external view returns (uint256) {
        return _state.earnedScaled[purpose];
    }

    function reserved(uint256 purpose) external view returns (uint256) {
        return _state.unearnedScaled[purpose];
    }

    function cancellationRounding(uint256 purpose) external view returns (uint256) {
        return _state.cancellationScaled[purpose];
    }

    /// @dev Deliberate violation of the public tier lifecycle, only for reserve safety tests.
    function injectEmptyEligibleVector() external {
        require(msg.sender == beneficiary, "unauthorized");
        VestingLedger.setWeight(_state, 1, 1, false);
    }

    function unassignedMemberFunding() external view returns (uint256) {
        return _state.unassigned;
    }
}
