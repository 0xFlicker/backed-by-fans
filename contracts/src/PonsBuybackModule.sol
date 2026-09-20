// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IBuybackModule} from "./interfaces/IBuybackModule.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IPonsBuybackModule} from "./interfaces/IPonsBuybackModule.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {GraduationPhase} from "./interfaces/external/ILaunchpadV2.sol";
import {IPonsBondingCurve, IPonsLaunchFactory} from "./interfaces/external/IPons.sol";
import {BuybackIntegration} from "./libraries/BuybackIntegration.sol";
import {BuybackIntegration as Integration} from "./libraries/BuybackIntegration.sol";
import {ProtocolLaunchValidation} from "./libraries/ProtocolLaunchValidation.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {
    IUniversalRouter
} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

interface IWrappedEther {
    function withdraw(uint256 amount) external;
}

/// @notice Fixed-purpose settlement. Only the immutable vault can supply funds and terms.
contract PonsBuybackModule is ReentrancyGuard, IPonsBuybackModule {
    using SafeERC20 for IERC20;

    struct MarketState {
        address current;
        uint256 available;
        uint256 legCount;
    }

    struct BalanceSnapshot {
        address[] assets;
        uint256[] baseline;
        uint256 count;
    }

    struct ExecutionTerms {
        uint256[] minimumOutputs;
        BuybackTypes.OutputRate[] rates;
        uint64 deadline;
    }

    struct SwapBalances {
        uint256 input;
        uint256 output;
        uint256 routerETH;
        uint256 routerInput;
        uint256 routerOutput;
    }
    address public immutable override vault;
    address public immutable override protocolToken;
    address public immutable override curve;
    error OnlyVault();
    error InvalidDependency();
    error InvalidExecution();
    error GraduationPending();
    error LaunchPenalty();
    error InexactSettlement();

    BuybackTypes.ExecutionMode public override executionMode;
    address public override operator;
    mapping(address asset => BuybackTypes.PermissionlessPolicy) private _policies;
    mapping(address asset => bool) private _assetBuybacksPaused;
    mapping(address asset => uint64) private _revision;
    mapping(address asset => bool) private _hasRoute;
    mapping(address asset => BuybackTypes.TypedRoute) private _routes;
    mapping(address asset => BuybackTypes.ExecutionLimits) private _limits;
    uint64 public override globalMinInterval;
    uint64 public override lastBuyAt;
    mapping(address asset => uint64) private _lastAssetBuyAt;

    error OnlyOperator();
    error InvalidPolicy();
    error OnlyProtocolAuthority();
    error InvalidRoute();
    error InvalidLimits();
    error ProcessingUnavailable(BuybackTypes.Status status);
    error StaleRevision();
    error InvalidAmount();
    error DeadlineExpired();
    error ProtocolTokenNotLaunched();

    function canonicalAsset(address asset) public pure override returns (address) {
        return asset == BuybackIntegration.WETH ? address(0) : asset;
    }
    modifier onlyProtocolAuthority() {
        if (msg.sender != IMembershipFactory(IProtocolBuybackVault(vault).factory()).owner()) {
            revert OnlyProtocolAuthority();
        }
        _;
    }

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

    // Governance delays and execution eligibility intentionally use chain time.
    // forge-lint: disable-next-item(block-timestamp)
    function _processingStatus(address asset, BuybackTypes.SourceBucket bucket, uint256 additional)
        private
        view
        returns (BuybackTypes.ProcessingState memory state)
    {
        asset = canonicalAsset(asset);
        state.available =
            IProtocolBuybackVault(vault).inventory(asset, bucket).available + additional;
        state.revision = asset == protocolToken ? 0 : _revision[asset];
        if (protocolToken == address(0)) {
            state.status = BuybackTypes.Status.TokenNotLaunched;
        } else if (IProtocolBuybackVault(vault).buybacksPaused() || _assetBuybacksPaused[asset]) {
            state.status = BuybackTypes.Status.Paused;
        } else if (state.available == 0) {
            state.status = BuybackTypes.Status.NoInventory;
        } else if (asset == protocolToken) {
            state.maxInput = state.available;
        } else if (executionMode == BuybackTypes.ExecutionMode.OperatorGuarded) {
            state.status = BuybackTypes.Status.OperatorOnly;
        } else if (!_hasRoute[asset]) {
            state.status = BuybackTypes.Status.NoRoute;
        } else {
            BuybackTypes.ExecutionLimits memory active = _limits[asset];
            state.minInput = active.minInput;
            state.maxInput = Math.min(state.available, active.maxInput);
            BuybackTypes.PermissionlessPolicy storage policy = _policies[asset];
            if (policy.budgetLimited) {
                state.maxInput = Math.min(state.maxInput, policy.remainingBudget);
            }
            state.nextEligibleAt = Math.max(
                lastBuyAt == 0 ? 0 : uint256(lastBuyAt) + globalMinInterval,
                _lastAssetBuyAt[asset] == 0
                    ? 0
                    : uint256(_lastAssetBuyAt[asset]) + active.minInterval
            );
            if (active.maxInput == 0) {
                state.status = BuybackTypes.Status.NoLimits;
            } else if (policy.rates.length == 0) {
                state.status = BuybackTypes.Status.NoPolicy;
            } else if (policy.revision != state.revision) {
                state.status = BuybackTypes.Status.StalePolicy;
            } else if (policy.expiresAt != 0 && block.timestamp > policy.expiresAt) {
                state.status = BuybackTypes.Status.PolicyExpired;
            } else if (policy.budgetLimited && policy.remainingBudget < active.minInput) {
                state.status = BuybackTypes.Status.BudgetExhausted;
            } else if (state.available < active.minInput) {
                state.status = BuybackTypes.Status.BelowMinimum;
            } else if (block.timestamp < state.nextEligibleAt) {
                state.status = BuybackTypes.Status.Cooldown;
            } else {
                BuybackTypes.Lifecycle phase = lifecycle();
                if (phase == BuybackTypes.Lifecycle.GraduationPending) {
                    state.status = BuybackTypes.Status.GraduationPending;
                } else if (phase != policy.lifecycle) {
                    state.status = BuybackTypes.Status.StalePolicy;
                } else if (
                    phase == BuybackTypes.Lifecycle.Bonding
                        && IPonsBondingCurve(curve).currentSnipeTaxBps(address(this)) != 0
                ) {
                    state.status = BuybackTypes.Status.LaunchPenalty;
                }
            }
        }
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

    function setOperator(address operator_) external override onlyProtocolAuthority nonReentrant {
        operator = operator_;
        emit OperatorConfigured(operator_);
    }

    function setExecutionMode(BuybackTypes.ExecutionMode mode)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        executionMode = mode;
        emit ExecutionModeConfigured(mode);
    }

    function permissionlessPolicy(address asset)
        external
        view
        override
        returns (BuybackTypes.PermissionlessPolicy memory)
    {
        return _policies[canonicalAsset(asset)];
    }

    // Governance delays and execution eligibility intentionally use chain time.
    // forge-lint: disable-next-item(block-timestamp)
    function setPermissionlessPolicy(
        address asset,
        BuybackTypes.Lifecycle lifecycle_,
        BuybackTypes.OutputRate[] calldata rates,
        uint64 expiresAt,
        uint256 inputBudget
    ) external override onlyProtocolAuthority nonReentrant {
        asset = canonicalAsset(asset);
        if (
            !_hasRoute[asset] || _limits[asset].maxInput == 0
                || lifecycle_ == BuybackTypes.Lifecycle.GraduationPending
                || rates.length != _routes[asset].pools.length + 1
                || (expiresAt != 0 && expiresAt < block.timestamp)
        ) revert InvalidPolicy();
        for (uint256 i; i < rates.length; ++i) {
            if (rates[i].numerator == 0 || rates[i].denominator == 0) revert InvalidPolicy();
        }
        uint64 next = ++_revision[asset];
        BuybackTypes.PermissionlessPolicy storage policy = _policies[asset];
        policy.lifecycle = lifecycle_;
        policy.revision = next;
        policy.expiresAt = expiresAt;
        policy.budgetLimited = inputBudget != 0;
        policy.remainingBudget = inputBudget;
        delete policy.rates;
        for (uint256 i; i < rates.length; ++i) {
            policy.rates.push(rates[i]);
        }
        emit PermissionlessPolicyConfigured(asset, policy);
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
        uint64 previous = _revision[asset];
        uint64 next = ++_revision[asset];
        // Quantity/cooldown changes preserve authorized prices and consumed budgets.
        // A policy already stale from a route change must not be revived.
        if (_policies[asset].rates.length != 0 && _policies[asset].revision == previous) {
            _policies[asset].revision = next;
        }
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

    function _validateRoute(address asset, BuybackTypes.TypedRoute memory route_) private view {
        if (protocolToken == address(0)) revert ProtocolTokenNotLaunched();
        uint256 count = route_.pools.length;
        if (asset == protocolToken || count > 2 || (asset != address(0) && asset.code.length == 0))
        {
            revert InvalidRoute();
        }
        if (asset == address(0) || asset == BuybackIntegration.WETH) {
            if (count != 0) revert InvalidRoute();
            return;
        }
        if (
            count == 0
                || BuybackIntegration.POOL_MANAGER.codehash != BuybackIntegration.POOL_MANAGER_HASH
        ) {
            revert InvalidRoute();
        }
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
            ) {
                revert InvalidRoute();
            }
            if (currency != address(0) && currency.code.length == 0) revert InvalidRoute();
            (uint160 price,,,) = StateLibrary.getSlot0(
                IPoolManager(BuybackIntegration.POOL_MANAGER), PoolIdLibrary.toId(key)
            );
            if (price == 0) revert InvalidRoute();
        }
        if (currency != address(0) && currency != BuybackIntegration.WETH) revert InvalidRoute();
    }

    constructor(address vault_, address token_) {
        if (vault_ == address(0) || vault_.code.length == 0 && msg.sender != vault_) {
            revert OnlyVault();
        }
        vault = vault_;
        protocolToken = token_;
        curve = ProtocolLaunchValidation.validate(token_);
        _validateDependencies();
    }

    receive() external payable {
        // V4 TAKE_ALL pays the executor directly from PoolManager. ETH is
        // accepted only within the active vault-authorized settlement.
        if (
            !_reentrancyGuardEntered()
                || (msg.sender != curve
                    && msg.sender != Integration.ROUTER
                    && msg.sender != Integration.WETH
                    && msg.sender != Integration.POOL_MANAGER)
        ) revert InvalidExecution();
    }

    function _validateDependencies() private view {
        if (
            Integration.ROUTER.codehash != Integration.ROUTER_HASH
                || Integration.PERMIT2.codehash != Integration.PERMIT2_HASH
                || Integration.POOL_MANAGER.codehash != Integration.POOL_MANAGER_HASH
                || Integration.WETH.codehash != Integration.WETH_HASH
                || Integration.MEME_HOOK.codehash != Integration.MEME_HOOK_HASH
        ) revert InvalidDependency();
    }

    function lifecycle() public view override returns (BuybackTypes.Lifecycle) {
        IPonsLaunchFactory.LaunchedToken memory launch =
            IPonsLaunchFactory(Integration.PONS_FACTORY).getLaunchedToken(protocolToken);
        if (launch.phase == GraduationPhase.PoolCreated) return BuybackTypes.Lifecycle.Pool;
        if (
            launch.phase != GraduationPhase.NotGraduated
                || IPonsBondingCurve(curve).readyToGraduate()
                || IPonsBondingCurve(curve).graduated()
        ) return BuybackTypes.Lifecycle.GraduationPending;
        return BuybackTypes.Lifecycle.Bonding;
    }

    function interfaceVersion() external pure override returns (uint256) {
        return 1;
    }

    function moduleId() external pure override returns (bytes32) {
        return keccak256("BBF.PonsBuyback");
    }

    function moduleVersion() external pure override returns (uint256) {
        return 1;
    }

    /// @notice Canonical execution-data schema for keepers and generated clients.
    function encodeExecutionData(
        uint64 policyRevision,
        BuybackTypes.TypedRoute calldata selectedRoute,
        uint256[] calldata minimumOutputs
    ) external pure returns (bytes memory) {
        return abi.encode(policyRevision, selectedRoute, minimumOutputs);
    }

    // data = abi.encode(policyRevision, route, absoluteMinima).
    // Permissionless calls use an empty route and minima; policy is read from this module.
    function trackedAssets(address asset, bytes calldata data)
        external
        view
        override
        returns (address[] memory assets)
    {
        (, BuybackTypes.TypedRoute memory supplied,) =
            abi.decode(data, (uint64, BuybackTypes.TypedRoute, uint256[]));
        BuybackTypes.TypedRoute memory selected = executionMode
            == BuybackTypes.ExecutionMode.OperatorGuarded
            ? supplied
            : _routes[canonicalAsset(asset)];
        assets = new address[](selected.pools.length * 2 + 1);
        for (uint256 i; i < selected.pools.length; ++i) {
            assets[2 * i] = Currency.unwrap(selected.pools[i].currency0);
            assets[2 * i + 1] = Currency.unwrap(selected.pools[i].currency1);
        }
        assets[assets.length - 1] = address(0);
    }

    // Governance delays and execution eligibility intentionally use chain time.
    // Execution and every configuration mutation are nonReentrant. Read-only
    // status during a venue callback cannot authorize a nested vault purchase;
    // the vault and module both reject reentry before budgets/clocks can change.
    // forge-lint: disable-next-item(block-timestamp)
    // slither-disable-next-line reentrancy-eth
    function execute(
        address caller,
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amount,
        uint64 deadline,
        bytes calldata data
    ) external payable override nonReentrant returns (IBuybackModule.Result memory settled) {
        if (msg.sender != vault) revert OnlyVault();
        if (deadline < block.timestamp) revert DeadlineExpired();
        (
            uint64 expectedRevision,
            BuybackTypes.TypedRoute memory selected,
            uint256[] memory minima
        ) = abi.decode(data, (uint64, BuybackTypes.TypedRoute, uint256[]));
        bool publicCall = executionMode == BuybackTypes.ExecutionMode.PermissionlessGuarded;
        BuybackTypes.OutputRate[] memory rates;
        if (publicCall) {
            BuybackTypes.ProcessingState memory state = processingStatus(asset, bucket);
            if (expectedRevision != state.revision) revert StaleRevision();
            if (state.status != BuybackTypes.Status.Ready) {
                revert ProcessingUnavailable(state.status);
            }
            if (amount < state.minInput || amount > state.maxInput) revert InvalidAmount();
            if (selected.pools.length != 0 || minima.length != 0) revert InvalidPolicy();
            selected = _routes[asset];
            rates = _policies[asset].rates;
        } else {
            if (caller != operator || operator == address(0)) revert OnlyOperator();
            if (_assetBuybacksPaused[asset]) {
                revert ProcessingUnavailable(BuybackTypes.Status.Paused);
            }
            _validateRoute(asset, selected);
            if (minima.length != selected.pools.length + 1) revert InvalidPolicy();
            for (uint256 i; i < minima.length; ++i) {
                if (minima[i] == 0) revert InvalidPolicy();
            }
            rates = new BuybackTypes.OutputRate[](0);
        }
        BuybackTypes.Execution memory result =
            _execute(asset, amount, selected, ExecutionTerms(minima, rates, deadline));
        _recordExecution(asset, publicCall, result);
        return
            IBuybackModule.Result(result.legs, result.acquired, bytes32(uint256(result.lifecycle)));
    }

    function _recordExecution(address asset, bool publicCall, BuybackTypes.Execution memory result)
        private
    {
        uint256 spent = result.legs[0].spent;
        if (publicCall) {
            if (
                spent < _limits[asset].minInput
                    && !(result.lifecycle == BuybackTypes.Lifecycle.Bonding
                        && lifecycle() == BuybackTypes.Lifecycle.GraduationPending)
            ) revert InvalidAmount();
            if (_policies[asset].budgetLimited) _policies[asset].remainingBudget -= spent;
        }
        lastBuyAt = SafeCast.toUint64(block.timestamp);
        _lastAssetBuyAt[asset] = lastBuyAt;
    }

    // Only execute() enters this private helper under nonReentrant; the immutable
    // vault caller is checked before settlement. Balance snapshots intentionally
    // measure external calls, while callbacks cannot start another execution.
    // slither-disable-next-line reentrancy-balance
    function _execute(
        address asset,
        uint256 amount,
        BuybackTypes.TypedRoute memory selectedRoute,
        ExecutionTerms memory terms
    ) private returns (BuybackTypes.Execution memory result) {
        if (msg.sender != vault) revert OnlyVault();
        if (
            amount == 0 || asset == protocolToken || selectedRoute.pools.length > 2
                || msg.value != (asset == address(0) ? amount : 0)
        ) revert InvalidExecution();
        uint256 marketLegs = selectedRoute.pools.length + 1;
        if ((terms.minimumOutputs.length == marketLegs) == (terms.rates.length == marketLegs)) {
            revert InvalidExecution();
        }
        if (terms.minimumOutputs.length != 0 && terms.rates.length != 0) revert InvalidExecution();
        for (uint256 i; i < marketLegs; ++i) {
            if (terms.minimumOutputs.length != 0) {
                if (terms.minimumOutputs[i] == 0) revert InvalidExecution();
            } else if (terms.rates[i].numerator == 0 || terms.rates[i].denominator == 0) {
                revert InvalidExecution();
            }
        }
        _validateDependencies();
        result.lifecycle = lifecycle();
        if (result.lifecycle == BuybackTypes.Lifecycle.GraduationPending) {
            revert GraduationPending();
        }
        if (
            result.lifecycle == BuybackTypes.Lifecycle.Bonding
                && IPonsBondingCurve(curve).currentSnipeTaxBps(address(this)) != 0
        ) revert LaunchPenalty();
        // Preserve all pre-existing executor balances. Only newly supplied or
        // acquired route assets return to this settlement's source bucket.
        BalanceSnapshot memory snapshot = _snapshot(selectedRoute, asset, amount);
        result.legs = new BuybackTypes.Leg[](selectedRoute.pools.length + 2);
        MarketState memory market = MarketState(asset, amount, 0);
        for (uint256 i; i < selectedRoute.pools.length; ++i) {
            BuybackTypes.Leg memory leg = _swap(
                market.current,
                market.available,
                selectedRoute.pools[i],
                terms.deadline,
                _minimum(market.available, i, terms.minimumOutputs, terms.rates)
            );
            result.legs[market.legCount++] = leg;
            market.current = leg.output;
            market.available = leg.received;
        }
        if (market.current == Integration.WETH) {
            uint256 beforeETH = address(this).balance;
            uint256 beforeWETH = IERC20(market.current).balanceOf(address(this));
            IWrappedEther(market.current).withdraw(market.available);
            if (
                address(this).balance != beforeETH + market.available
                    || IERC20(market.current).balanceOf(address(this))
                        != beforeWETH - market.available
            ) revert InexactSettlement();
            result.legs[market.legCount++] =
                BuybackTypes.Leg(market.current, address(0), market.available, market.available);
            market.current = address(0);
        }
        if (market.current != address(0)) revert InvalidExecution();
        uint256 finalMinimum = _minimum(
            market.available, selectedRoute.pools.length, terms.minimumOutputs, terms.rates
        );
        BuybackTypes.Leg memory purchase = result.lifecycle == BuybackTypes.Lifecycle.Bonding
            ? _buyCurve(
                market.available,
                finalMinimum,
                terms.rates.length == 0
                    ? BuybackTypes.OutputRate(0, 0)
                    : terms.rates[selectedRoute.pools.length]
            )
            : _buyPool(market.available, terms.deadline, finalMinimum);
        result.legs[market.legCount++] = purchase;
        result.acquired = purchase.received;
        // Trim the allocation; no unused zero-valued leg is part of the accounting.
        BuybackTypes.Leg[] memory legs = result.legs;
        uint256 legCount = market.legCount;
        assembly ("memory-safe") { mstore(legs, legCount) }
        for (uint256 i; i < snapshot.count; ++i) {
            uint256 closing = _balance(snapshot.assets[i]);
            if (closing < snapshot.baseline[i]) revert InexactSettlement();
            uint256 returned = closing - snapshot.baseline[i];
            if (returned != 0) _return(snapshot.assets[i], returned);
            if (_balance(snapshot.assets[i]) != snapshot.baseline[i]) revert InexactSettlement();
        }
    }

    function _snapshot(BuybackTypes.TypedRoute memory selectedRoute, address asset, uint256 amount)
        private
        view
        returns (BalanceSnapshot memory snapshot)
    {
        snapshot.assets = new address[](selectedRoute.pools.length + 4);
        snapshot.baseline = new uint256[](snapshot.assets.length);
        snapshot.count = _track(snapshot.assets, snapshot.baseline, 0, asset);
        for (uint256 i; i < selectedRoute.pools.length; ++i) {
            snapshot.count = _track(
                snapshot.assets,
                snapshot.baseline,
                snapshot.count,
                Currency.unwrap(selectedRoute.pools[i].currency0)
            );
            snapshot.count = _track(
                snapshot.assets,
                snapshot.baseline,
                snapshot.count,
                Currency.unwrap(selectedRoute.pools[i].currency1)
            );
        }
        snapshot.count = _track(snapshot.assets, snapshot.baseline, snapshot.count, address(0));
        snapshot.count = _track(snapshot.assets, snapshot.baseline, snapshot.count, protocolToken);
        snapshot.baseline[0] -= amount;
    }

    // Only execute() reaches this helper under nonReentrant. The immutable curve
    // is validated from Pons at construction; no caller can replace the recipient.
    // slither-disable-next-line arbitrary-send-eth,reentrancy-balance
    function _buyCurve(uint256 amount, uint256 minimumOutput, BuybackTypes.OutputRate memory rate)
        private
        returns (BuybackTypes.Leg memory leg)
    {
        uint256 ethBefore = address(this).balance;
        uint256 tokenBefore = IERC20(protocolToken).balanceOf(address(this));
        // Require a nonzero purchase; measured deltas below prove exact settlement.
        uint256 reported =
            IPonsBondingCurve(curve).buy{value: amount}(amount, minimumOutput, address(this));
        leg = BuybackTypes.Leg(
            address(0),
            protocolToken,
            ethBefore - address(this).balance,
            IERC20(protocolToken).balanceOf(address(this)) - tokenBefore
        );
        if (rate.denominator != 0) {
            minimumOutput =
                Math.mulDiv(leg.spent, rate.numerator, rate.denominator, Math.Rounding.Ceil);
        }
        if (leg.received != reported || leg.received < minimumOutput) revert InexactSettlement();
        _checkSettlement(leg);
    }

    function _buyPool(uint256 amount, uint64 deadline, uint256 minimumOutput)
        private
        returns (BuybackTypes.Leg memory)
    {
        IPonsLaunchFactory.LaunchedToken memory launch =
            IPonsLaunchFactory(Integration.PONS_FACTORY).getLaunchedToken(protocolToken);
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(protocolToken),
            launch.poolFee,
            launch.tickSpacing,
            IHooks(Integration.MEME_HOOK)
        );
        (uint160 price,,,) =
            StateLibrary.getSlot0(IPoolManager(Integration.POOL_MANAGER), PoolIdLibrary.toId(key));
        if (price == 0) revert GraduationPending();
        return _swap(address(0), amount, key, deadline, minimumOutput);
    }

    // Only execute() reaches this helper under nonReentrant. Snapshots measure
    // actual deltas and preserve pre-existing router/executor balances.
    // slither-disable-next-line reentrancy-balance
    function _swap(
        address input,
        uint256 amount,
        PoolKey memory key,
        uint64 deadline,
        uint256 minimumOutput
    ) private returns (BuybackTypes.Leg memory leg) {
        bool zeroForOne = input == Currency.unwrap(key.currency0);
        if (!zeroForOne && input != Currency.unwrap(key.currency1)) revert InvalidExecution();
        address output = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);
        SwapBalances memory beforeSwap = SwapBalances(
            _balance(input),
            _balance(output),
            Integration.ROUTER.balance,
            input == address(0)
                ? Integration.ROUTER.balance
                : IERC20(input).balanceOf(Integration.ROUTER),
            output == address(0)
                ? Integration.ROUTER.balance
                : IERC20(output).balanceOf(Integration.ROUTER)
        );
        if (input != address(0)) {
            IERC20(input).forceApprove(Integration.PERMIT2, amount);
            IAllowanceTransfer(Integration.PERMIT2)
                .approve(
                    input,
                    Integration.ROUTER,
                    SafeCast.toUint160(amount),
                    SafeCast.toUint48(deadline)
                );
        }
        _routerSwap(key, zeroForOne, amount, deadline, input == address(0), minimumOutput);
        // SWEEP refunds newly unused ETH. Preserve unrelated router ETH exactly;
        // it is neither this purchase's input nor this vault's revenue.
        if (beforeSwap.routerETH != 0) {
            IUniversalRouter(Integration.ROUTER).execute{value: beforeSwap.routerETH}(
                hex"", new bytes[](0), deadline
            );
        }
        if (input != address(0)) {
            IERC20(input).forceApprove(Integration.PERMIT2, 0);
            // Permit2 rewrites expiration 0 to the current block. Use an
            // explicit past expiration and zero amount for a cleared approval.
            IAllowanceTransfer(Integration.PERMIT2).approve(input, Integration.ROUTER, 0, 1);
            (uint160 allowance, uint48 expiry,) = IAllowanceTransfer(Integration.PERMIT2)
                .allowance(address(this), input, Integration.ROUTER);
            if (
                allowance != 0 || expiry != 1
                    || IERC20(input).allowance(address(this), Integration.PERMIT2) != 0
            ) {
                revert InexactSettlement();
            }
        }
        if (
            Integration.ROUTER.balance != beforeSwap.routerETH
                || (input != address(0)
                    && IERC20(input).balanceOf(Integration.ROUTER) != beforeSwap.routerInput)
                || (output != address(0)
                    && IERC20(output).balanceOf(Integration.ROUTER) != beforeSwap.routerOutput)
        ) revert InexactSettlement();
        leg = BuybackTypes.Leg(
            input, output, beforeSwap.input - _balance(input), _balance(output) - beforeSwap.output
        );
        if (leg.spent > amount || leg.received < minimumOutput) revert InexactSettlement();
        _checkSettlement(leg);
    }

    function _routerSwap(
        PoolKey memory key,
        bool zeroForOne,
        uint256 amount,
        uint64 deadline,
        bool nativeInput,
        uint256 minimumOutput
    ) private {
        bytes[] memory actions = new bytes[](3);
        actions[0] = abi.encode(
            IV4Router.ExactInputSingleParams(
                key,
                zeroForOne,
                SafeCast.toUint128(amount),
                SafeCast.toUint128(minimumOutput),
                0,
                hex""
            )
        );
        actions[1] = abi.encode(zeroForOne ? key.currency0 : key.currency1, amount);
        actions[2] = abi.encode(zeroForOne ? key.currency1 : key.currency0, minimumOutput);
        bytes[] memory commands = new bytes[](2);
        commands[0] = abi.encode(
            abi.encodePacked(
                uint8(Actions.SWAP_EXACT_IN_SINGLE),
                uint8(Actions.SETTLE_ALL),
                uint8(Actions.TAKE_ALL)
            ),
            actions
        );
        commands[1] = abi.encode(address(0), address(this), uint256(0));
        IUniversalRouter(Integration.ROUTER).execute{value: nativeInput ? amount : 0}(
            abi.encodePacked(uint8(Commands.V4_SWAP), uint8(Commands.SWEEP)), commands, deadline
        );
    }

    function _minimum(
        uint256 offered,
        uint256 index,
        uint256[] memory minimumOutputs,
        BuybackTypes.OutputRate[] memory rates
    ) private pure returns (uint256) {
        if (minimumOutputs.length != 0) {
            return minimumOutputs[index];
        }
        return
            Math.mulDiv(
                offered, rates[index].numerator, rates[index].denominator, Math.Rounding.Ceil
            );
    }

    function _checkSettlement(BuybackTypes.Leg memory leg) private pure {
        if (leg.spent == 0 || leg.received == 0) revert InexactSettlement();
    }

    function _track(
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
        return count + 1;
    }

    function _balance(address asset) private view returns (uint256) {
        return asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }

    function _return(address asset, uint256 amount) private {
        if (asset == address(0)) {
            (bool sent,) = vault.call{value: amount}("");
            if (!sent) revert InexactSettlement();
        } else {
            IERC20(asset).safeTransfer(vault, amount);
        }
    }
}
