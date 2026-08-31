// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../../src/types/MembershipTypes.sol";

library MembershipTestConfig {
    function defaultConfig(address creator, address renderer)
        internal
        pure
        returns (MembershipTypes.TierConfig memory)
    {
        return MembershipTypes.TierConfig({
            creator: creator,
            tierSalt: keccak256(abi.encode("default-tier", creator)),
            renderer: renderer,
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
                externalURI: "https://example.com/membership"
            }),
            art: MembershipTypes.ArtConfig({
                engine: 0,
                collectionSeed: 0x0123456789abcdef0123456789abcdef,
                palette: 0,
                intensity: 64,
                density: 56,
                symmetry: 2,
                typographyScale: 52,
                typographyStyle: 0,
                textVisibility: 1,
                imageFit: MembershipTypes.ImageFit.Cover,
                focalX: 50,
                focalY: 50,
                grain: 36,
                mediaMix: 55,
                primary: 52,
                secondary: 48,
                tertiary: 44
            }),
            media: MembershipTypes.MediaConfig({
                mime: MembershipTypes.MediaMIME.None,
                store: address(0),
                length: 0,
                digest: bytes32(0),
                runtimeCodehash: bytes32(0)
            })
        });
    }
}
