// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import {Actor} from "./Actor.sol";
import {Clamp} from "./utils/Clamp.sol";
import {DecimalPrinter} from "./utils/DecimalPrinter.sol";
import {Deployer} from "./utils/Deployer.sol";
import {vm} from "./utils/Hevm.sol";
import {Logger} from "./utils/Logger.sol";
import {Math} from "./utils/Math.sol";
import {MockERC20} from "./utils/MockERC20.sol";
import {StringUtils} from "./utils/StringUtils.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {VestingLedger} from "../../src/libraries/VestingLedger.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Base contract with state variables and setup functions
abstract contract Base is StringUtils, Clamp, Deployer, Math {
    using DecimalPrinter for uint256;

    string[] internal ACTOR_LABELS = ["Alice", "Bob", "Charlie"];
    uint256 internal constant BLOCK_INTERVAL = 12 seconds;
    uint256 internal constant INITIAL_ETH_BALANCE = 1000 ether;
    uint256 internal constant INITIAL_TOKEN_BALANCE = 10_000e6;

    uint8 internal constant ACTION_NONE = 0;
    uint8 internal constant ACTION_CREATE_MEMBERSHIP = 1;
    uint8 internal constant ACTION_GRANT_MEMBERSHIP = 2;

    // ―――――――――――――――――――――――――― Ghosts ――――――――――――――――――――――――――

    struct Ghosts {
        mapping(address tier => uint256 amount) donatedByTier;
        mapping(address tier => uint256 count) mintedCountByTier;
        mapping(address tier => uint256 count) retiredCountByTier;
        mapping(address tier => uint256 gross) beforeLifetimeGrossByTier;
        mapping(address tier => uint256 count) beforeTotalMintedByTier;
        mapping(address tier => uint64 timestamp) beforeAccountedThroughByTier;
        mapping(address tier => uint256 index) beforeRewardPerShareByTier;
        uint256 beforeFactoryTierCount;
        uint256 beforeFactoryPaymentTokenCount;
        uint8 currentActionKind;
    }

    Ghosts internal ghosts;

    // ―――――――――――――――――――――――――― Actors ――――――――――――――――――――――――――

    address[] internal actors;
    address internal actor;
    address internal admin;

    modifier asActor() {
        vm.startPrank(actor);
        _;
        vm.stopPrank();
    }

    modifier asAdmin() {
        vm.startPrank(admin);
        _;
        vm.stopPrank();
    }

    modifier asCreator() {
        vm.startPrank(creator);
        _;
        vm.stopPrank();
    }

    // ―――――――――――――――――――――――― Contracts ―――――――――――――――――――――――――

    MockERC20 public paymentToken;
    MockERC20 internal secondaryPaymentToken;
    MembershipFactory public factory;
    MembershipTier public fixedTier;
    MembershipTier public contributionTier;
    OnchainMetadataRenderer public renderer;
    OnchainMediaStoreFactory public mediaStoreFactory;
    address internal creator;

    // ―――――――――――――――――――――――――― Setup ―――――――――――――――――――――――――――

    function setup() internal {
        setupActors();
        setupProtocol();
    }

    function setupActors() internal {
        admin = address(this);
        vm.label(admin, "Admin");

        for (uint256 i; i < ACTOR_LABELS.length; i++) {
            address _actor = address(new Actor{value: INITIAL_ETH_BALANCE}());
            actors.push(_actor);
            if (ACTOR_LABELS.length > i) {
                vm.label(_actor, ACTOR_LABELS[i]);
            }
        }
        actor = actors[0];
        creator = actors[0];
    }

    function setupProtocol() internal {
        paymentToken = new MockERC20(address(this), 0, "Fuzz USD", "FUSD", 6);
        secondaryPaymentToken = new MockERC20(address(this), 0, "Second Fuzz USD", "FUSD2", 6);
        renderer = new OnchainMetadataRenderer();
        mediaStoreFactory = new OnchainMediaStoreFactory();
        address vestingLedger = _deploy(type(VestingLedger).creationCode);
        address implementation = _deploy(_relink(type(MembershipTier).creationCode, vestingLedger));

        IERC20[] memory paymentTokens = new IERC20[](1);
        paymentTokens[0] = IERC20(address(paymentToken));
        uint112[] memory minimumPayments = new uint112[](1);
        minimumPayments[0] = 1;
        bytes memory factoryInitCode = abi.encodePacked(
            _relink(type(MembershipFactory).creationCode, vestingLedger),
            abi.encode(
                paymentTokens,
                address(mediaStoreFactory),
                admin,
                address(0),
                implementation,
                minimumPayments
            )
        );
        factory = MembershipFactory(_deploy(factoryInitCode));

        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        config.periodDuration = 1 days;
        config.supplyCap = 8;
        config.maxPrepaidPeriods = 12;
        config.tierSalt = keccak256("fizz-fixed-tier");
        vm.prank(creator);
        fixedTier = MembershipTier(factory.createTier(config));

        config.pricePerPeriod = 0;
        config.tierSalt = keccak256("fizz-contribution-tier");
        vm.prank(creator);
        contributionTier = MembershipTier(factory.createTier(config));

        ghosts.mintedCountByTier[address(fixedTier)] = fixedTier.totalMinted();
        ghosts.mintedCountByTier[address(contributionTier)] = contributionTier.totalMinted();
        ghosts.beforeLifetimeGrossByTier[address(fixedTier)] = fixedTier.lifetimeGross();
        ghosts.beforeLifetimeGrossByTier[address(contributionTier)] =
            contributionTier.lifetimeGross();
        ghosts.beforeTotalMintedByTier[address(fixedTier)] = fixedTier.totalMinted();
        ghosts.beforeTotalMintedByTier[address(contributionTier)] = contributionTier.totalMinted();
        ghosts.beforeAccountedThroughByTier[address(fixedTier)] =
        fixedTier.accountingStatus().accountedThrough;
        ghosts.beforeAccountedThroughByTier[address(contributionTier)] =
        contributionTier.accountingStatus().accountedThrough;
        ghosts.beforeRewardPerShareByTier[address(fixedTier)] = fixedTier.rewardPerShare();
        ghosts.beforeRewardPerShareByTier[address(contributionTier)] =
            contributionTier.rewardPerShare();
        ghosts.beforeFactoryTierCount = factory.tierCount();
        ghosts.beforeFactoryPaymentTokenCount = factory.paymentTokenCount();
        ghosts.currentActionKind = ACTION_NONE;

        for (uint256 i; i < actors.length; ++i) {
            paymentToken.deal(actors[i], INITIAL_TOKEN_BALANCE);
            vm.startPrank(actors[i]);
            paymentToken.approve(address(fixedTier), type(uint256).max);
            paymentToken.approve(address(contributionTier), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _relink(bytes memory initCode, address libraryAddress)
        internal
        pure
        returns (bytes memory)
    {
        bytes20 linkedAtBuild = bytes20(address(VestingLedger));
        bytes20 linkedAtRuntime = bytes20(libraryAddress);
        uint256 replacements;
        for (uint256 i; i + 20 <= initCode.length; ++i) {
            bool matches = true;
            for (uint256 j; j < 20; ++j) {
                if (initCode[i + j] != linkedAtBuild[j]) {
                    matches = false;
                    break;
                }
            }
            if (!matches) continue;
            for (uint256 j; j < 20; ++j) {
                initCode[i + j] = linkedAtRuntime[j];
            }
            ++replacements;
            i += 19;
        }
        require(replacements != 0, "missing vesting link");
        return initCode;
    }

    function _deploy(bytes memory initCode) internal returns (address deployed) {
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 32), mload(initCode))
        }
        require(deployed != address(0) && deployed.code.length != 0, "deployment failed");
    }

    // ――――――――――――――――――――――――― Helpers ――――――――――――――――――――――――――

    // Maps an arbitrary address to an actor address
    function toActor(address addy) internal view returns (address) {
        return actors[uint256(uint160(addy)) % actors.length];
    }

    // Maps an arbitrary address to an actor address that is different from the current actor
    function toActorNotCurrent(address addy) internal view returns (address) {
        address _actor = actors[uint256(uint160(addy)) % actors.length];
        if (_actor == actor) {
            _actor = actors[(uint256(uint160(addy)) + 1) % actors.length];
        }
        return _actor;
    }

    // Sums the native token balances of all actors
    function sumActorsBalances() internal view returns (uint256 sumOfBalances) {
        for (uint256 i; i < actors.length; i++) {
            sumOfBalances += actors[i].balance;
        }
    }

    // Sums the ERC-20 token balances of all actors for a given token
    function sumActorsERC20Balances(address _token) internal view returns (uint256 sumOfBalances) {
        for (uint256 i; i < actors.length; i++) {
            bytes memory data = abi.encodeWithSignature("balanceOf(address)", actors[i]);
            (bool success, bytes memory result) = _token.staticcall(data);
            require(success, "sumActorsERC20Balances: failed to get balance");
            sumOfBalances += abi.decode(result, (uint256));
        }
    }

    function skipBlocks(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * BLOCK_INTERVAL);
    }

    function skipTime(uint256 time) internal {
        uint256 blocks = (time + BLOCK_INTERVAL - 1) / BLOCK_INTERVAL;
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + time);
    }
}
