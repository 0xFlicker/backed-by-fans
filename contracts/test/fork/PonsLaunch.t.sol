// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {
    GraduationPhase,
    IPonsV2LaunchFactory
} from "../../src/interfaces/external/ILaunchpadV2.sol";
import {IPonsLaunchFactory, IPonsLauncherToken} from "../../src/interfaces/external/IPons.sol";
import {PonsForkFixture} from "./helpers/PonsForkFixture.sol";
import {Vm} from "forge-std/Vm.sol";

contract PonsLaunchForkTest is PonsForkFixture {
    function test_authenticETHLaunchAndEntireDeveloperHoldingsPurchased() public {
        vm.recordLogs();
        _launch(keccak256("purchased-launch"));
        IPonsV2LaunchFactory.LaunchedToken memory launch = PONS.getLaunchedToken(address(token));
        assertEq(launch.token, address(token));
        assertEq(launch.curve, address(curve));
        assertEq(launch.deployer, developer);
        assertEq(launch.creatorFeeRecipient, developer);
        assertEq(launch.pairToken, address(0));
        assertEq(uint8(launch.phase), uint8(GraduationPhase.NotGraduated));
        assertTrue(launch.buybackEnabled);
        assertEq(launch.creatorTaxBps, 0);
        assertEq(curve.creatorTaxBps(), 0);
        assertEq(curve.launchSupply(), PONS.getLaunchConfig(0).supply);
        assertEq(IPonsLauncherToken(address(token)).launchFactory(), address(PONS));
        assertEq(IPonsLauncherToken(address(token)).curve(), address(curve));
        uint256 beforeETH = developer.balance;
        uint256 bought = _buy(developer, 0.01 ether);
        assertEq(beforeETH - developer.balance, 0.01 ether);
        assertEq(token.balanceOf(developer), bought);
        assertGt(curve.quoteFeeBalance(), 0);
        assertGt(curve.buybackQuoteBalance(), 0);
        assertEq(nativeVault.totalLocked(address(token)), 0, "enabled is not an executed sweep");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 mintEvents;
        for (uint256 i; i < logs.length; i++) {
            if (
                logs[i].emitter == address(token) && logs[i].topics.length == 3
                    && logs[i].topics[0] == keccak256("Transfer(address,address,uint256)")
                    && logs[i].topics[1] == bytes32(0)
            ) {
                mintEvents++;
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(curve));
                assertEq(abi.decode(logs[i].data, (uint256)), token.totalSupply());
            }
        }
        assertEq(mintEvents, 1);
        emit log_named_address("Authentic Pons token", address(token));
        emit log_named_address("Authentic Pons curve", address(curve));
        emit log_named_uint("Developer ETH purchase", 0.01 ether);
        emit log_named_uint("Purchased developer holdings", bought);
    }

    function test_staleEconomicsAndWrongLaunchFeeFailWithoutGivingTokens() public {
        IPonsLaunchFactory.TokenParams memory params = _params(keccak256("stale-terms"));
        params.expectedEconomics = bytes32(uint256(params.expectedEconomics) ^ 1);
        uint256 fee = PONS.launchFee();
        vm.prank(developer);
        vm.expectRevert();
        PONS.launchToken{value: fee}(params, 0, address(0));
        params = _params(keccak256("wrong-fee"));
        vm.prank(developer);
        vm.expectRevert();
        PONS.launchToken{value: fee + 0.01 ether}(params, 0, address(0));
    }

    function test_holderBurnDoesNotAlterCurveReservesOrGrantMintAuthority() public {
        _launch(keccak256("voluntary-burn"));
        uint256 output = _buy(developer, 0.01 ether);
        uint256 quote = curve.quoteReserve();
        uint256 reserve = curve.tokenReserve();
        uint256 reserved = curve.reservedTokens();
        uint256 supply = token.totalSupply();
        vm.prank(developer);
        IPonsLauncherToken(address(token)).burn(output);
        assertEq(token.totalSupply(), supply - output);
        assertEq(token.balanceOf(developer), 0);
        assertEq(curve.quoteReserve(), quote);
        assertEq(curve.tokenReserve(), reserve);
        assertEq(curve.reservedTokens(), reserved);
        assertFalse(curve.readyToGraduate());
        vm.prank(developer);
        (bool minted,) =
            address(token).call(abi.encodeWithSignature("mint(address,uint256)", developer, output));
        assertFalse(minted);
        assertEq(token.totalSupply(), supply - output);
    }
}
