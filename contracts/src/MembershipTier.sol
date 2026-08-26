// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC5192} from "./interfaces/IERC5192.sol";
import {IERC5643} from "./interfaces/IERC5643.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Constructor-bound foundation for one independent creator membership tier.
/// @dev Membership lifecycle and payment behavior are added in later implementation units.
contract MembershipTier is ERC721, Ownable2Step, IMembershipTier {
    uint16 public constant override protocolFeeBps = 100;
    uint16 private constant _BPS_DENOMINATOR = 10_000;

    address public immutable override factory;
    IERC20 public immutable override paymentToken;
    address public immutable override renderer;
    uint256 public immutable override pricePerPeriod;
    uint64 public immutable override periodDuration;
    uint16 public immutable override rewardBps;
    uint16 public immutable override referralBps;

    uint64 public override supplyCap;
    uint64 public override paidPrepaymentLimit;

    error InvalidAddress();
    error InvalidPeriodDuration();
    error InvalidRateTotal();
    error LifecycleUnavailable();
    error OwnershipRenunciationDisabled();
    error Soulbound();

    constructor(
        address factory_,
        IERC20 paymentToken_,
        address renderer_,
        MembershipTypes.TierConfig memory config
    ) ERC721(config.name, config.symbol) Ownable(config.creator) {
        if (
            factory_ == address(0) || address(paymentToken_) == address(0)
                || renderer_ == address(0)
        ) {
            revert InvalidAddress();
        }
        if (config.periodDuration == 0) revert InvalidPeriodDuration();
        if (uint256(config.rewardBps) + config.referralBps + protocolFeeBps > _BPS_DENOMINATOR) {
            revert InvalidRateTotal();
        }

        factory = factory_;
        paymentToken = paymentToken_;
        renderer = renderer_;
        pricePerPeriod = config.pricePerPeriod;
        periodDuration = config.periodDuration;
        rewardBps = config.rewardBps;
        referralBps = config.referralBps;
        supplyCap = config.supplyCap;
        paidPrepaymentLimit = config.paidPrepaymentLimit;
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @inheritdoc IERC5643
    function renewSubscription(uint256, uint64) external payable override {
        revert LifecycleUnavailable();
    }

    /// @inheritdoc IERC5643
    function cancelSubscription(uint256) external payable override {
        revert LifecycleUnavailable();
    }

    /// @inheritdoc IERC5643
    function expiresAt(uint256 tokenId) external view override returns (uint64) {
        _requireOwned(tokenId);
        return 0;
    }

    /// @inheritdoc IERC5643
    function isRenewable(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return false;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC5192).interfaceId
            || interfaceId == type(IERC5643).interfaceId || interfaceId == 0x49064906
            || interfaceId == type(IMembershipTier).interfaceId
            || super.supportsInterface(interfaceId);
    }

    /// @dev Existing credentials cannot move or burn. A future mint still uses the ERC-721 path.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    /// @notice Starts a two-step transfer and rejects zero-address cancellation.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        super.transferOwnership(newOwner);
    }

    /// @notice Tier ownership cannot be discarded because creator controls must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
