// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {ImmutableCodeStore} from "./ImmutableCodeStore.sol";
import {IWrappedEther, PonsBuybackModule} from "./PonsBuybackModule.sol";
import {IBuybackModule} from "./interfaces/IBuybackModule.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {BuybackIntegration} from "./libraries/BuybackIntegration.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnableProtocolToken {
    function burn(uint256 amount) external;
}

/// @notice Permanent custody, source accounting and mandatory burn settlement.
/// @dev Strategy modules have economic authority, never delegatecall or custody authority.
contract ProtocolBuybackVault is ReentrancyGuard, IProtocolBuybackVault {
    using SafeERC20 for IERC20;
    uint256 public constant MODULE_REPLACEMENT_DELAY = 48 hours;
    uint256 public constant MODULE_FREEZE_DELAY = 7 days;
    address public immutable override factory;
    address public override protocolToken;
    address public override activeModule;
    bytes32 public override activeModuleCodeHash;
    uint64 public override moduleRevision;
    address public immutable moduleCreationCodeStore;
    uint256 public immutable moduleCreationCodeLength;
    bytes32 public immutable moduleCreationCodeHash;
    uint256 public override settlementSequence;
    bool public override buybacksPaused = true;
    bool public override moduleReplacementFrozen;
    address public pendingModule;
    bytes32 public pendingModuleCodeHash;
    uint256 public moduleActivationAt;
    address public freezeModule;
    bytes32 public freezeModuleCodeHash;
    uint256 public moduleFreezeAt;

    struct SettlementSnapshot {
        address[] assets;
        uint256[] expected;
        uint256[] moduleBalances;
        uint256 count;
        uint256 supply;
        uint256 wrappedBalance;
    }
    mapping(address => mapping(BuybackTypes.SourceBucket => BuybackTypes.Inventory)) private
        _inventory;
    error OnlyProtocolAuthority();
    error InvalidModule();
    error ModuleReplacementFrozen();
    error PendingGovernanceAction();
    error DelayNotElapsed();
    error BuybacksMustBePaused();
    error BuybacksArePaused();
    error StaleRevision();
    error DeadlineExpired();
    error InvalidAmount();
    error ModuleCreationCodeCorrupted();
    error ModuleDeploymentFailed();
    error ProtocolTokenAlreadyBound();
    error InvalidAddress();
    error InvalidAsset();
    error OnlyFactoryDeployment();
    error OnlyRegisteredTier();
    error InsufficientBacking();
    error ZeroAmount();
    error InexactSettlement();
    modifier onlyProtocolAuthority() {
        if (msg.sender != IMembershipFactory(factory).owner()) revert OnlyProtocolAuthority();
        _;
    }

    constructor(address factory_, address protocolToken_) {
        if (factory_ == address(0)) revert InvalidAddress();
        if (msg.sender != factory_) revert OnlyFactoryDeployment();
        factory = factory_;
        bytes memory creationCode = type(PonsBuybackModule).creationCode;
        moduleCreationCodeStore = address(new ImmutableCodeStore(creationCode));
        moduleCreationCodeLength = creationCode.length;
        moduleCreationCodeHash = keccak256(creationCode);
        if (protocolToken_ != address(0)) _bindProtocolToken(protocolToken_);
    }
    receive() external payable {}

    function bindProtocolToken(address token) external override nonReentrant {
        if (msg.sender != factory) revert OnlyFactoryDeployment();
        _bindProtocolToken(token);
    }

    function _bindProtocolToken(address token) private {
        if (protocolToken != address(0)) revert ProtocolTokenAlreadyBound();
        if (token == address(0)) revert InvalidAddress();
        if (token.code.length == 0) revert InvalidAsset();
        protocolToken = token;
        address initialModule = _deployModule(token);
        _validateModule(initialModule, initialModule.codehash);
        activeModule = initialModule;
        activeModuleCodeHash = initialModule.codehash;
        moduleRevision = 1;
        emit ProtocolTokenBound(token, initialModule);
        emit BuybackModuleActivated(initialModule, activeModuleCodeHash, 1);
    }

    function _validateModule(address candidate, bytes32 expectedHash) private view {
        if (candidate.code.length == 0 || candidate.codehash != expectedHash) {
            revert InvalidModule();
        }
        IBuybackModule module = IBuybackModule(candidate);
        if (
            module.vault() != address(this) || module.protocolToken() != protocolToken
                || module.interfaceVersion() != 1 || module.moduleId() == bytes32(0)
                || module.moduleVersion() == 0
        ) revert InvalidModule();
    }

    function proposeBuybackModule(address candidate)
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        if (moduleFreezeAt != 0) revert PendingGovernanceAction();
        if (protocolToken == address(0)) revert InvalidModule();
        _validateModule(candidate, candidate.codehash);
        pendingModule = candidate;
        pendingModuleCodeHash = candidate.codehash;
        moduleActivationAt = block.timestamp + MODULE_REPLACEMENT_DELAY;
        emit BuybackModuleProposed(candidate, pendingModuleCodeHash, moduleActivationAt);
    }

    function cancelBuybackModule() external override onlyProtocolAuthority nonReentrant {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        delete pendingModule;
        delete pendingModuleCodeHash;
        delete moduleActivationAt;
        emit BuybackModuleCancelled();
    }

    // Governance delays and execution eligibility intentionally use chain time.
    // forge-lint: disable-next-item(block-timestamp)
    function activateBuybackModule() external override onlyProtocolAuthority nonReentrant {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        if (!buybacksPaused) revert BuybacksMustBePaused();
        if (pendingModule == address(0) || block.timestamp < moduleActivationAt) {
            revert DelayNotElapsed();
        }
        _validateModule(pendingModule, pendingModuleCodeHash);
        activeModule = pendingModule;
        activeModuleCodeHash = pendingModuleCodeHash;
        ++moduleRevision;
        delete pendingModule;
        delete pendingModuleCodeHash;
        delete moduleActivationAt;
        emit BuybackModuleActivated(activeModule, activeModuleCodeHash, moduleRevision);
    }

    function proposeModuleReplacementFreeze() external override onlyProtocolAuthority nonReentrant {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        if (pendingModule != address(0)) revert PendingGovernanceAction();
        _validateModule(activeModule, activeModuleCodeHash);
        freezeModule = activeModule;
        freezeModuleCodeHash = activeModuleCodeHash;
        moduleFreezeAt = block.timestamp + MODULE_FREEZE_DELAY;
        emit ModuleReplacementFreezeProposed(freezeModule, freezeModuleCodeHash, moduleFreezeAt);
    }

    function cancelModuleReplacementFreeze() external override onlyProtocolAuthority nonReentrant {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        delete freezeModule;
        delete freezeModuleCodeHash;
        delete moduleFreezeAt;
        emit ModuleReplacementFreezeCancelled();
    }

    // Governance delays and execution eligibility intentionally use chain time.
    // forge-lint: disable-next-item(block-timestamp)
    function finalizeModuleReplacementFreeze()
        external
        override
        onlyProtocolAuthority
        nonReentrant
    {
        if (moduleReplacementFrozen) revert ModuleReplacementFrozen();
        if (!buybacksPaused) revert BuybacksMustBePaused();
        if (pendingModule != address(0)) revert PendingGovernanceAction();
        if (moduleFreezeAt == 0 || block.timestamp < moduleFreezeAt) revert DelayNotElapsed();
        if (activeModule != freezeModule || activeModuleCodeHash != freezeModuleCodeHash) {
            revert InvalidModule();
        }
        _validateModule(activeModule, freezeModuleCodeHash);
        moduleReplacementFrozen = true;
        delete freezeModule;
        delete freezeModuleCodeHash;
        delete moduleFreezeAt;
        emit ModuleReplacementFinalized(activeModule, activeModuleCodeHash, moduleRevision);
    }

    // Governance delays and execution eligibility intentionally use chain time.
    // forge-lint: disable-next-item(block-timestamp)
    function process(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        uint64 expectedModuleRevision,
        uint64 deadline,
        bytes calldata data
    ) external override nonReentrant {
        asset = canonicalAsset(asset);
        if (buybacksPaused) revert BuybacksArePaused();
        if (deadline < block.timestamp) revert DeadlineExpired();
        _validateModule(activeModule, activeModuleCodeHash);
        if (expectedModuleRevision != moduleRevision) revert StaleRevision();
        if (amountIn == 0 || amountIn > _inventory[asset][bucket].available) {
            revert InvalidAmount();
        }
        uint256 sequence = ++settlementSequence;
        if (asset == protocolToken) {
            _burn(bucket, amountIn);
            emit DirectBurned(sequence, bucket, asset, amountIn);
            return;
        }
        _settle(asset, bucket, amountIn, deadline, data, sequence);
    }

    // Only nonReentrant process() reaches settlement. The recipient is the
    // delayed, authority-selected module whose runtime/bindings were checked.
    // Before/after balances are intentional postconditions, not stale quotes;
    // callbacks cannot mutate custody, governance or settlement state.
    // slither-disable-next-line arbitrary-send-eth,reentrancy-eth,reentrancy-balance
    function _settle(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        uint64 deadline,
        bytes calldata data,
        uint256 sequence
    ) private {
        SettlementSnapshot memory snapshot = _snapshotAssets(asset, data);
        if (asset != address(0)) {
            IERC20(asset).safeTransfer(activeModule, amountIn);
            if (
                _balance(asset) != snapshot.expected[0] - amountIn
                    || _moduleBalance(asset) != snapshot.moduleBalances[0] + amountIn
            ) revert InexactSettlement();
        }
        IBuybackModule.Result memory result = IBuybackModule(activeModule)
        .execute{value: asset == address(0) ? amountIn : 0}(
            msg.sender, asset, bucket, amountIn, deadline, data
        );
        if (
            activeModule.codehash != activeModuleCodeHash || result.legs.length == 0
                || result.legs[0].input != asset
        ) revert InexactSettlement();
        uint256 closingInput = _balance(asset);
        if (closingInput >= snapshot.expected[0]) revert InexactSettlement();
        uint256 spent = snapshot.expected[0] - closingInput;
        uint256 tokenIndex = _assetIndex(snapshot, protocolToken);
        uint256 closingToken = _balance(protocolToken);
        if (closingToken <= snapshot.expected[tokenIndex]) revert InexactSettlement();
        uint256 acquired = closingToken - snapshot.expected[tokenIndex];
        if (
            spent > amountIn || result.legs[0].spent != spent || result.acquired != acquired
                || IERC20(protocolToken).totalSupply() != snapshot.supply
        ) revert InexactSettlement();
        _bookLegs(bucket, result.legs, snapshot, sequence, moduleRevision);
        _burn(bucket, acquired);
        snapshot.expected[tokenIndex] -= acquired;
        for (uint256 i; i < snapshot.count; ++i) {
            if (
                _balance(snapshot.assets[i]) != snapshot.expected[i]
                    || (snapshot.assets[i] == BuybackIntegration.WETH
                        && snapshot.expected[i] != snapshot.wrappedBalance)
                    || _balance(snapshot.assets[i]) < _accounted(snapshot.assets[i])
                    || _moduleBalance(snapshot.assets[i]) != snapshot.moduleBalances[i]
            ) revert InexactSettlement();
        }
        emit BuybackBurned(sequence, bucket, asset, spent, acquired, result.context, moduleRevision);
    }

    function _assetIndex(SettlementSnapshot memory snapshot, address asset)
        private
        pure
        returns (uint256)
    {
        for (uint256 i; i < snapshot.count; ++i) {
            if (snapshot.assets[i] == asset) return i;
        }
        revert InexactSettlement();
    }

    function _snapshotAssets(address asset, bytes calldata data)
        private
        view
        returns (SettlementSnapshot memory snapshot)
    {
        address[] memory tracked = IBuybackModule(activeModule).trackedAssets(asset, data);
        snapshot.assets = new address[](tracked.length + 3);
        snapshot.expected = new uint256[](snapshot.assets.length);
        snapshot.moduleBalances = new uint256[](snapshot.assets.length);
        snapshot.count = _snapshot(snapshot.assets, snapshot.expected, 0, asset);
        snapshot.count =
            _snapshot(snapshot.assets, snapshot.expected, snapshot.count, protocolToken);
        // WETH legs share the native inventory key. Always measure that key,
        // and require wrapped custody to remain unchanged: modules must unwrap
        // any new WETH before returning it, even when native surplus exists.
        snapshot.count = _snapshot(snapshot.assets, snapshot.expected, snapshot.count, address(0));
        for (uint256 i; i < tracked.length; ++i) {
            snapshot.count =
                _snapshot(snapshot.assets, snapshot.expected, snapshot.count, tracked[i]);
        }
        for (uint256 i; i < snapshot.count; ++i) {
            snapshot.moduleBalances[i] = _moduleBalance(snapshot.assets[i]);
            if (snapshot.assets[i] == BuybackIntegration.WETH) {
                snapshot.wrappedBalance = snapshot.expected[i];
            }
        }
        snapshot.supply = IERC20(protocolToken).totalSupply();
    }

    function _moduleBalance(address asset) private view returns (uint256) {
        return asset == address(0) ? activeModule.balance : IERC20(asset).balanceOf(activeModule);
    }

    function _deployModule(address token) private returns (address deployed) {
        address store = moduleCreationCodeStore;
        uint256 length = moduleCreationCodeLength;
        bytes memory args = abi.encode(address(this), token);
        bytes memory initCode = new bytes(length + args.length);
        bytes32 reconstructedHash;
        assembly ("memory-safe") {
            let data := add(initCode, 0x20)
            extcodecopy(store, data, 1, length)
            reconstructedHash := keccak256(data, length)
            mcopy(add(data, length), add(args, 0x20), mload(args))
        }
        if (reconstructedHash != moduleCreationCodeHash) revert ModuleCreationCodeCorrupted();
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
            revert ModuleDeploymentFailed();
        }
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
            _assetIndex(snapshot, leg.input);
            _assetIndex(snapshot, leg.output);
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

    // Only nonReentrant process() reaches this exact before/after burn check.
    // slither-disable-next-line reentrancy-balance
    function _burn(BuybackTypes.SourceBucket bucket, uint256 amount) private {
        uint256 balance = _balance(protocolToken);
        if (balance < _accounted(protocolToken)) revert InsufficientBacking();
        uint256 supply = IERC20(protocolToken).totalSupply();
        _inventory[protocolToken][bucket].available -= amount;
        _inventory[protocolToken][bucket].totalSpent += amount;
        _inventory[protocolToken][bucket].totalBurned += amount;
        IBurnableProtocolToken(protocolToken).burn(amount);
        if (
            _balance(protocolToken) != balance - amount
                || IERC20(protocolToken).totalSupply() != supply - amount
        ) {
            revert InexactSettlement();
        }
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

    function setBuybacksPaused(bool paused) external override onlyProtocolAuthority nonReentrant {
        buybacksPaused = paused;
        emit BuybacksPaused(paused);
    }

    function inventory(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        override
        returns (BuybackTypes.Inventory memory)
    {
        return _inventory[canonicalAsset(asset)][bucket];
    }

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

    // All callers are nonReentrant; these snapshots prove exact WETH unwrap.
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
