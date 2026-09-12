// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {SyntheticConversionBinding} from "../helpers/SyntheticConversionBinding.sol";
import {SyntheticPonsBinding} from "../helpers/SyntheticPonsBinding.sol";
import {AdversarialERC20} from "../mocks/AdversarialERC20.sol";
import {FaultBondingCurve, FaultBurnToken} from "../mocks/BuybackFaults.sol";
import {BuybackModel} from "../models/BuybackModel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract BuybackHandler is Test {
    using BuybackModel for BuybackModel.Book;
    ProtocolBuybackVault public immutable vault;
    MembershipTier public immutable tier;
    FaultBurnToken public immutable token;
    FaultBondingCurve public immutable curve;
    AdversarialERC20 public immutable payment;
    BuybackModel.Book private _book;
    mapping(address => uint256) public unsynchronized;
    uint256 public issued;
    uint256 public released;
    uint256 public recognized;
    uint256 public marketSuccesses;
    uint256 public rejectedFaults;
    uint256 private immutable _started;
    uint256 private immutable _id;

    struct Attempt {
        address asset;
        uint8 bucket;
        uint256 amount;
        uint256 quote;
        uint256 spend;
        bool direct;
        bool failure;
    }

    constructor(
        ProtocolBuybackVault vault_,
        MembershipTier tier_,
        FaultBurnToken token_,
        FaultBondingCurve curve_,
        AdversarialERC20 payment_,
        uint256 id
    ) {
        vault = vault_;
        tier = tier_;
        token = token_;
        curve = curve_;
        payment = payment_;
        _id = id;
        _started = block.timestamp;
        issued = token_.totalSupply();
    }

    function _asset(uint256 seed) private view returns (address) {
        return seed % 3 == 0 ? address(0) : seed % 3 == 1 ? address(token) : address(payment);
    }

    function donate(uint256 assetSeed, uint96 raw, bool synchronize) external {
        address asset = _asset(assetSeed);
        uint256 amount = uint256(raw) % 1000 + 1;
        if (asset == address(0)) {
            vm.deal(address(this), amount);
            (bool ok,) = address(vault).call{value: amount}("");
            assertTrue(ok);
        } else if (asset == address(token)) {
            token.mint(address(vault), amount);
            issued += amount;
        } else {
            payment.mint(address(vault), amount);
        }
        unsynchronized[asset] += amount;
        if (synchronize) _sync(asset);
    }

    function sync(uint256 seed) external {
        _sync(_asset(seed));
    }

    function _sync(address asset) private {
        uint256 expected = unsynchronized[asset];
        vm.prank(address(0xC011EC7));
        assertEq(vault.syncDonation(asset), expected);
        _book.receiveFunds(asset, 1, expected);
        unsynchronized[asset] = 0;
    }

    function checkpoint(uint16 timeSeed, bool releaseNow) external {
        vm.warp(block.timestamp + uint256(timeSeed) % 51);
        uint256 elapsed = block.timestamp - _started;
        if (elapsed > 1200) elapsed = 1200;
        recognized = elapsed * 600 / 1200;
        vm.prank(address(0xA));
        tier.processAccounting(25);
        if (releaseNow) _release();
    }

    function release() external {
        _release();
    }

    function _release() private {
        uint256 expected = recognized - released;
        vm.prank(address(0xB));
        assertEq(tier.releaseProtocolFees(), expected);
        released += expected;
        _book.receiveFunds(address(token), 0, expected);
    }

    function process(
        uint256 assetSeed,
        uint256 bucketSeed,
        uint128 inputSeed,
        uint16 fillSeed,
        uint8 faultSeed
    ) external {
        Attempt memory a;
        a.asset = _asset(assetSeed);
        a.bucket = bucketSeed % 2 == 0 ? 0 : 1;
        uint256 available = _book.available(a.asset, a.bucket);
        if (available == 0) return;
        uint256 cap = a.asset == address(payment) ? 100 : 1 ether;
        uint256 maximum = available < cap ? available : cap;
        a.amount = uint256(inputSeed) % maximum + 1;
        uint256 fill = uint256(fillSeed) % 10_000 + 1;
        a.quote = a.asset == address(payment) ? a.amount * 1e16 : a.amount;
        a.spend = a.quote * fill / 10_000;
        uint256 fault = uint256(faultSeed) % 5;
        a.direct = a.asset == address(token);
        a.failure = (!a.direct && a.spend == 0) || fault == 1 || fault == 2
            || (!a.direct && fault == 3 && a.spend <= 1)
            || (a.asset == address(payment) && fault == 4);
        curve.configure(fill, 1, 1, fault == 3 ? 1 : 0);
        token.setBurnMode(fault == 1 ? 1 : fault == 2 ? 2 : 0);
        if (a.asset == address(payment) && fault == 4) {
            payment.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
            payment.setTransferFromBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        }
        curve.setCallback(address(vault), abi.encodeCall(vault.syncDonation, (a.asset)));
        vm.prank(address(uint160(100 + uint256(inputSeed) % 10)));
        try vault.process(
            a.asset,
            BuybackTypes.SourceBucket(a.bucket),
            a.amount,
            a.direct ? 0 : 2,
            SafeCast.toUint64(block.timestamp)
        ) {
            assertFalse(a.failure, "fault unexpectedly consumed inventory");
            if (a.direct) {
                _book.burn(address(token), a.bucket, a.amount);
            } else {
                if (a.asset == address(payment)) {
                    _book.convert(a.asset, address(0), a.bucket, a.amount, a.quote);
                }
                uint256 acquired = a.spend - (fault == 3 ? 1 : 0);
                _book.convert(address(0), address(token), a.bucket, a.spend, acquired);
                _book.burn(address(token), a.bucket, acquired);
                marketSuccesses++;
                assertFalse(curve.callbackSucceeded());
            }
        } catch {
            assertTrue(a.failure, "unexplained settlement failure");
            rejectedFaults++;
        }
        token.setBurnMode(0);
        payment.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        payment.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
    }

    function assertModel() external view {
        uint256 burned;
        for (uint256 a; a < 3; ++a) {
            address asset = _asset(a);
            uint256 total;
            for (uint8 b; b < 2; ++b) {
                BuybackTypes.Inventory memory actual =
                    vault.inventory(asset, BuybackTypes.SourceBucket(b));
                BuybackModel.Balance storage expected = _book.balances[asset][b];
                assertEq(actual.available, _book.available(asset, b));
                assertEq(actual.totalReceived, expected.received);
                assertEq(actual.totalConvertedIn, expected.converted);
                assertEq(actual.totalSpent, expected.spent);
                assertEq(actual.totalBurned, expected.burned);
                total += actual.available;
                burned += actual.totalBurned;
            }
            uint256 balance = asset == address(0)
                ? address(vault).balance
                : IERC20(asset).balanceOf(address(vault));
            assertEq(balance, total + unsynchronized[asset]);
        }
        assertEq(token.totalSupply(), issued - burned);
        assertEq(token.balanceOf(address(tier)), 1200 - released);
        assertEq(
            tier.reserveState().unearnedScaled[3] + tier.protocolFeeEarnedHeld()
                * tier.ACCOUNTING_SCALE()
                + tier.previewAccounting(0, address(0), address(0), 0).settled.fractionalScaled[3],
            (600 - released) * tier.ACCOUNTING_SCALE()
        );
        assertEq(tier.protocolFeeEarnedHeld(), recognized - released);
        uint256 elapsed = block.timestamp - _started;
        if (elapsed > 1200) elapsed = 1200;
        assertApproxEqAbs(tier.creatorProceeds(), elapsed * 240 / 1200, 1);
        assertEq(tier.totalProtectedLiability(), 1200 - released);
        assertEq(token.balanceOf(vault.executor()), 0);
        assertEq(address(vault.executor()).balance, 0);
        assertEq(payment.balanceOf(vault.executor()), 0);
        assertEq(payment.allowance(vault.executor(), Integration.PERMIT2), 0);
        (uint160 allowance,,) = IAllowanceTransfer(Integration.PERMIT2)
            .allowance(vault.executor(), address(payment), Integration.ROUTER);
        assertEq(allowance, 0);
    }
}

