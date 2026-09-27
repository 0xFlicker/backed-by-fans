// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One campaign of ETH and paid one-period membership gifts.
/// @dev The operator supplies eligible recipients from an offchain holder snapshot.
/// Each batch is atomic. Completion survives spending ETH or transferring the NFT.
contract HolderAirdrop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BATCH = 25;
    uint256 public constant ACCOUNTING_STEPS = 256;
    address public immutable operator;
    IMembershipTier public immutable tier;
    IERC20 public immutable paymentToken;
    uint256 public immutable pricePerPeriod;
    uint64 public immutable periodDuration;
    uint256 public immutable ethAmount;

    mapping(address recipient => bool completed) public ethCompleted;
    mapping(address recipient => bool completed) public membershipCompleted;

    error OperatorOnly();
    error InvalidConfiguration();
    error InvalidBatch();
    error InvalidRecipient(address recipient);
    error TierTermsChanged();
    error ETHTransferFailed(address recipient);
    error UnexpectedTokenTransfer();

    event ETHDelivered(address indexed recipient, uint256 amount);
    event MembershipDelivered(address indexed recipient, uint256 indexed tokenId, uint256 amount);
    event CompletionImported(address indexed recipient, bool eth, bool membership);
    event Funded(uint256 eth, uint256 paymentTokens);

    modifier onlyOperator() {
        if (msg.sender != operator) revert OperatorOnly();
        _;
    }

    constructor(
        address operator_,
        IMembershipTier tier_,
        uint256 expectedPrice,
        uint64 expectedDuration,
        uint256 ethAmount_
    ) {
        if (
            operator_ == address(0) || address(tier_).code.length == 0 || expectedPrice == 0
                || expectedDuration == 0 || ethAmount_ == 0
        ) revert InvalidConfiguration();
        IERC20 token = tier_.paymentToken();
        if (
            address(token).code.length == 0 || tier_.pricePerPeriod() != expectedPrice
                || tier_.periodDuration() != expectedDuration
        ) revert InvalidConfiguration();
        operator = operator_;
        tier = tier_;
        paymentToken = token;
        pricePerPeriod = expectedPrice;
        periodDuration = expectedDuration;
        ethAmount = ethAmount_;
    }

    /// @notice Approve this helper from the operator wallet, then fund it in one call.
    function fund(uint256 tokenAmount) external payable onlyOperator nonReentrant {
        if (tokenAmount != 0) {
            uint256 beforeBalance = paymentToken.balanceOf(address(this));
            paymentToken.safeTransferFrom(operator, address(this), tokenAmount);
            if (paymentToken.balanceOf(address(this)) != beforeBalance + tokenAmount) {
                revert UnexpectedTokenTransfer();
            }
        }
        emit Funded(msg.value, tokenAmount);
    }

    /// @notice Import verified deliveries made before this helper was deployed.
    /// @dev Operator attests to these records; this does not verify historical receipts.
    function recordCompleted(address[] calldata recipients, bool eth, bool membership)
        external
        onlyOperator
        nonReentrant
    {
        _validateBatch(recipients.length);
        if (!eth && !membership) revert InvalidBatch();
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            _validateRecipient(recipient);
            if (eth) ethCompleted[recipient] = true;
            if (membership) membershipCompleted[recipient] = true;
            emit CompletionImported(recipient, eth, membership);
        }
    }

    /// @notice Repeating any subset is safe; any failure reverts the whole batch.
    function distribute(address[] calldata recipients) external onlyOperator nonReentrant {
        _validateBatch(recipients.length);
        if (
            address(tier.paymentToken()) != address(paymentToken)
                || tier.pricePerPeriod() != pricePerPeriod
                || tier.periodDuration() != periodDuration
        ) revert TierTermsChanged();
        // Upper bound for this call only. Clear even unused allowance at the end.
        paymentToken.forceApprove(address(tier), recipients.length * pricePerPeriod);
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            _validateRecipient(recipient);
            if (!ethCompleted[recipient] && recipient.balance < ethAmount) {
                ethCompleted[recipient] = true;
                (bool success,) = recipient.call{value: ethAmount}("");
                if (!success) revert ETHTransferFailed(recipient);
                emit ETHDelivered(recipient, ethAmount);
            }
            if (!membershipCompleted[recipient] && tier.balanceOf(recipient) == 0) {
                membershipCompleted[recipient] = true;
                uint256 tokenId = tier.giftMembership(recipient, 1, ACCOUNTING_STEPS);
                emit MembershipDelivered(recipient, tokenId, pricePerPeriod);
            }
        }
        paymentToken.forceApprove(address(tier), 0);
    }

    /// @notice Return unused campaign funds to the operator, including mistaken ERC20 transfers.
    function withdraw(IERC20 token, uint256 tokenAmount, uint256 nativeAmount)
        external
        onlyOperator
        nonReentrant
    {
        if (tokenAmount != 0) token.safeTransfer(operator, tokenAmount);
        if (nativeAmount != 0) {
            (bool success,) = operator.call{value: nativeAmount}("");
            if (!success) revert ETHTransferFailed(operator);
        }
    }

    function _validateBatch(uint256 length) private pure {
        if (length == 0 || length > MAX_BATCH) revert InvalidBatch();
    }

    function _validateRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidRecipient(recipient);
        }
    }
}
