// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @notice Permissionless bounded accounting, earned-fund release and buybacks.
/// @dev No funds, approvals, administrator, arbitrary user calldata or worker entitlements.
/// @dev Uses the existing Cancun target's transient guard: the lock is reset
/// after each call, with no persistent storage write or weaker callback protection.
contract ProtocolBurnRouter is ReentrancyGuardTransient {
    struct AdvanceTier {
        address tier;
        uint256 maxAccountingSteps;
    }

    struct Purchase {
        address asset;
        uint64 revision;
    }
    address public immutable factory;
    IProtocolBuybackVault public immutable vault;
    mapping(address asset => BuybackTypes.SourceBucket) public nextSource;

    uint256 public constant MAX_TIERS = 8;
    uint256 public constant MAX_PURCHASES = 32;
    uint256 public constant MAX_ACCOUNTING_STEPS = 25;
    error InvalidBatch();
    error UnregisteredTier();
    error DeadlineExpired();
    error NothingToDo();
    error InvalidAccountingResult();
    error InvalidBurnMeasurement();
    error StaleRevision();

    event AccountingAdvanced(
        address indexed caller,
        address indexed tier,
        uint256 processedSteps,
        uint64 accountedThrough,
        bool complete,
        uint256 earnedScaledDelta
    );
    event TierReleased(
        address indexed caller, address indexed tier, address indexed asset, uint256 amount
    );
    event PurchaseSkipped(
        address indexed asset, BuybackTypes.SourceBucket bucket, BuybackTypes.Status reason
    );
    event PurchaseCompleted(
        address indexed caller, address indexed asset, BuybackTypes.SourceBucket bucket
    );
    event AdvanceCompleted(
        address indexed caller,
        uint256 processedSteps,
        uint256 releasedTiers,
        uint256 purchases,
        uint256 burned,
        bool burnMeasured
    );

    constructor(address factory_, address vault_) {
        factory = factory_;
        vault = IProtocolBuybackVault(vault_);
    }

    /// @notice Atomically advance accounting, release earned fees and execute eligible buybacks.
    // forge-lint: disable-next-item(block-timestamp)
    function advance(AdvanceTier[] calldata tiers, Purchase[] calldata purchases, uint64 deadline)
        external
        nonReentrant
        returns (
            uint256 processedSteps,
            uint256 releasedTiers,
            uint256 purchaseCount,
            uint256 burned
        )
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _validate(tiers, purchases);
        bool useful;
        for (uint256 i; i < tiers.length; ++i) {
            if (tiers[i].maxAccountingSteps != 0) {
                (uint256 steps, bool earned) = _advanceTier(tiers[i]);
                processedSteps += steps;
                useful = useful || steps != 0 || earned;
            }
            if (_releaseTier(tiers[i].tier)) ++releasedTiers;
        }
        bool measured;
        if (purchases.length != 0) {
            (purchaseCount, burned, measured) = _buyback(purchases, deadline);
        }
        if (!useful && releasedTiers == 0 && purchaseCount == 0) revert NothingToDo();
        emit AdvanceCompleted(
            msg.sender, processedSteps, releasedTiers, purchaseCount, burned, measured
        );
    }

    /// @notice Settle accounting without transferring funds or touching trading contracts.
    function advanceAccounting(AdvanceTier[] calldata tiers)
        external
        nonReentrant
        returns (uint256 processedSteps)
    {
        _validateTiers(tiers);
        bool useful;
        for (uint256 i; i < tiers.length; ++i) {
            if (tiers[i].maxAccountingSteps == 0) continue;
            (uint256 steps, bool earned) = _advanceTier(tiers[i]);
            processedSteps += steps;
            useful = useful || steps != 0 || earned;
        }
        if (!useful) revert NothingToDo();
        emit AdvanceCompleted(msg.sender, processedSteps, 0, 0, 0, false);
    }

    /// @notice Buy and burn only inventory already released to the vault.
    // forge-lint: disable-next-item(block-timestamp)
    function buyback(Purchase[] calldata purchases, uint64 deadline)
        external
        nonReentrant
        returns (uint256 purchaseCount, uint256 burned)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _validatePurchases(purchases);
        bool measured;
        (purchaseCount, burned, measured) = _buyback(purchases, deadline);
        if (purchaseCount == 0) revert NothingToDo();
        emit AdvanceCompleted(msg.sender, 0, 0, purchaseCount, burned, measured);
    }

    function _validate(AdvanceTier[] calldata tiers, Purchase[] calldata purchases) private view {
        _validateTiers(tiers);
        _validatePurchases(purchases);
    }

    function _validateTiers(AdvanceTier[] calldata tiers) private view {
        if (tiers.length > MAX_TIERS) revert InvalidBatch();
        uint256 steps;
        for (uint256 i; i < tiers.length; ++i) {
            if (tiers[i].maxAccountingSteps > MAX_ACCOUNTING_STEPS) revert InvalidBatch();
            steps += tiers[i].maxAccountingSteps;
            if (!IMembershipFactory(factory).isRegisteredTier(tiers[i].tier)) {
                revert UnregisteredTier();
            }
            for (uint256 j; j < i; ++j) {
                if (tiers[j].tier == tiers[i].tier) revert InvalidBatch();
            }
        }
        if (steps > MAX_ACCOUNTING_STEPS) revert InvalidBatch();
    }

    function _validatePurchases(Purchase[] calldata purchases) private view {
        if (purchases.length > MAX_PURCHASES) revert InvalidBatch();
        for (uint256 i; i < purchases.length; ++i) {
            if (vault.canonicalAsset(purchases[i].asset) != purchases[i].asset) {
                revert InvalidBatch();
            }
            for (uint256 j; j < i; ++j) {
                if (purchases[j].asset == purchases[i].asset) revert InvalidBatch();
            }
        }
    }

    function _advanceTier(AdvanceTier calldata item) private returns (uint256 steps, bool earned) {
        MembershipTypes.MaintenanceResult memory result =
            IMembershipTier(item.tier).processAccounting(item.maxAccountingSteps);
        steps = result.processedSteps;
        if (steps > item.maxAccountingSteps) revert InvalidAccountingResult();
        emit AccountingAdvanced(
            msg.sender,
            item.tier,
            steps,
            result.accountedThrough,
            result.complete,
            result.earnedScaledDelta
        );
        earned = result.earnedScaledDelta != 0;
    }

    function _releaseTier(address tier) private returns (bool) {
        address asset = address(IMembershipTier(tier).paymentToken());
        uint256 amount = IMembershipTier(tier).releaseProtocolFees();
        emit TierReleased(msg.sender, tier, asset, amount);
        return amount != 0;
    }

    function _measure() private view returns (address token, uint256 supply) {
        token = vault.protocolToken();
        if (token != address(0)) supply = IERC20(token).totalSupply();
    }

    function _buyback(Purchase[] calldata purchases, uint64 deadline)
        private
        returns (uint256 count, uint256 burned, bool measured)
    {
        (address beforeToken, uint256 beforeSupply) = _measure();
        count = _purchaseBatch(purchases, deadline);
        (address afterToken, uint256 afterSupply) = _measure();
        if (beforeToken != afterToken || afterSupply > beforeSupply) {
            revert InvalidBurnMeasurement();
        }
        measured = beforeToken != address(0);
        burned = beforeSupply - afterSupply;
    }

    function _purchaseBatch(Purchase[] calldata purchases, uint64 deadline)
        private
        returns (uint256 count)
    {
        for (uint256 i; i < purchases.length; ++i) {
            Purchase calldata item = purchases[i];
            uint256 first = uint256(nextSource[item.asset]);
            for (uint256 b; b < 2; ++b) {
                BuybackTypes.SourceBucket bucket = BuybackTypes.SourceBucket((first + b) % 2);
                BuybackTypes.ProcessingState memory state =
                    vault.processingStatus(item.asset, bucket);
                if (state.revision != item.revision) revert StaleRevision();
                if (state.status != BuybackTypes.Status.Ready) {
                    emit PurchaseSkipped(item.asset, bucket, state.status);
                    continue;
                }
                vault.process(item.asset, bucket, state.maxInput, item.revision, deadline);
                ++count;
                nextSource[item.asset] = BuybackTypes.SourceBucket((uint256(bucket) + 1) % 2);
                emit PurchaseCompleted(msg.sender, item.asset, bucket);
            }
        }
    }
}
