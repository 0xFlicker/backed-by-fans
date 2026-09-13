// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTierHarness} from "../mocks/MembershipTierHarness.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Vm} from "forge-std/Vm.sol";

import {TierImplementationBuild} from "../../script/TierImplementationDeployment.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";

library MembershipTestConfig {
    function minimumPayments(IERC20[] memory tokens)
        internal
        pure
        returns (uint112[] memory minima)
    {
        minima = new uint112[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            minima[i] = 1;
        }
    }

    function implementation() internal pure returns (address) {
        return TierImplementationBuild.implementation();
    }

    function deployTier(address factory, IERC20 token, MembershipTypes.TierConfig memory config)
        internal
        returns (MembershipTier)
    {
        return MembershipCloneFixture(address(0xBBF005)).deploy(factory, token, config, false);
    }

    function deployHarness(
        address factory,
        IERC20 token,
        address,
        MembershipTypes.TierConfig memory config
    ) internal returns (MembershipTierHarness) {
        return MembershipTierHarness(
            address(MembershipCloneFixture(address(0xBBF005)).deploy(factory, token, config, true))
        );
    }

    function defaultConfig(address creator, address renderer, address paymentToken)
        internal
        pure
        returns (MembershipTypes.TierConfig memory)
    {
        return MembershipTypes.TierConfig({
            creator: creator,
            tierSalt: keccak256(abi.encode("default-tier", creator)),
            renderer: renderer,
            paymentToken: paymentToken,
            name: "Creator Backers",
            symbol: "BACK",
            pricePerPeriod: 10_000_000,
            minimumPayment: 1,
            periodDuration: 30 days,
            protocolFeeBps: 100,
            rewardBps: 500,
            referralBps: 100,
            startingBoostBps: 10_000,
            earlySupportGross: 0,
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

    function paymentTokens(IERC20 token) internal pure returns (IERC20[] memory tokens) {
        tokens = new IERC20[](1);
        tokens[0] = token;
    }

    function paymentTokens(IERC20 first, IERC20 second)
        internal
        pure
        returns (IERC20[] memory tokens)
    {
        tokens = new IERC20[](2);
        tokens[0] = first;
        tokens[1] = second;
    }
}

/// @dev External fixture boundary preserves expectRevert around clone creation and initialization.
contract MembershipCloneFixture {
    function deploy(
        address factory,
        IERC20 token,
        MembershipTypes.TierConfig memory config,
        bool harness
    ) external returns (MembershipTier tier) {
        config.paymentToken = address(token);
        address implementation = harness
            ? address(new MembershipTierHarness())
            : TierImplementationBuild.implementation();
        tier = MembershipTier(Clones.clone(implementation));
        Vm(address(uint160(uint256(keccak256("hevm cheat code"))))).prank(factory);
        tier.initialize(config);
    }
}
