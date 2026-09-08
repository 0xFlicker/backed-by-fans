// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IPonsV2FeeEscrow} from "../../../src/interfaces/external/ILaunchpadV2.sol";
import {
    IPonsBondingCurve,
    IPonsBuybackVault,
    IPonsLaunchFactory,
    IPonsMemeHook
} from "../../../src/interfaces/external/IPons.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Authentic fork fixture. Only local ETH funding and explicitly labeled
/// external participation use cheatcodes; no deployed code/storage/token supply is patched.
abstract contract PonsForkFixture is Test {
    uint256 internal constant ORIGIN_BLOCK = 57_010_735;
    bytes32 internal constant ORIGIN_HASH =
        0xdfc65146f32cfd10afd9a620b68c3fc5d02077677ce06c46303e49e80f0a96cf;
    IPonsLaunchFactory internal constant PONS =
        IPonsLaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address internal developer;
    address internal trader;
    IPonsBondingCurve internal curve;
    IERC20 internal token;
    IPonsBuybackVault internal nativeVault;
    IPonsMemeHook internal hook;
    IPonsV2FeeEscrow internal escrow;

    function setUp() public virtual {
        if (!vm.envOr("RUN_PROTOCOL_FORK_TESTS", false)) {
            vm.skip(true, "explicit authentic fork opt-in required");
        }
        // Check the pinned header through its immediate child's blockhash, then
        // roll back before any mutation. This uses the installed Foundry surface.
        vm.createSelectFork(vm.envString("BBF_FORK_RPC_URL"), ORIGIN_BLOCK + 1);
        assertEq(block.chainid, 4663, "wrong origin chain");
        assertEq(blockhash(ORIGIN_BLOCK), ORIGIN_HASH, "wrong origin block hash");
        vm.rollFork(ORIGIN_BLOCK);
        assertEq(block.number, ORIGIN_BLOCK);
        assertEq(
            address(PONS).codehash,
            0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84,
            "Pons runtime changed"
        );
        vm.chainId(31_337);
        developer = makeAddr("fork-local-developer");
        trader = makeAddr("fork-local-trader");
        vm.deal(developer, 20 ether);
        vm.deal(trader, 20 ether);
        hook = IPonsMemeHook(PONS.memeHook());
        escrow = IPonsV2FeeEscrow(PONS.feeEscrow());
        nativeVault = IPonsBuybackVault(PONS.buybackVault());
        assertTrue(PONS.canLaunch(developer), "ordinary fresh deployer cannot launch");
        assertEq(nativeVault.factory(), address(PONS));
    }

    function _params(bytes32 salt)
        internal
        view
        returns (IPonsLaunchFactory.TokenParams memory params)
    {
        params = IPonsLaunchFactory.TokenParams({
            name: "Backed By Fans Fork Protocol",
            symbol: "BBFFORK",
            logo: "",
            description: "Disposable authentic integration fixture",
            socials: IPonsLaunchFactory.Socials("", "", "", "", ""),
            creatorFeeRecipient: developer,
            creatorTaxBps: 0,
            buybackEnabled: true,
            expectedEconomics: PONS.previewLaunchEconomics(0, address(0)),
            salt: salt
        });
        assertNotEq(params.expectedEconomics, bytes32(0));
    }

    function _launch(bytes32 salt) internal {
        IPonsLaunchFactory.TokenParams memory params = _params(salt);
        uint256 fee = PONS.launchFee();
        uint256 beforeBalance = developer.balance;
        vm.prank(developer);
        (address tokenAddress, address curveAddress) =
            PONS.launchToken{value: fee}(params, 0, address(0));
        token = IERC20(tokenAddress);
        curve = IPonsBondingCurve(curveAddress);
        assertEq(beforeBalance - developer.balance, fee, "launch fee includes no purchase");
        assertEq(token.balanceOf(developer), 0, "no free developer tokens");
        assertEq(
            token.balanceOf(curveAddress), token.totalSupply(), "entire supply belongs to the curve"
        );
        assertEq(curve.currentSnipeTaxBps(developer), 0);
    }

    function _buy(address buyer, uint256 amount) internal returns (uint256 output) {
        assertEq(curve.currentSnipeTaxBps(buyer), 0, "wait for recipient penalty to expire");
        uint256 net = amount - amount * curve.feeBps() / 10_000;
        uint256 expected = net * curve.tokenReserve() / (curve.quoteReserve() + net);
        uint256 beforeBalance = token.balanceOf(buyer);
        vm.prank(buyer);
        output = curve.buy{value: amount}(amount, expected, buyer);
        assertEq(output, expected, "independent small-trade quote");
        assertEq(token.balanceOf(buyer) - beforeBalance, output);
    }

    function _sweep() internal returns (uint256 locked) {
        uint256 earmark = curve.buybackQuoteBalance();
        assertGt(earmark, 0);
        uint256 expected = earmark * curve.tokenReserve() / (curve.quoteReserve() + earmark);
        uint256 beforeLocked = nativeVault.totalLocked(address(token));
        // Simulated external participation: membership processing must never need this role.
        vm.prank(hook.feeSweepOperator());
        curve.sweepFees(expected);
        locked = nativeVault.totalLocked(address(token)) - beforeLocked;
        assertEq(locked, expected, "eligible native sweep must really deposit tokens");
        assertGt(locked, 0);
    }
}