/// @notice Stateful synthetic fault suite, never classified as authentic venue evidence.
contract BuybackInvariantTest is StdInvariant, Test {
    BuybackHandler private _handler;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        FaultBurnToken token = new FaultBurnToken();
        FaultBondingCurve curve = new FaultBondingCurve(address(token));
        token.mint(address(curve), 1e30);
        AdversarialERC20 payment = new AdversarialERC20();
        SyntheticPonsBinding.installDependencies();
        SyntheticPonsBinding.bindLaunch(address(token), address(curve));
        SyntheticConversionBinding.install();
        address media = deployCode("OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory");
        IERC20[] memory assets =
            MembershipTestConfig.paymentTokens(IERC20(address(token)), IERC20(address(payment)));
        MembershipFactory factory = MembershipFactory(
            deployCode(
                "MembershipFactory.sol:MembershipFactory",
                abi.encode(
                    assets,
                    media,
                    address(this),
                    address(token),
                    MembershipTestConfig.tierCode(),
                    MembershipTestConfig.minimumPayments(assets)
                )
            )
        );
        ProtocolBuybackVault vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        vault.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(payment)), 100, 1, IHooks(address(0))
        );
        vault.setRoute(address(payment), BuybackTypes.TypedRoute(pools));
        vault.setLimits(address(0), BuybackTypes.ExecutionLimits(1, 1 ether, 0));
        vault.setLimits(address(payment), BuybackTypes.ExecutionLimits(1, 100, 0));
        vault.setBuybacksPaused(false);
        address renderer = deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer");
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, address(token));
        config.protocolFeeBps = 5000;
        config.rewardBps = 2000;
        config.referralBps = 1000;
        config.pricePerPeriod = 100;
        config.periodDuration = 100;
        MembershipTier tier = MembershipTier(factory.createTier(config));
        token.mint(address(0xDEAD), 1200);
        vm.startPrank(address(0xDEAD));
        token.approve(address(tier), 1200);
        uint256 id = tier.createMembership(12, address(0xCAFE));
        vm.stopPrank();
        _handler = new BuybackHandler(vault, tier, token, curve, payment, id);
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = BuybackHandler.donate.selector;
        selectors[1] = BuybackHandler.sync.selector;
        selectors[2] = BuybackHandler.checkpoint.selector;
        selectors[3] = BuybackHandler.release.selector;
        selectors[4] = BuybackHandler.process.selector;
        targetSelector(FuzzSelector(address(_handler), selectors));
        targetContract(address(_handler));
    }

    function invariant_rawAssetConservationExactBurnAndProtectedLiabilities() public view {
        _handler.assertModel();
    }
}
