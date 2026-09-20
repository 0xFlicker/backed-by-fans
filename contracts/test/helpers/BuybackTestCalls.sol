// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @dev Test-only encoding of the initial Pons module's opaque calldata.
library BuybackTestCalls {
    function processPons(
        ProtocolBuybackVault vault,
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amount,
        uint64 policyRevision,
        uint64 deadline
    ) internal {
        vault.process(
            asset,
            bucket,
            amount,
            uint64(1),
            deadline,
            abi.encode(policyRevision, BuybackTypes.TypedRoute(new PoolKey[](0)), new uint256[](0))
        );
    }

    function processPonsOperator(
        ProtocolBuybackVault vault,
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amount,
        BuybackTypes.TypedRoute memory route,
        uint256[] memory minima,
        uint64 deadline
    ) internal {
        vault.process(
            asset, bucket, amount, uint64(1), deadline, abi.encode(uint64(0), route, minima)
        );
    }
}
