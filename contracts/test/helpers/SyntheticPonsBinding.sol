// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {
    GraduationPhase,
    IPonsV2LaunchFactory
} from "../../src/interfaces/external/ILaunchpadV2.sol";
import {IPonsLaunchFactory} from "../../src/interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {Vm} from "forge-std/Vm.sol";

/// @dev Synthetic dependency identity fixture ONLY. Canonical runtime bytes are
/// installed locally and selected launch reads are mocked. Never import this
/// helper into fork acceptance or deployment scripts; it proves no live launch.
library SyntheticPonsBinding {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function bind(address token) internal {
        if (token.code.length == 0) return;
        installDependencies();
        VM.mockCall(
            token, abi.encodeWithSignature("factory()"), abi.encode(Integration.PONS_FACTORY)
        );
        VM.mockCall(token, abi.encodeWithSignature("token()"), abi.encode(token));
        VM.mockCall(token, abi.encodeWithSignature("pairToken()"), abi.encode(address(0)));
        VM.mockCall(token, abi.encodeWithSignature("readyToGraduate()"), abi.encode(false));
        VM.mockCall(token, abi.encodeWithSignature("graduated()"), abi.encode(false));
        VM.mockCall(
            token, abi.encodeWithSignature("currentSnipeTaxBps(address)"), abi.encode(uint256(0))
        );
        bindLaunch(token, token);
    }

    function installDependencies() internal {
        string memory json = VM.readFile("external/verification/4663/dependency-runtimes.json");
        _install(json, "factory", Integration.PONS_FACTORY);
        _install(json, "router", Integration.ROUTER);
        _install(json, "permit2", Integration.PERMIT2);
        _install(json, "weth", Integration.WETH);
        _install(json, "memeHook", Integration.MEME_HOOK);
        _install(json, "poolManager", Integration.POOL_MANAGER);
    }

    function bindLaunch(address token, address curve) internal {
        VM.mockCall(
            token, abi.encodeWithSignature("launchFactory()"), abi.encode(Integration.PONS_FACTORY)
        );
        VM.mockCall(token, abi.encodeWithSignature("curve()"), abi.encode(curve));
        IPonsLaunchFactory.LaunchedToken memory launch;
        launch.token = token;
        launch.curve = curve;
        launch.exists = true;
        launch.phase = GraduationPhase.NotGraduated;
        VM.mockCall(
            Integration.PONS_FACTORY,
            abi.encodeCall(IPonsV2LaunchFactory.getLaunchedToken, (token)),
            abi.encode(launch)
        );
    }

    function _install(string memory json, string memory role, address target) private {
        VM.etch(target, VM.parseJsonBytes(json, string.concat(".", role, ".code")));
    }
}
