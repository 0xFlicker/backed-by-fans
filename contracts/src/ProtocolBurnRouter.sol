// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Permissionless, typed fee collection and burning in one transaction.
/// @dev Holds no protocol funds, approvals, administrator or arbitrary call facility.
contract ProtocolBurnRouter is ReentrancyGuard {
    struct Collection {
        address tier;
        uint256[] tokenIds;
    }

    struct Purchase {
        address asset;
        uint64 revision;
    }

    address public immutable factory;
    IProtocolBuybackVault public immutable vault;
    /// @notice First source to attempt for a canonical asset, rotated only after success.
    mapping(address asset => BuybackTypes.SourceBucket) public nextSource;

    error InvalidBatch();
    error OnlySelf();
    error UnregisteredTier();
    error DeadlineExpired();
    error NothingToDo();

    event CollectionFailed(address indexed tier, bytes reason);
    event PurchaseFailed(address indexed asset, BuybackTypes.SourceBucket bucket, bytes reason);
    event BurnCompleted(
        address indexed caller, uint256 releasedTiers, uint256 purchases, uint256 burned
    );

    constructor(address factory_, address vault_) {
        factory = factory_;
        vault = IProtocolBuybackVault(vault_);
    }

    /// @notice Collect selected earned fees and attempt one buy per currency/source.
    /// @dev Rechecks limits after release and after each purchase. No cooldown is bypassed.
    // forge-lint: disable-next-item(block-timestamp)
    function burn(Collection[] calldata collections, Purchase[] calldata purchases, uint64 deadline)
        external
        nonReentrant
        returns (uint256 releasedTiers, uint256 purchaseCount, uint256 burned)
    {
        if (block.timestamp > deadline) {
            revert DeadlineExpired();
        }
        if (collections.length > 8 || purchases.length > 32) revert InvalidBatch();
        uint256 members;
        for (uint256 i; i < collections.length; ++i) {
            members += collections[i].tokenIds.length;
            if (!IMembershipFactory(factory).isRegisteredTier(collections[i].tier)) {
                revert UnregisteredTier();
            }
            for (uint256 j; j < i; ++j) {
                if (collections[j].tier == collections[i].tier) revert InvalidBatch();
            }
        }
        if (members > 100) revert InvalidBatch();
        for (uint256 i; i < purchases.length; ++i) {
            if (vault.canonicalAsset(purchases[i].asset) != purchases[i].asset) {
                revert InvalidBatch();
            }
            for (uint256 j; j < i; ++j) {
                if (purchases[j].asset == purchases[i].asset) revert InvalidBatch();
            }
        }
        for (uint256 i; i < collections.length; ++i) {
            // Isolate a failed currency's collection, including its accrual, from other work.
            try this.collect(collections[i]) returns (uint256 released) {
                if (released > 0) ++releasedTiers;
            } catch (bytes memory reason) {
                emit CollectionFailed(collections[i].tier, reason);
            }
        }
        IERC20 token = IERC20(vault.protocolToken());
        uint256 supplyBefore = token.totalSupply();
        purchaseCount = _purchaseBatch(purchases, deadline);
        burned = supplyBefore - token.totalSupply();
        if (releasedTiers == 0 && purchaseCount == 0) revert NothingToDo();
        emit BurnCompleted(msg.sender, releasedTiers, purchaseCount, burned);
    }

    function _purchaseBatch(Purchase[] calldata purchases, uint64 deadline)
        private
        returns (uint256 purchaseCount)
    {
        for (uint256 i; i < purchases.length; ++i) {
            // Snapshot the order so a successful attempt cannot repeat the same bucket.
            uint256 first = uint256(nextSource[purchases[i].asset]);
            for (uint256 b; b < 2; ++b) {
                BuybackTypes.SourceBucket bucket = BuybackTypes.SourceBucket((first + b) % 2);
                // Each attempt is isolated: stale settings, cooling currencies and venue
                // failures cannot roll back another currency's successful work.
                try this.purchase(purchases[i], bucket, deadline) returns (bool processed) {
                    if (processed) {
                        ++purchaseCount;
                        nextSource[purchases[i].asset] =
                            BuybackTypes.SourceBucket((uint256(bucket) + 1) % 2);
                    }
                } catch (bytes memory reason) {
                    emit PurchaseFailed(purchases[i].asset, bucket, reason);
                }
            }
        }
    }

    /// @dev Self-call boundary rolls back just this collection on token failure.
    function collect(Collection calldata collection) external returns (uint256) {
        if (msg.sender != address(this)) revert OnlySelf();
        IMembershipTier tier = IMembershipTier(collection.tier);
        if (collection.tokenIds.length > 0) tier.accrueProtocolFees(collection.tokenIds);
        return tier.releaseProtocolFees();
    }

    function purchase(Purchase calldata item, BuybackTypes.SourceBucket bucket, uint64 deadline)
        external
        returns (bool)
    {
        if (msg.sender != address(this)) revert OnlySelf();
        BuybackTypes.ProcessingState memory state = vault.processingStatus(item.asset, bucket);
        if (state.status != BuybackTypes.Status.Ready || state.revision != item.revision) {
            return false;
        }
        vault.process(item.asset, bucket, state.maxInput, item.revision, deadline);
        return true;
    }
}
