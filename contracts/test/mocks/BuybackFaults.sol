// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackIntegration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Synthetic stage adversaries, never authentic venue or cash evidence.
contract AdvanceStageFault {
    enum Fault {
        None,
        Revert,
        ExhaustGas,
        LongRevert,
        Malformed,
        ExcessSteps
    }

    function _fault(Fault fault) internal pure {
        if (fault == Fault.Revert) revert("Injected stage failure");
        if (fault == Fault.ExhaustGas) {
            assembly { for {} 1 {} {} }
        }
        if (fault == Fault.LongRevert) {
            bytes memory reason = new bytes(65_536);
            assembly { revert(add(reason, 32), mload(reason)) }
        }
        if (fault == Fault.Malformed) {
            assembly { return(0, 0) }
        }
    }
}

contract AdvanceFaultTier is AdvanceStageFault {
    address public immutable paymentToken;
    Fault public accountFault;
    Fault public releaseFault;
    uint256 public accounted;
    uint256 public released;

    constructor(address asset) {
        paymentToken = asset;
    }

    function configure(Fault account_, Fault release_) external {
        accountFault = account_;
        releaseFault = release_;
    }

    function processAccounting(uint256 maximum) external returns (uint256, uint64, bool, uint256) {
        ++accounted;
        _fault(accountFault);
        return (accountFault == Fault.ExcessSteps ? maximum + 1 : 1, 1000, true, 1);
    }

    function releaseProtocolFees() external returns (uint256) {
        ++released;
        _fault(releaseFault);
        return 1;
    }
}

contract AdvanceFaultRegistry {
    address private immutable _tier;

    constructor(address tier) {
        _tier = tier;
    }

    function isRegisteredTier(address tier) external view returns (bool) {
        return tier == _tier;
    }
}

contract AdvanceMeasurementToken is AdvanceStageFault {
    uint256 private _supply = 100;
    Fault public fault;
    Fault public afterPurchase;

    function configure(Fault before_, Fault after_) external {
        fault = before_;
        afterPurchase = after_;
    }

    function totalSupply() external view returns (uint256) {
        _fault(fault);
        return _supply;
    }

    function settle() external {
        --_supply;
        fault = afterPurchase;
    }
}

contract AdvanceFaultVault is AdvanceStageFault {
    AdvanceMeasurementToken private immutable _token;
    Fault public purchaseFault;
    uint256 public purchases;

    constructor(AdvanceMeasurementToken token_) {
        _token = token_;
    }

    function protocolToken() external view returns (address) {
        return address(_token);
    }

    function canonicalAsset(address asset) external pure returns (address) {
        return asset;
    }

    function configure(Fault fault) external {
        purchaseFault = fault;
    }

    function processingStatus(address, BuybackTypes.SourceBucket)
        external
        pure
        returns (BuybackTypes.ProcessingState memory state)
    {
        state.status = BuybackTypes.Status.Ready;
        state.available = 1;
        state.maxInput = 1;
    }

    function process(address, BuybackTypes.SourceBucket, uint256, uint64, uint64) external {
        ++purchases;
        _fault(purchaseFault);
        _token.settle();
    }
}

/// @dev Explicit synthetic fault injection. Never used in authentic fork evidence.
contract FaultBurnToken is ERC20 {
    uint8 public burnMode;
    constructor() ERC20("Fault protocol token", "FAULT") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setBurnMode(uint8 mode) external {
        burnMode = mode;
    }

    function burn(uint256 amount) external {
        if (burnMode == 1) return;
        _burn(msg.sender, amount + (burnMode == 2 ? 1 : 0));
    }
}

contract FaultBondingCurve {
    address public immutable token;
    uint256 public spendBps = 10_000;
    uint256 public outputNumerator = 1;
    uint256 public outputDenominator = 1;
    uint256 public undercut;
    uint256 public penalty;
    bool public graduated;
    bool public readyToGraduate;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;

    constructor(address token_) {
        token = token_;
    }

    function factory() external pure returns (address) {
        return BuybackIntegration.PONS_FACTORY;
    }

    function pairToken() external pure returns (address) {
        return address(0);
    }

    function currentSnipeTaxBps(address) external view returns (uint256) {
        return penalty;
    }

    function configure(uint256 spendBps_, uint256 numerator, uint256 denominator, uint256 undercut_)
        external
    {
        spendBps = spendBps_;
        outputNumerator = numerator;
        outputDenominator = denominator;
        undercut = undercut_;
    }

    function setLifecycle(uint256 penalty_, bool ready, bool closed) external {
        penalty = penalty_;
        readyToGraduate = ready;
        graduated = closed;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function buy(uint256 offered, uint256, address recipient)
        external
        payable
        returns (uint256 output)
    {
        require(msg.value == offered);
        uint256 spent = offered * spendBps / 10_000;
        output = spent * outputNumerator / outputDenominator;
        output = output > undercut ? output - undercut : 0;
        if (callbackTarget != address(0)) (callbackSucceeded,) = callbackTarget.call(callbackData);
        require(IERC20(token).transfer(recipient, output));
        if (spent < offered) {
            (bool sent,) = msg.sender.call{value: offered - spent}("");
            require(sent);
        }
    }
}

/// @dev Test-only WETH implementation behind the recorded proxy runtime.
contract SyntheticWrappedEther is ERC20 {
    constructor() ERC20("Synthetic WETH", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
