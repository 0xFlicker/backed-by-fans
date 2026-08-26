// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {MembershipTierDeployer} from "./MembershipTierDeployer.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Permissionless official-tier registry and fixed protocol-fee vault.
contract MembershipFactory is Ownable2Step, ReentrancyGuard, IMembershipFactory {
    using SafeERC20 for IERC20;

    uint16 public constant override protocolFeeBps = 100;
    uint256 public constant override maxPageSize = 100;
    uint16 private constant _BPS_DENOMINATOR = 10_000;

    IERC20 public immutable override paymentToken;
    address public immutable override renderer;
    address public immutable override deployer;

    address public override feeRecipient;

    address[] private _tiers;
    mapping(address tier => bool registered) public override isRegisteredTier;

    error CreatorMustBeCaller();
    error InexactTokenTransfer();
    error InvalidAddress();
    error InvalidContract();
    error InvalidPageSize();
    error InvalidPeriodDuration();
    error InvalidRateTotal();
    error OnlyFeeRecipient();
    error OwnershipRenunciationDisabled();

    constructor(
        IERC20 paymentToken_,
        address renderer_,
        address initialOwner,
        address initialFeeRecipient
    ) Ownable(initialOwner) {
        if (address(paymentToken_) == address(0) || renderer_ == address(0)) {
            revert InvalidAddress();
        }
        if (address(paymentToken_).code.length == 0 || renderer_.code.length == 0) {
            revert InvalidContract();
        }
        if (initialFeeRecipient == address(0) || initialFeeRecipient == address(this)) {
            revert InvalidAddress();
        }

        paymentToken = paymentToken_;
        renderer = renderer_;
        feeRecipient = initialFeeRecipient;
        deployer = address(new MembershipTierDeployer(address(this), renderer_));

        emit FeeRecipientUpdated(address(0), initialFeeRecipient);
    }

    /// @inheritdoc IMembershipFactory
    function createTier(MembershipTypes.TierConfig calldata config)
        external
        override
        returns (address tier)
    {
        if (config.creator == address(0)) revert InvalidAddress();
        if (config.creator != msg.sender) revert CreatorMustBeCaller();
        if (config.periodDuration == 0) revert InvalidPeriodDuration();
        if (uint256(config.rewardBps) + config.referralBps + protocolFeeBps > _BPS_DENOMINATOR) {
            revert InvalidRateTotal();
        }

        tier = MembershipTierDeployer(deployer).deploy(paymentToken, config);

        uint256 tierIndex = _tiers.length;
        _tiers.push(tier);
        isRegisteredTier[tier] = true;

        emit TierCreated(
            tier,
            config.creator,
            tierIndex,
            config.name,
            config.symbol,
            config.pricePerPeriod,
            config.periodDuration,
            config.rewardBps,
            config.referralBps,
            config.supplyCap,
            config.paidPrepaymentLimit
        );
    }

    /// @inheritdoc IMembershipFactory
    function tierCount() external view override returns (uint256) {
        return _tiers.length;
    }

    /// @inheritdoc IMembershipFactory
    function tiers(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        if (limit > maxPageSize) revert InvalidPageSize();
        uint256 length = _tiers.length;
        if (offset >= length || limit == 0) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;

        page = new address[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = _tiers[offset + i];
        }
    }

    /// @inheritdoc IMembershipFactory
    function setFeeRecipient(address newRecipient) external override onlyOwner {
        if (newRecipient == address(0) || newRecipient == address(this)) {
            revert InvalidAddress();
        }

        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    /// @inheritdoc IMembershipFactory
    function withdrawProtocolFees() external override nonReentrant returns (uint256 amount) {
        address recipient = feeRecipient;
        if (msg.sender != recipient) revert OnlyFeeRecipient();

        uint256 factoryBalanceBefore = paymentToken.balanceOf(address(this));
        if (factoryBalanceBefore == 0) return 0;
        uint256 recipientBalanceBefore = paymentToken.balanceOf(recipient);

        amount = factoryBalanceBefore;
        paymentToken.safeTransfer(recipient, amount);

        uint256 factoryBalanceAfter = paymentToken.balanceOf(address(this));
        uint256 recipientBalanceAfter = paymentToken.balanceOf(recipient);
        if (
            factoryBalanceAfter > factoryBalanceBefore
                || factoryBalanceBefore - factoryBalanceAfter != amount
                || recipientBalanceAfter < recipientBalanceBefore
                || recipientBalanceAfter - recipientBalanceBefore != amount
        ) {
            revert InexactTokenTransfer();
        }

        emit ProtocolFeesWithdrawn(recipient, amount);
    }

    /// @notice Starts a two-step transfer and rejects zero-address cancellation.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        super.transferOwnership(newOwner);
    }

    /// @notice Protocol ownership cannot be discarded because fee routing must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
