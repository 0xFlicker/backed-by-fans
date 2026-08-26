// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../../src/types/MembershipTypes.sol";

library MembershipTestConfig {
    function defaultConfig(address creator)
        internal
        pure
        returns (MembershipTypes.TierConfig memory)
    {
        return MembershipTypes.TierConfig({
            creator: creator,
            name: "Creator Backers",
            symbol: "BACK",
            pricePerPeriod: 10_000_000,
            periodDuration: 30 days,
            rewardBps: 500,
            referralBps: 100,
            supplyCap: 0,
            maxPrepaidPeriods: 12,
            metadata: MembershipTypes.TierMetadata({
                description: "Independent creator membership",
                imageURI: "ipfs://creator-image",
                externalURI: "https://example.com/membership"
            })
        });
    }
}
