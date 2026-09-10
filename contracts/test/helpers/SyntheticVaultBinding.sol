// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {SyntheticPonsBinding} from "./SyntheticPonsBinding.sol";
import {Vm} from "forge-std/Vm.sol";

/// @notice Synthetic registry binding for isolated direct-tier tests only.
/// @dev Preserves fixture factory identities. Real factory registration and deployment are
/// tested separately; this helper must never be imported by fork acceptance or production.
library SyntheticVaultBinding {
    Vm private constant _VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function bind(address factory, address token) internal returns (address) {
        SyntheticPonsBinding.bind(token);
        _VM.prank(factory);
        ProtocolBuybackVault vault = new ProtocolBuybackVault(factory, token);
        _VM.mockCall(factory, abi.encodeWithSignature("buybackVault()"), abi.encode(address(vault)));
        _VM.mockCall(
            factory, abi.encodeWithSignature("isRegisteredTier(address)"), abi.encode(true)
        );
        _VM.mockCall(
            factory, abi.encodeWithSignature("minimumPayment(address)"), abi.encode(uint112(1))
        );
        return factory;
    }
}
