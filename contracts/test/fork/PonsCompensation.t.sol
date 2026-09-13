// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {GraduationPhase} from "../../src/interfaces/external/ILaunchpadV2.sol";
import {IPonsLaunchFactory} from "../../src/interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AuthenticAssetFixture} from "./helpers/AuthenticAssetFixture.sol";
import {ForkTierCodeFixture} from "./helpers/ForkTierCodeFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Vm} from "forge-std/Vm.sol";

/// @notice Native trading compensation is measured independently of membership burns.
contract PonsCompensationForkTest is AuthenticAssetFixture {
    function setUp() public override {
        super.setUp();
        _launch(keccak256("native-compensation"));
        _buy(developer, 0.01 ether);
    }

    function _graduateWithCashEarmark() private returns (PoolKey memory key) {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 pending = curve.quoteFeeBalance();
        uint256 earmark = curve.buybackQuoteBalance();
        uint256 creatorBefore = escrow.balanceOf(developer);
        address protocol = curve.protocolFeeRecipient();
        uint256 protocolBefore = escrow.balanceOf(protocol);
        uint256 locked = nativeVault.totalLocked(address(token));
        uint256 net = curve.graduationThreshold() - curve.realQuoteReserve();
        uint256 gross = (net * 10_000 + 9999 - curve.feeBps()) / (10_000 - curve.feeBps());
        vm.deal(trader, gross + 1 ether);
        vm.recordLogs();
        vm.prank(trader);
        curve.buy{value: gross}(gross, 1, trader);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 paidFee;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(curve)
                    && logs[i].topics[0]
                        == keccak256("CurveBuy(address,address,uint256,uint256,uint256,uint256)")
            ) {
                (,, paidFee,) = abi.decode(logs[i].data, (uint256, uint256, uint256, uint256));
            }
        }
        assertGt(paidFee, 0);
        uint256 allFees = pending + paidFee;
        uint256 protocolAmount = allFees * curve.protocolFeeShareBps() / 10_000;
        assertEq(escrow.balanceOf(protocol) - protocolBefore, protocolAmount);
        assertEq(escrow.balanceOf(developer) - creatorBefore, allFees - protocolAmount);
        assertGt(allFees - protocolAmount, earmark);
        assertEq(
            nativeVault.totalLocked(address(token)),
            locked,
            "graduation earmark is creator cash, not a vest deposit"
        );
        assertEq(curve.quoteFeeBalance(), 0);
        assertEq(curve.buybackQuoteBalance(), 0);
        assertEq(
            uint256(PONS.getLaunchedToken(address(token)).phase), uint256(GraduationPhase.Swept)
        );
        vm.prank(trader);
        PONS.createGraduatedPool(address(token));
        IPonsLaunchFactory.LaunchedToken memory launch = PONS.getLaunchedToken(address(token));
        key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(address(token)),
            launch.poolFee,
            launch.tickSpacing,
            IHooks(Integration.MEME_HOOK)
        );
        emit log_named_uint(
            "Graduation creator cash including former earmark", allFees - protocolAmount
        );
    }

    function _poolSweepAndReconcile(PoolKey memory key) private returns (uint256 added) {
        bytes32 poolId = PoolId.unwrap(PoolIdLibrary.toId(key));
        uint256 creatorBefore = escrow.balanceOf(developer);
        address protocol = curve.protocolFeeRecipient();
        uint256 protocolBefore = escrow.balanceOf(protocol);
        uint256 locked = nativeVault.totalLocked(address(token));
        vm.recordLogs();
        // Labeled simulated participation by the existing external operator;
        // no external permission, liquidity, or token storage is modified.
        vm.prank(hook.feeSweepOperator());
        hook.sweepPoolFees(poolId, 1, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool swept;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(hook)
                    && logs[i].topics[0]
                        == keccak256("PoolFeesSwept(bytes32,uint256,uint256,uint256,uint256)")
            ) {
                (
                    uint256 protocolCash,
                    uint256 buybackSpent,
                    uint256 creatorCash,
                    uint256 tokensLocked
                ) = abi.decode(logs[i].data, (uint256, uint256, uint256, uint256));
                assertEq(escrow.balanceOf(protocol) - protocolBefore, protocolCash);
                assertEq(escrow.balanceOf(developer) - creatorBefore, creatorCash);
                added = nativeVault.totalLocked(address(token)) - locked;
                assertEq(added, tokensLocked);
                assertGt(added, 0);
                assertGt(buybackSpent, 0);
                emit log_named_uint("Pool native quote actually spent into vest", buybackSpent);
                emit log_named_uint("Pool tokens actually deposited into vest", added);
                swept = true;
            }
        }
        assertTrue(swept);
        assertEq(hook.pendingFees(poolId, address(0)), 0);
        assertEq(hook.pendingFees(poolId, address(token)), 0);
        assertEq(hook.pendingBuyback(poolId, address(0)), 0);
        assertEq(hook.pendingBuyback(poolId, address(token)), 0);
    }

    function test_actualPoolTradingAdditionalDepositsAndFinalClaimsNeverBurnSupply() public {
        uint256 supply = token.totalSupply();
        uint256 curveDeposit = _sweep();
        _buy(developer, 0.001 ether);
        PoolKey memory key = _graduateWithCashEarmark();
        uint256 bought = _tradeAs(trader, key, true, 0.001 ether);
        _tradeAs(trader, key, false, bought / 2);
        uint256 firstPoolDeposit = _poolSweepAndReconcile(key);
        vm.warp(block.timestamp + nativeVault.VESTING_DURATION() / 2);
        uint256 partialRelease = nativeVault.releasable(address(token));
        _releaseAndAssert(developer, partialRelease);
        uint256 vestedBefore = nativeVault.vestedAmount(address(token));
        _tradeAs(trader, key, true, 0.001 ether);
        uint256 secondPoolDeposit = _poolSweepAndReconcile(key);
        assertEq(nativeVault.vestedAmount(address(token)), vestedBefore);
        uint256 total = curveDeposit + firstPoolDeposit + secondPoolDeposit;
        assertEq(nativeVault.totalLocked(address(token)), total);
        vm.warp(block.timestamp + nativeVault.VESTING_DURATION());
        _releaseAndAssert(curve.protocolFeeRecipient(), total - partialRelease);
        address[2] memory beneficiaries = [developer, curve.protocolFeeRecipient()];
        for (uint256 i; i < beneficiaries.length; ++i) {
            address beneficiary = beneficiaries[i];
            uint256 amount = escrow.balanceOfToken(beneficiary, address(token));
            uint256 beforeBalance = token.balanceOf(beneficiary);
            vm.prank(beneficiary);
            escrow.claimToken(address(token));
            assertEq(token.balanceOf(beneficiary) - beforeBalance, amount);
            assertEq(escrow.balanceOfToken(beneficiary, address(token)), 0);
        }
        assertEq(nativeVault.totalReleased(address(token)), total);
        assertEq(token.balanceOf(address(nativeVault)), 0);
        assertEq(token.totalSupply(), supply, "pool trading and vest claims are not burns");
    }

    function test_bondingSweepPaysCreatorETHAndLocksRealTokensWithoutBurning() public {
        uint256 supply = token.totalSupply();
        uint256 fee = curve.quoteFeeBalance();
        uint256 earmark = curve.buybackQuoteBalance();
        address protocolRecipient = curve.protocolFeeRecipient();
        uint256 protocolAmount = fee * curve.protocolFeeShareBps() / 10_000;
        uint256 creatorAmount = fee - protocolAmount - earmark;
        uint256 creatorBefore = escrow.balanceOf(developer);
        uint256 protocolBefore = escrow.balanceOf(protocolRecipient);
        uint256 locked = _sweep();
        assertEq(curve.quoteFeeBalance(), 0);
        assertEq(curve.buybackQuoteBalance(), 0);
        assertEq(escrow.balanceOf(developer) - creatorBefore, creatorAmount);
        assertEq(escrow.balanceOf(protocolRecipient) - protocolBefore, protocolAmount);
        assertEq(token.balanceOf(address(nativeVault)), locked);
        assertEq(nativeVault.totalReleased(address(token)), 0);
        assertEq(token.totalSupply(), supply, "vesting deposit is not a burn");
        (address creator, address protocol, uint16 split) = nativeVault.vestingTerms(address(token));
        assertEq(creator, developer);
        assertEq(protocol, protocolRecipient);
        assertEq(split, curve.protocolFeeShareBps());
        uint256 beforeETH = developer.balance;
        vm.prank(developer);
        uint256 claimed = escrow.claim();
        assertEq(claimed, creatorBefore + creatorAmount);
        assertEq(developer.balance - beforeETH, claimed);
        assertEq(escrow.balanceOf(developer), 0);
        emit log_named_uint("Actual native vault deposit", locked);
        emit log_named_uint("Earned developer ETH", creatorAmount);
    }

    function test_partialAdditionalAndFinalVestingPreserveBothBeneficiaries() public {
        uint256 supply = token.totalSupply();
        uint256 first = _sweep();
        uint256 duration = nativeVault.VESTING_DURATION();
        vm.warp(block.timestamp + duration / 2);
        uint256 partialAmount = nativeVault.releasable(address(token));
        assertEq(partialAmount, first / 2);
        _releaseAndAssert(developer, partialAmount);
        // A later real trade and sweep create another deposit; already vested
        // tokens cannot be relocked by the weighted remaining schedule.
        vm.warp(block.timestamp + 1 days);
        uint256 vestedBefore = nativeVault.vestedAmount(address(token));
        _buy(trader, 0.02 ether);
        uint256 second = _sweep();
        assertEq(nativeVault.vestedAmount(address(token)), vestedBefore);
        assertEq(nativeVault.totalLocked(address(token)), first + second);
        assertGt(nativeVault.vestingStart(address(token)), 0);
        vm.warp(block.timestamp + duration);
        uint256 finalAmount = nativeVault.releasable(address(token));
        assertEq(finalAmount, first + second - partialAmount);
        // Simulated participation by the other authorized Pons beneficiary.
        _releaseAndAssert(curve.protocolFeeRecipient(), finalAmount);
        assertEq(nativeVault.totalReleased(address(token)), first + second);
        assertEq(nativeVault.releasable(address(token)), 0);
        assertEq(token.balanceOf(address(nativeVault)), 0);
        assertEq(token.totalSupply(), supply);
        uint256 claimable = escrow.balanceOfToken(developer, address(token));
        uint256 balanceBefore = token.balanceOf(developer);
        vm.prank(developer);
        uint256 claimed = escrow.claimToken(address(token));
        assertEq(claimed, claimable);
        assertEq(token.balanceOf(developer) - balanceBefore, claimable);
        assertEq(escrow.balanceOfToken(developer, address(token)), 0);
    }

    function test_unavailableOperatorLeavesCompensationPendingAndOtherTradingWorks() public {
        uint256 pending = curve.buybackQuoteBalance();
        vm.prank(developer);
        vm.expectRevert(bytes4(keccak256("InternalSwapRequiresOperator()")));
        curve.sweepFees(1);
        vm.prank(trader);
        vm.expectRevert(bytes4(keccak256("NotFeeSweepOperator()")));
        curve.sweepFees(1);
        assertEq(curve.buybackQuoteBalance(), pending);
        assertEq(nativeVault.totalLocked(address(token)), 0);
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        _buy(trader, 0.01 ether);
        assertGt(curve.buybackQuoteBalance(), pending);
        _sweep();
        vm.warp(block.timestamp + 1 days);
        vm.prank(trader);
        vm.expectRevert(bytes4(keccak256("NotVestBeneficiary()")));
        nativeVault.release(address(token));
        assertEq(nativeVault.totalReleased(address(token)), 0);
    }

    function test_creatorToggleOnlyChangesFutureNativeEarmarks() public {
        uint256 pending = curve.buybackQuoteBalance();
        vm.prank(developer);
        PONS.setBuybackEnabled(address(token), false);
        assertFalse(curve.buybackEnabled());
        _buy(developer, 0.01 ether);
        assertEq(curve.buybackQuoteBalance(), pending, "old earmark survives disablement");
        _sweep();
        vm.prank(developer);
        PONS.setBuybackEnabled(address(token), true);
        _buy(developer, 0.01 ether);
        assertGt(curve.buybackQuoteBalance(), 0);
        vm.prank(trader);
        vm.expectRevert(bytes4(keccak256("NotBuybackController()")));
        PONS.setBuybackEnabled(address(token), false);
    }

    function test_nativeAllocationFallbackPaysCashAndDoesNotConsumeGraduationTokens() public {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 remaining = curve.graduationThreshold() - curve.realQuoteReserve();
        uint256 amount = remaining * 9999 / (10_000 - curve.feeBps());
        vm.deal(trader, amount + 1 ether);
        _buy(trader, amount);
        assertFalse(curve.readyToGraduate());
        uint256 earmark = curve.buybackQuoteBalance();
        uint256 expectedTokens = earmark * curve.tokenReserve() / (curve.quoteReserve() + earmark);
        assertGt(expectedTokens, curve.sellableTokens(), "real allocation fallback precondition");
        uint256 pending = curve.quoteFeeBalance();
        uint256 expectedCash = pending - pending * curve.protocolFeeShareBps() / 10_000;
        uint256 beforeCreator = escrow.balanceOf(developer);
        uint256 beforeTokens = curve.tokenReserve();
        vm.prank(hook.feeSweepOperator());
        curve.sweepFees(1);
        assertEq(escrow.balanceOf(developer) - beforeCreator, expectedCash);
        assertEq(nativeVault.totalLocked(address(token)), 0);
        assertEq(curve.tokenReserve(), beforeTokens);
        assertEq(curve.quoteFeeBalance(), 0);
        assertEq(curve.buybackQuoteBalance(), 0);
    }

    function test_nativeImpactFallbackPaysCreatorWithoutVesting() public {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        vm.deal(trader, 100 ether);
        uint256 iterations;
        // Real round trips accumulate fees while restoring sellable supply. No
        // reserve, fee, issuer permission or external code is patched.
        while (
            curve.buybackQuoteBalance() * 10_000
                        / (curve.quoteReserve() + curve.buybackQuoteBalance())
                    <= curve.maxInternalPriceImpactBps() && iterations < 128
        ) {
            uint256 bought = _buy(
                trader, (curve.graduationThreshold() - curve.realQuoteReserve()) / 2
            );
            vm.startPrank(trader);
            token.approve(address(curve), bought);
            curve.sell(bought, 1, trader);
            vm.stopPrank();
            ++iterations;
        }
        uint256 earmark = curve.buybackQuoteBalance();
        assertGt(
            earmark * 10_000 / (curve.quoteReserve() + earmark), curve.maxInternalPriceImpactBps()
        );
        assertLt(
            earmark * curve.tokenReserve() / (curve.quoteReserve() + earmark),
            curve.sellableTokens()
        );
        uint256 pending = curve.quoteFeeBalance();
        uint256 creatorBefore = escrow.balanceOf(developer);
        vm.prank(hook.feeSweepOperator());
        curve.sweepFees(1);
        assertEq(
            escrow.balanceOf(developer) - creatorBefore,
            pending - pending * curve.protocolFeeShareBps() / 10_000
        );
        assertEq(nativeVault.totalLocked(address(token)), 0);
        assertEq(curve.quoteFeeBalance(), 0);
        assertEq(curve.buybackQuoteBalance(), 0);
        emit log_named_uint("Actual fee-producing round trips", iterations);
    }

    function test_externalRecipientOverrideAndToggleCannotChangeBBFCustody() public {
        new ForkTierCodeFixture().install();
        IERC20[] memory assets = new IERC20[](1);
        assets[0] = token;
        address media = deployCode("OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory");
        MembershipFactory bbf = MembershipFactory(
            deployCode(
                "MembershipFactory.sol:MembershipFactory",
                abi.encode(
                    assets,
                    media,
                    address(this),
                    address(token),
                    MembershipTestConfig.implementation(),
                    MembershipTestConfig.minimumPayments(assets)
                )
            )
        );
        address custody = bbf.buybackVault();
        _sweep();
        address replacement = makeAddr("new-native-fee-recipient");
        address overrideRecipient = makeAddr("external-override-recipient");
        // Explicitly simulated Pons owner participation: the real timelock and
        // creator collision rules are retained, without changing external state directly.
        vm.prank(PONS.owner());
        PONS.setCreatorFeeRecipient(address(token), overrideRecipient);
        (, uint256 effectiveAt,) = PONS.pendingCreatorFeeRecipient(address(token));
        vm.prank(trader);
        vm.expectRevert();
        PONS.executeCreatorFeeRecipientChange(address(token));
        vm.prank(developer);
        PONS.transferCreatorFeeRecipient(address(token), replacement);
        (address vestCreator,,) = nativeVault.vestingTerms(address(token));
        assertEq(vestCreator, replacement);
        assertEq(curve.deployer(), replacement);
        vm.prank(PONS.owner());
        PONS.setBuybackEnabled(address(token), false);
        vm.prank(PONS.owner());
        vm.expectRevert(bytes4(keccak256("NotBuybackController()")));
        PONS.setBuybackEnabled(address(token), true);
        vm.prank(replacement);
        PONS.setBuybackEnabled(address(token), true);
        vm.warp(effectiveAt);
        vm.prank(trader);
        PONS.executeCreatorFeeRecipientChange(address(token));
        assertEq(curve.deployer(), overrideRecipient);
        (vestCreator,,) = nativeVault.vestingTerms(address(token));
        assertEq(vestCreator, overrideRecipient);
        _buy(trader, 0.01 ether);
        _sweep();
        (vestCreator,,) = nativeVault.vestingTerms(address(token));
        assertEq(
            vestCreator, overrideRecipient, "later deposit must not restore launch-time recipient"
        );
        assertEq(bbf.buybackVault(), custody);
        assertEq(bbf.protocolToken(), address(token));
        assertEq(bbf.owner(), address(this));
        assertEq(ProtocolBuybackVault(payable(custody)).factory(), address(bbf));
    }

    function _releaseAndAssert(address beneficiary, uint256 expected) private {
        uint256 creatorBefore = escrow.balanceOfToken(developer, address(token));
        address protocol = curve.protocolFeeRecipient();
        uint256 protocolBefore = escrow.balanceOfToken(protocol, address(token));
        vm.prank(beneficiary);
        uint256 released = nativeVault.release(address(token));
        assertEq(released, expected);
        uint256 protocolAmount = expected * curve.protocolFeeShareBps() / 10_000;
        assertEq(escrow.balanceOfToken(protocol, address(token)) - protocolBefore, protocolAmount);
        assertEq(
            escrow.balanceOfToken(developer, address(token)) - creatorBefore,
            expected - protocolAmount
        );
    }
}
