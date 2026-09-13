// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {ImmutableCodeStore} from "./ImmutableCodeStore.sol";
import {IWrappedEther, PonsBuybackExecutor} from "./PonsBuybackExecutor.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IPonsBuybackExecutor} from "./interfaces/IPonsBuybackExecutor.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {IPonsBondingCurve, IPonsLauncherToken} from "./interfaces/external/IPons.sol";
import {BuybackIntegration} from "./libraries/BuybackIntegration.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @notice Dedicated fee custody with separate earned-membership and donation accounting.
/// @dev The factory creates this vault once. There is no owner, withdrawal, upgrade or generic call.
contract ProtocolBuybackVault is ReentrancyGuard, IProtocolBuybackVault {
    using SafeERC20 for IERC20;

    struct ProcessRequest {
        address asset;
        BuybackTypes.SourceBucket bucket;
        uint256 amountIn;
        uint64 deadline;
        uint256 sequence;
    }

    struct SettlementSnapshot {
        address[] assets;
        uint256[] expected;
        uint256 count;
        uint256 supply;
    }
    address public immutable override factory;
    address public override protocolToken;
    address public override executor;
    address public immutable executorCreationCodeStore;
    uint256 public immutable executorCreationCodeLength;
    bytes32 public immutable executorCreationCodeHash;
    uint256 public override settlementSequence;
    bool public override buybacksPaused = true;
    mapping(address asset => bool) private _assetBuybacksPaused;
    mapping(address asset => uint64) private _revision;
    mapping(address asset => bool) private _hasRoute;
    mapping(address asset => BuybackTypes.TypedRoute) private _routes;
    mapping(address asset => BuybackTypes.ExecutionLimits) private _limits;
    uint64 public override globalMinInterval;
    uint64 public override lastBuyAt;
    mapping(address asset => uint64) private _lastAssetBuyAt;

    mapping(
        address asset => mapping(BuybackTypes.SourceBucket bucket => BuybackTypes.Inventory)
    ) private _inventory;

    error ExecutorCreationCodeCorrupted();
    error ExecutorDeploymentFailed();
    error ProtocolTokenAlreadyBound();
    error ProtocolTokenNotLaunched();
    error InvalidAddress();
    error InvalidAsset();
    error OnlyFactoryDeployment();
    error OnlyRegisteredTier();
    error InsufficientBacking();
    error ZeroAmount();
    error OnlyProtocolAuthority();
    error InvalidRoute();
    error InvalidLimits();
    error ProcessingUnavailable(BuybackTypes.Status status);
    error StaleRevision();
    error InvalidAmount();
    error DeadlineExpired();
    error InexactSettlement();

    modifier onlyProtocolAuthority() {
        if (msg.sender != IMembershipFactory(factory).owner()) revert OnlyProtocolAuthority();
        _;
    }

    constructor(address factory_, address protocolToken_) {
        if (factory_ == address(0)) revert InvalidAddress();
        // The factory is still constructing, so checking its runtime length here is incorrect.
        if (msg.sender != factory_) revert OnlyFactoryDeployment();
        factory = factory_;
        bytes memory creationCode = type(PonsBuybackExecutor).creationCode;
        executorCreationCodeStore = address(new ImmutableCodeStore(creationCode));
        executorCreationCodeLength = creationCode.length;
        executorCreationCodeHash = keccak256(creationCode);
        if (protocolToken_ != address(0)) _bindProtocolToken(protocolToken_);
    }

    /// @inheritdoc IProtocolBuybackVault
    function bindProtocolToken(address token) external override nonReentrant {
        if (msg.sender != factory) revert OnlyFactoryDeployment();
        _bindProtocolToken(token);
    }

    function _bindProtocolToken(address token) private {
        if (protocolToken != address(0)) revert ProtocolTokenAlreadyBound();
        if (token == address(0)) revert InvalidAddress();
        if (token.code.length == 0) revert InvalidAsset();
        // Constructor validation must succeed before either binding becomes visible.
        address deployedExecutor = _deployExecutor(token);
        protocolToken = token;
        executor = deployedExecutor;
        emit ProtocolTokenBound(token, deployedExecutor);
    }

    /// @dev Keep creation code out of vault runtime, matching the tier deployer's code-store pattern.
    function _deployExecutor(address token) private returns (address deployed) {
        address store = executorCreationCodeStore;
        uint256 length = executorCreationCodeLength;
        bytes memory args = abi.encode(address(this), token);
        bytes memory initCode = new bytes(length + args.length);
        bytes32 reconstructedHash;
        assembly ("memory-safe") {
            let data := add(initCode, 0x20)
            extcodecopy(store, data, 1, length)
            reconstructedHash := keccak256(data, length)
            mcopy(add(data, length), add(args, 0x20), mload(args))
        }
        if (reconstructedHash != executorCreationCodeHash) revert ExecutorCreationCodeCorrupted();
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (deployed == address(0)) {
            assembly ("memory-safe") {
                if returndatasize() {
                    let pointer := mload(0x40)
                    returndatacopy(pointer, 0, returndatasize())
                    revert(pointer, returndatasize())
                }
            }
            revert ExecutorDeploymentFailed();
        }
    }

    receive() external payable {}

    // Cooldown eligibility intentionally follows the chain timestamp.
    // forge-lint: disable-next-item(block-timestamp)
    function processingStatus(address asset, BuybackTypes.SourceBucket bucket)
        public
        view
        override
        returns (BuybackTypes.ProcessingState memory state)
    {
        return _processingStatus(asset, bucket, 0);
    }

    function previewProcessing(address asset, BuybackTypes.SourceBucket bucket, uint256 additional)
        external
        view
        override
        returns (BuybackTypes.ProcessingState memory)
    {
        return _processingStatus(asset, bucket, additional);
    }

    // Eligibility uses the same clock and policy for preview and execution.
    // forge-lint: disable-next-item(block-timestamp)
    function _processingStatus(address asset, BuybackTypes.SourceBucket bucket, uint256 additional)
        private
        view
        returns (BuybackTypes.ProcessingState memory state)
    {
        asset = canonicalAsset(asset);
        state.available = _inventory[asset][bucket].available + additional;
        state.revision = asset == protocolToken ? 0 : _revision[asset];
        if (protocolToken == address(0)) {
            state.status = BuybackTypes.Status.TokenNotLaunched;
        } else if (buybacksPaused || _assetBuybacksPaused[asset]) {
            state.status = BuybackTypes.Status.Paused;
        } else if (state.available == 0) {
            state.status = BuybackTypes.Status.NoInventory;
        } else if (asset == protocolToken) {
            state.maxInput = state.available;
        } else if (!_hasRoute[asset]) {
            state.status = BuybackTypes.Status.NoRoute;
        } else {
            BuybackTypes.ExecutionLimits memory active = _limits[asset];
            state.minInput = active.minInput;
            state.maxInput = Math.min(state.available, active.maxInput);
            state.nextEligibleAt = Math.max(
                lastBuyAt == 0 ? 0 : uint256(lastBuyAt) + globalMinInterval,
                _lastAssetBuyAt[asset] == 0
                    ? 0
                    : uint256(_lastAssetBuyAt[asset]) + active.minInterval
            );
            if (active.maxInput == 0) {
                state.status = BuybackTypes.Status.NoLimits;
            } else if (state.available < active.minInput) {
                state.status = BuybackTypes.Status.BelowMinimum;
            } else if (block.timestamp < state.nextEligibleAt) {
                state.status = BuybackTypes.Status.Cooldown;
            } else {
                BuybackTypes.Lifecycle phase = IPonsBuybackExecutor(executor).lifecycle();
                if (phase == BuybackTypes.Lifecycle.GraduationPending) {
                    state.status = BuybackTypes.Status.GraduationPending;
                } else if (
                    phase == BuybackTypes.Lifecycle.Bonding
                        && IPonsBondingCurve(IPonsBuybackExecutor(executor).curve())
                                .currentSnipeTaxBps(executor) != 0
                ) {
                    state.status = BuybackTypes.Status.LaunchPenalty;
                }
            }
        }
    }

    // Caller deadlines intentionally follow the chain timestamp.
    // forge-lint: disable-next-item(block-timestamp)
    function process(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        uint64 expectedRevision,
        uint64 deadline
    ) external override nonReentrant {
        asset = canonicalAsset(asset);
        if (deadline < block.timestamp) revert DeadlineExpired();
        BuybackTypes.ProcessingState memory state = processingStatus(asset, bucket);
        if (state.revision != expectedRevision) revert StaleRevision();
        if (state.status != BuybackTypes.Status.Ready) revert ProcessingUnavailable(state.status);
        if (amountIn == 0 || amountIn < state.minInput || amountIn > state.maxInput) {
            revert InvalidAmount();
        }
        uint256 sequence = ++settlementSequence;
        if (asset == protocolToken) {
            _burn(bucket, amountIn);
            emit DirectBurned(sequence, bucket, asset, amountIn);
            return;
        }
        _processMarket(ProcessRequest(asset, bucket, amountIn, deadline, sequence));
    }

    // Only process() reaches this helper under nonReentrant. The executor is
    // created here once during token binding; no caller chooses its address.
    // Snapshots enforce exact settlement across the guarded external calls;
    // every other inventory/configuration writer shares the same reentrancy guard.
    // slither-disable-next-line arbitrary-send-eth,reentrancy-balance,reentrancy-eth
    function _processMarket(ProcessRequest memory request) private {
        BuybackTypes.TypedRoute memory configured = _routes[request.asset];
        SettlementSnapshot memory snapshot = _snapshotRoute(request.asset, configured);
        _inventory[request.asset][request.bucket].available -= request.amountIn;
        if (request.asset != address(0)) {
            uint256 beforeExecutor = IERC20(request.asset).balanceOf(executor);
            IERC20(request.asset).safeTransfer(executor, request.amountIn);
            if (
                _balance(request.asset) != snapshot.expected[0] - request.amountIn
                    || IERC20(request.asset).balanceOf(executor)
                        != beforeExecutor + request.amountIn
            ) revert InexactSettlement();
        }
        BuybackTypes.Execution memory execution = IPonsBuybackExecutor(executor)
        .execute{value: request.asset == address(0) ? request.amountIn : 0}(
            request.asset, request.amountIn, configured, request.deadline
        );
        if (
            execution.acquired == 0 || execution.legs.length == 0
                || execution.legs[0].input != request.asset
        ) revert InexactSettlement();
        _inventory[request.asset][request.bucket].available += request.amountIn;
        uint256 inputSpent = execution.legs[0].spent;
        if (inputSpent > request.amountIn) revert InexactSettlement();
        // A curve-filling purchase may spend less than the minimum once, because
        // it transitions out of bonding. Other partial fills cannot consume a
        // cooldown with dust while refunding most of the requested batch.
        if (
            inputSpent < _limits[request.asset].minInput
                && !(execution.lifecycle == BuybackTypes.Lifecycle.Bonding
                    && IPonsBuybackExecutor(executor).lifecycle()
                        == BuybackTypes.Lifecycle.GraduationPending)
        ) revert InvalidAmount();
        lastBuyAt = SafeCast.toUint64(block.timestamp);
        _lastAssetBuyAt[request.asset] = lastBuyAt;
        _bookLegs(
            request.bucket, execution.legs, snapshot, request.sequence, _revision[request.asset]
        );
        // External venues must not manufacture tokens or destroy unrelated supply.
        if (IERC20(protocolToken).totalSupply() != snapshot.supply) revert InexactSettlement();
        _burn(request.bucket, execution.acquired);
        for (uint256 i; i < snapshot.count; ++i) {
            if (snapshot.assets[i] == protocolToken) snapshot.expected[i] -= execution.acquired;
            if (
                _balance(snapshot.assets[i]) != snapshot.expected[i]
                    || _balance(snapshot.assets[i]) < _accounted(snapshot.assets[i])
            ) revert InexactSettlement();
        }
        emit BuybackBurned(
            request.sequence,
            request.bucket,
            request.asset,
            inputSpent,
            execution.acquired,
            execution.lifecycle,
            _revision[request.asset]
        );
    }

    function _bookLegs(
        BuybackTypes.SourceBucket bucket,
        BuybackTypes.Leg[] memory legs,
        SettlementSnapshot memory snapshot,
        uint256 sequence,
        uint64 activeRevision
    ) private {
        for (uint256 i; i < legs.length; ++i) {
            BuybackTypes.Leg memory leg = legs[i];
            address canonicalInput = canonicalAsset(leg.input);
            address canonicalOutput = canonicalAsset(leg.output);
            if (canonicalInput != canonicalOutput) {
                _inventory[canonicalInput][bucket].available -= leg.spent;
                _inventory[canonicalInput][bucket].totalSpent += leg.spent;
                _inventory[canonicalOutput][bucket].available += leg.received;
                _inventory[canonicalOutput][bucket].totalConvertedIn += leg.received;
            } else if (leg.spent != leg.received) {
                revert InexactSettlement();
            }
            for (uint256 j; j < snapshot.count; ++j) {
                if (snapshot.assets[j] == leg.input) snapshot.expected[j] -= leg.spent;
                if (snapshot.assets[j] == leg.output) snapshot.expected[j] += leg.received;
            }
            emit ConversionSettled(
                sequence, bucket, leg.input, leg.output, leg.spent, leg.received, activeRevision
            );
        }
    }

    // Called only inside nonReentrant process(). Both balance and supply deltas
    // must prove destruction; callbacks cannot start a second settlement.
    // slither-disable-next-line reentrancy-balance
    function _burn(BuybackTypes.SourceBucket bucket, uint256 amount) private {
        uint256 balance = _balance(protocolToken);
        if (balance < _accounted(protocolToken)) revert InsufficientBacking();
        uint256 supply = IERC20(protocolToken).totalSupply();
        _inventory[protocolToken][bucket].available -= amount;
        _inventory[protocolToken][bucket].totalSpent += amount;
        _inventory[protocolToken][bucket].totalBurned += amount;
        IPonsLauncherToken(protocolToken).burn(amount);
        if (
            _balance(protocolToken) != balance - amount
                || IERC20(protocolToken).totalSupply() != supply - amount
        ) revert InexactSettlement();
    }

    function _snapshotRoute(address asset, BuybackTypes.TypedRoute memory configured)
        private
        view
        returns (SettlementSnapshot memory snapshot)
    {
        snapshot.assets = new address[](configured.pools.length + 4);
        snapshot.expected = new uint256[](snapshot.assets.length);
        snapshot.count = _snapshot(snapshot.assets, snapshot.expected, 0, asset);
        for (uint256 i; i < configured.pools.length; ++i) {
            snapshot.count = _snapshot(
                snapshot.assets,
                snapshot.expected,
                snapshot.count,
                Currency.unwrap(configured.pools[i].currency0)
            );
            snapshot.count = _snapshot(
                snapshot.assets,
                snapshot.expected,
                snapshot.count,
                Currency.unwrap(configured.pools[i].currency1)
            );
        }
        snapshot.count = _snapshot(snapshot.assets, snapshot.expected, snapshot.count, address(0));
        snapshot.count =
            _snapshot(snapshot.assets, snapshot.expected, snapshot.count, protocolToken);
        snapshot.supply = IERC20(protocolToken).totalSupply();
    }

    function _snapshot(
        address[] memory assets,
        uint256[] memory balances,
        uint256 count,
        address asset
    ) private view returns (uint256) {
        for (uint256 i; i < count; ++i) {
            if (assets[i] == asset) return count;
        }
        assets[count] = asset;
        balances[count] = _balance(asset);
        if (balances[count] < _accounted(asset)) revert InsufficientBacking();
        return count + 1;
    }

    function canonicalAsset(address asset) public pure override returns (address) {
        return asset == BuybackIntegration.WETH ? address(0) : asset;
    }

    function revision(address asset) external view override returns (uint64) {
        return _revision[canonicalAsset(asset)];
    }

    function assetBuybacksPaused(address asset) external view override returns (bool) {
        return _assetBuybacksPaused[canonicalAsset(asset)];
    }

    function lastAssetBuyAt(address asset) external view override returns (uint64) {
        return _lastAssetBuyAt[canonicalAsset(asset)];
    }

    function route(address asset) external view override returns (BuybackTypes.TypedRoute memory) {
        return _routes[canonicalAsset(asset)];
    }

    function limits(address asset)
        external
        view
        override
        returns (BuybackTypes.ExecutionLimits memory)
    {
        return _limits[canonicalAsset(asset)];
    }

    function setRoute(address asset, BuybackTypes.TypedRoute calldata route_)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        asset = canonicalAsset(asset);
        _validateRoute(asset, route_);
        _routes[asset] = route_;
        _hasRoute[asset] = true;
        uint64 next = ++_revision[asset];
        emit RouteConfigured(asset, next, route_);
    }

    function setLimits(address asset, BuybackTypes.ExecutionLimits calldata limits_)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        _setLimits(asset, limits_);
    }

    function _setLimits(address asset, BuybackTypes.ExecutionLimits calldata limits_) private {
        asset = canonicalAsset(asset);
        if (!_hasRoute[asset] || limits_.minInput == 0 || limits_.maxInput < limits_.minInput) {
            revert InvalidLimits();
        }
        _limits[asset] = limits_;
        uint64 next = ++_revision[asset];
        emit LimitsConfigured(asset, next, limits_);
    }

    function setExecutionLimits(
        uint64 globalInterval,
        address[] calldata assets,
        BuybackTypes.ExecutionLimits[] calldata limits_
    ) external override onlyProtocolAuthority nonReentrant {
        if (assets.length != limits_.length) revert InvalidLimits();
        for (uint256 i; i < assets.length; ++i) {
            if (i != 0 && canonicalAsset(assets[i - 1]) >= canonicalAsset(assets[i])) {
                revert InvalidLimits();
            }
            _setLimits(assets[i], limits_[i]);
        }
        globalMinInterval = globalInterval;
        emit GlobalIntervalConfigured(globalInterval);
    }

    function setGlobalMinInterval(uint64 minInterval)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        globalMinInterval = minInterval;
        emit GlobalIntervalConfigured(minInterval);
    }

    function setBuybacksPaused(bool paused) external override onlyProtocolAuthority nonReentrant {
        buybacksPaused = paused;
        emit BuybacksPaused(paused);
    }

    function setAssetBuybacksPaused(address asset, bool paused)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        asset = canonicalAsset(asset);
        _assetBuybacksPaused[asset] = paused;
        emit AssetBuybacksPaused(asset, paused);
    }

    function _validateRoute(address asset, BuybackTypes.TypedRoute calldata route_) private view {
        if (protocolToken == address(0)) revert ProtocolTokenNotLaunched();
        uint256 count = route_.pools.length;
        if (asset == protocolToken || count > 2 || (asset != address(0) && asset.code.length == 0)) revert InvalidRoute();
        if (asset == address(0) || asset == BuybackIntegration.WETH) {
            if (count != 0) revert InvalidRoute();
            return;
        }
        if (
            count == 0
                || BuybackIntegration.POOL_MANAGER.codehash != BuybackIntegration.POOL_MANAGER_HASH
        ) revert InvalidRoute();
        address currency = asset;
        for (uint256 i; i < count; ++i) {
            PoolKey memory key = route_.pools[i];
            address currency0 = Currency.unwrap(key.currency0);
            address currency1 = Currency.unwrap(key.currency1);
            if (
                currency0 >= currency1 || key.fee > 1_000_000 || key.tickSpacing <= 0
                    || key.tickSpacing > 32_767 || address(key.hooks) != address(0)
                    || currency0 == protocolToken || currency1 == protocolToken
                    || (currency0 != currency && currency1 != currency)
            ) revert InvalidRoute();
            currency = currency == currency0 ? currency1 : currency0;
            if (
                currency == asset
                    || (i + 1 < count
                        && (currency == address(0) || currency == BuybackIntegration.WETH))
            ) revert InvalidRoute();
            if (currency != address(0) && currency.code.length == 0) revert InvalidRoute();
            (uint160 price,,,) = StateLibrary.getSlot0(
                IPoolManager(BuybackIntegration.POOL_MANAGER), PoolIdLibrary.toId(key)
            );
            if (price == 0) revert InvalidRoute();
        }
        if (currency != address(0) && currency != BuybackIntegration.WETH) revert InvalidRoute();
    }

    /// @inheritdoc IProtocolBuybackVault
    function inventory(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        override
        returns (BuybackTypes.Inventory memory)
    {
        return _inventory[canonicalAsset(asset)][bucket];
    }

    /// @inheritdoc IProtocolBuybackVault
    function recordEarnedFees(uint256 amount) external override nonReentrant {
        if (!IMembershipFactory(factory).isRegisteredTier(msg.sender)) revert OnlyRegisteredTier();
        if (amount == 0) revert ZeroAmount();
        address asset = address(IMembershipTier(msg.sender).paymentToken());
        if (asset == address(0) || asset.code.length == 0) revert InvalidAsset();
        uint256 backed = _balance(asset);
        uint256 accounted = _accounted(asset);
        if (backed < accounted || amount > backed - accounted) revert InsufficientBacking();

        _normalizeReceipt(asset, amount);
        asset = canonicalAsset(asset);

        // Registered immutable tiers exact-transfer before recording in the same transaction.
        // Do not absorb any unrelated, as-yet-unsynchronized donation into this receipt.
        BuybackTypes.Inventory storage bucket =
            _inventory[asset][BuybackTypes.SourceBucket.Membership];
        bucket.available += amount;
        bucket.totalReceived += amount;
        emit EarnedFeesReceived(msg.sender, asset, amount);
    }

    /// @inheritdoc IProtocolBuybackVault
    function syncDonation(address asset) external override nonReentrant returns (uint256 amount) {
        if (asset != address(0) && asset.code.length == 0) revert InvalidAsset();
        uint256 backed = _balance(asset);
        uint256 accounted = _accounted(asset);
        if (backed < accounted) revert InsufficientBacking();
        amount = backed - accounted;
        if (amount == 0) return 0;
        _normalizeReceipt(asset, amount);
        asset = canonicalAsset(asset);
        BuybackTypes.Inventory storage bucket =
            _inventory[asset][BuybackTypes.SourceBucket.Donation];
        bucket.available += amount;
        bucket.totalReceived += amount;
        emit DonationRecorded(asset, amount);
    }

    // Normalize only this receipt, preserving any unrelated unsynchronized WETH.
    // Both callers hold nonReentrant and receive() is empty. These deliberately
    // captured balances assert exact unwrap deltas; they are not reused inventory.
    // A callback attempting syncDonation/recordEarnedFees/process cannot enter.
    // slither-disable-next-line reentrancy-balance
    function _normalizeReceipt(address asset, uint256 amount) private {
        if (asset != BuybackIntegration.WETH) return;
        uint256 ethBefore = address(this).balance;
        uint256 wethBefore = IERC20(asset).balanceOf(address(this));
        IWrappedEther(asset).withdraw(amount);
        if (
            address(this).balance != ethBefore + amount
                || IERC20(asset).balanceOf(address(this)) != wethBefore - amount
        ) revert InexactSettlement();
    }

    function _accounted(address asset) private view returns (uint256) {
        return _inventory[asset][BuybackTypes.SourceBucket.Membership].available
            + _inventory[asset][BuybackTypes.SourceBucket.Donation].available;
    }

    function _balance(address asset) private view returns (uint256) {
        return asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }
}
