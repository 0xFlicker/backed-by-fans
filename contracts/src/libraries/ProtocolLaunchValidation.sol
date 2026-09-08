// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {
    IPonsBondingCurve,
    IPonsLaunchFactory,
    IPonsLauncherToken
} from "../interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "./BuybackIntegration.sol";

library ProtocolLaunchValidation {
    error InvalidProtocolLaunch();

    function validate(address token) internal view returns (address curve) {
        if (
            token.code.length == 0
                || Integration.PONS_FACTORY.codehash != Integration.PONS_FACTORY_HASH
        ) revert InvalidProtocolLaunch();
        IPonsLaunchFactory pons = IPonsLaunchFactory(Integration.PONS_FACTORY);
        IPonsLaunchFactory.LaunchedToken memory launch = pons.getLaunchedToken(token);
        curve = launch.curve;
        if (
            !launch.exists || launch.token != token || launch.pairToken != address(0)
                || curve.code.length == 0
                || IPonsLauncherToken(token).launchFactory() != address(pons)
                || IPonsLauncherToken(token).curve() != curve
                || IPonsBondingCurve(curve).factory() != address(pons)
                || IPonsBondingCurve(curve).token() != token
                || IPonsBondingCurve(curve).pairToken() != address(0)
                || pons.poolManager() != Integration.POOL_MANAGER
                || pons.permit2() != Integration.PERMIT2 || pons.memeHook() != Integration.MEME_HOOK
        ) revert InvalidProtocolLaunch();
    }
}
