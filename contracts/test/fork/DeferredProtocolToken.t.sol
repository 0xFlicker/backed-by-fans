// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AuthenticAssetFixture} from "./helpers/AuthenticAssetFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract DeferredProtocolTokenForkTest is AuthenticAssetFixture {
    function test_membershipEarnsBeforeAuthenticLaunchThenBurnsAfterBinding() public {
        IERC20[] memory assets = new IERC20[](1);
        assets[0] = IERC20(Integration.WETH);
        MembershipFactory factory = MembershipFactory(
            deployCode(
                "MembershipFactory.sol:MembershipFactory",
                abi.encode(
                    assets,
                    deployCode("OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory"),
                    address(this),
                    address(0)
                )
            )
        );
        ProtocolBuybackVault vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        assertEq(factory.protocolToken(), address(0));
        assertEq(vault.executor(), address(0));
        uint256 acquired = _acquire(Integration.WETH, trader, 0.001 ether);
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this),
            deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer"),
            Integration.WETH
        );
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = acquired / 4;
        config.periodDuration = 100;
        MembershipTier tier = MembershipTier(factory.createTier(config));
        vm.startPrank(trader);
        assets[0].approve(address(tier), acquired);
        uint256 id = tier.purchase(4, address(0));
        vm.stopPrank();
        vm.warp(block.timestamp + 100);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        tier.accrueProtocolFees(ids);
        uint256 released = tier.releaseProtocolFees();
        assertGt(released, 0);
        assertEq(address(vault).balance, released);
        assertEq(
            uint256(
                vault.processingStatus(address(0), BuybackTypes.SourceBucket.Membership).status
            ),
            uint256(BuybackTypes.Status.TokenNotLaunched)
        );
        uint256 reserved = tier.protocolFeeHoldings();

        _launch(keccak256("deferred-protocol-token"));
        factory.bindProtocolToken(address(token));
        assertEq(address(vault).balance, released);
        assertEq(tier.protocolFeeHoldings(), reserved);
        BuybackTypes.TypedRoute memory route;
        vault.setRoute(address(0), route);
        vault.setLimits(
            address(0), BuybackTypes.ExecutionLimits(1, SafeCast.toUint128(released), 0)
        );
        vault.setBuybacksPaused(false);
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 supply = token.totalSupply();
        uint64 revision = vault.revision(address(0));
        vm.prank(trader);
        vault.process(
            address(0),
            BuybackTypes.SourceBucket.Membership,
            released,
            revision,
            uint64(block.timestamp)
        );
        assertLt(token.totalSupply(), supply);
        assertEq(address(vault).balance, 0);
        assertEq(tier.protocolFeeHoldings(), reserved);
        assertEq(
            vault.inventory(address(0), BuybackTypes.SourceBucket.Membership).totalSpent, released
        );
    }
}
