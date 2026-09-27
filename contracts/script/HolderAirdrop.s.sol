// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {HolderAirdrop} from "../src/HolderAirdrop.sol";
import {IMembershipTier} from "../src/interfaces/IMembershipTier.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

abstract contract HolderAirdropScript is Script {
    address internal constant OPERATOR = 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027;
    address internal constant TIER = 0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B;
    address internal constant TOKEN = 0x68cdeB4985317B7dad73F9C47A7226879721Cb86;

    function _checkChain() internal view {
        require(block.chainid == 46_630, "Robinhood testnet only");
    }

    function _helper() internal view returns (HolderAirdrop helper) {
        _checkChain();
        helper = HolderAirdrop(vm.envAddress("AIRDROP_HELPER"));
        require(address(helper).code.length != 0, "Helper is not deployed");
        require(
            helper.operator() == OPERATOR && address(helper.tier()) == TIER
                && address(helper.paymentToken()) == TOKEN && helper.pricePerPeriod() == 1000e6
                && helper.periodDuration() == 30 days && helper.ethAmount() == 0.01 ether,
            "Wrong helper configuration"
        );
    }

    function _plan() internal view returns (string memory json) {
        json = vm.readFile(vm.envOr("AIRDROP_PLAN", string("deployments/holder-airdrop-plan.json")));
        require(vm.parseJsonUint(json, ".chainId") == 46_630, "Wrong plan chain");
        require(vm.parseJsonAddress(json, ".tier") == TIER, "Wrong plan tier");
        require(vm.parseJsonAddress(json, ".operator") == OPERATOR, "Wrong plan operator");
        require(vm.parseJsonAddress(json, ".paymentToken") == TOKEN, "Wrong plan payment token");
    }

    function _slice(address[] memory all, uint256 start, uint256 count)
        internal
        pure
        returns (address[] memory batch)
    {
        require(start < all.length && count > 0 && count <= 25, "Invalid recipient range");
        uint256 end = start + count;
        if (end > all.length) end = all.length;
        batch = new address[](end - start);
        for (uint256 i; i < batch.length; ++i) {
            batch[i] = all[start + i];
        }
    }
}

contract DeployHolderAirdrop is HolderAirdropScript {
    function run() external returns (HolderAirdrop helper) {
        _checkChain();
        require(address(IMembershipTier(TIER).paymentToken()) == TOKEN, "Wrong tier token");
        vm.startBroadcast(OPERATOR);
        helper = new HolderAirdrop(OPERATOR, IMembershipTier(TIER), 1000e6, 30 days, 0.01 ether);
        vm.stopBroadcast();
        console2.log("Holder airdrop helper", address(helper));
    }
}

/// @notice Idempotently import old script deliveries before executing new batches.
contract ImportHolderAirdropProgress is HolderAirdropScript {
    function run() external {
        HolderAirdrop helper = _helper();
        string memory json = _plan();
        address[] memory eth = vm.parseJsonAddressArray(json, ".ethCompleted");
        address[] memory memberships = vm.parseJsonAddressArray(json, ".membershipCompleted");
        vm.startBroadcast(OPERATOR);
        for (uint256 i; i < eth.length; i += 25) {
            helper.recordCompleted(_slice(eth, i, 25), true, false);
        }
        for (uint256 i; i < memberships.length; i += 25) {
            helper.recordCompleted(_slice(memberships, i, 25), false, true);
        }
        vm.stopBroadcast();
    }
}

/// @notice Approve the helper from the wallet first; amount is in raw six-decimal units.
contract FundHolderAirdrop is HolderAirdropScript {
    function run() external {
        HolderAirdrop helper = _helper();
        uint256 tokens = vm.envUint("AIRDROP_FUND_TOKENS");
        uint256 native = vm.envUint("AIRDROP_FUND_WEI");
        vm.startBroadcast(OPERATOR);
        require(helper.paymentToken().approve(address(helper), tokens), "Approval failed");
        helper.fund{value: native}(tokens);
        vm.stopBroadcast();
    }
}

/// @notice Splits a recipient range into bounded transactions. Repeat any range safely.
contract ExecuteHolderAirdrop is HolderAirdropScript {
    function run() external {
        HolderAirdrop helper = _helper();
        string memory json = _plan();
        address[] memory eth = vm.parseJsonAddressArray(json, ".ethCompleted");
        address[] memory memberships = vm.parseJsonAddressArray(json, ".membershipCompleted");
        address[] memory recipients = vm.parseJsonAddressArray(json, ".recipients");
        uint256 start = vm.envOr("AIRDROP_START", uint256(0));
        uint256 count = vm.envOr("AIRDROP_COUNT", uint256(25));
        require(start < recipients.length && count > 0, "Invalid recipient range");
        uint256 end = start + count;
        if (end > recipients.length) end = recipients.length;
        _checkImports(helper, recipients, start, end, eth, memberships);
        console2.log("First recipient index", start);
        console2.log("End recipient index (exclusive)", end);
        vm.startBroadcast(OPERATOR);
        for (uint256 i = start; i < end; i += 25) {
            uint256 size = end - i;
            if (size > 25) size = 25;
            helper.distribute(_slice(recipients, i, size));
        }
        vm.stopBroadcast();
    }

    /// @dev Only legacy recipients in this range need an onchain import check.
    function _checkImports(
        HolderAirdrop helper,
        address[] memory recipients,
        uint256 start,
        uint256 end,
        address[] memory eth,
        address[] memory memberships
    ) internal view {
        for (uint256 i = start; i < end; ++i) {
            address recipient = recipients[i];
            if (_contains(eth, recipient)) {
                require(helper.ethCompleted(recipient), "Import old ETH progress first");
            }
            if (_contains(memberships, recipient)) {
                require(
                    helper.membershipCompleted(recipient), "Import old membership progress first"
                );
            }
        }
    }

    function _contains(address[] memory recipients, address recipient) private pure returns (bool) {
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == recipient) return true;
        }
        return false;
    }
}
