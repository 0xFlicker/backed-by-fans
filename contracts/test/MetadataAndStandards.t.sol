// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract MetadataAndStandardsTest is Test {
    MembershipTier private tier;
    MockUSDG private token;
    OnchainMetadataRenderer private renderer;
    address private member;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("member");
        token = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(address(this), token, address(renderer), _config());
    }

    function test_rendererProducesSelfContainedEscapedMetadataFromOneWayInput() public {
        MembershipTypes.TierConfig memory config = _config();
        config.name = "A Creator";
        config.metadata.description = "Support \"independent\" creators\nmonthly";
        config.metadata.imageURI = "ipfs://image";
        config.metadata.externalURI = "https://example.com/tier";
        MembershipTier renderedTier =
            new MembershipTier(address(this), token, address(renderer), config);
        uint256 tokenId = renderedTier.grantTime(member, 1);

        string memory json = _decodeTokenURI(renderedTier.tokenURI(tokenId));

        assertEq(
            json,
            string.concat(
                '{"name":"A Creator #1","description":"Support \\"independent\\" creators\\nmonthly",',
                '"image":"ipfs://image","external_url":"https://example.com/tier",',
                '"attributes":[{"trait_type":"Active","value":"Yes"},',
                '{"display_type":"date","trait_type":"Expiration","value":',
                vm.toString(_START + _PERIOD),
                "}]}"
            )
        );
    }

    function test_tokenMetadataReflectsPassiveExpirationWithoutAuthorizationWrites() public {
        uint256 tokenId = tier.grantTime(member, 1);
        string memory activeJSON = _decodeTokenURI(tier.tokenURI(tokenId));

        vm.warp(tier.expiresAt(tokenId));
        string memory expiredJSON = _decodeTokenURI(tier.tokenURI(tokenId));

        assertTrue(_contains(activeJSON, '"value":"Yes"'));
        assertTrue(_contains(expiredJSON, '"value":"No"'));
        assertFalse(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
    }

    function test_metadataUpdateIsBoundedAndSignalsAllMintedCredentials() public {
        tier.grantTime(member, 1);
        tier.grantTime(makeAddr("other"), 1);
        MembershipTypes.TierMetadata memory updated = MembershipTypes.TierMetadata({
            description: "Updated membership",
            imageURI: "ipfs://updated-image",
            externalURI: "https://example.com/updated"
        });
        vm.recordLogs();

        tier.setTierMetadata(updated);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, keccak256("TierMetadataUpdated(string,string,string)")), 1);
        assertEq(_countLogs(logs, keccak256("BatchMetadataUpdate(uint256,uint256)")), 1);
        assertEq(tier.description(), updated.description);
        assertEq(tier.imageURI(), updated.imageURI);
        assertEq(tier.externalURI(), updated.externalURI);

        MembershipTypes.TierMetadata memory invalid = updated;
        invalid.description = string(new bytes(tier.MAX_DESCRIPTION_BYTES() + 1));
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        tier.setTierMetadata(invalid);
        assertEq(tier.description(), "Updated membership");
    }

    function test_constructorMetadataBoundsAcceptLimitsAndRejectOverflow() public {
        MembershipTypes.TierConfig memory config = _config();
        config.name = string(new bytes(tier.MAX_NAME_BYTES()));
        config.symbol = string(new bytes(tier.MAX_SYMBOL_BYTES()));
        config.metadata.description = string(new bytes(tier.MAX_DESCRIPTION_BYTES()));
        config.metadata.imageURI = string(new bytes(tier.MAX_URI_BYTES()));
        config.metadata.externalURI = string(new bytes(tier.MAX_URI_BYTES()));
        new MembershipTier(address(this), token, address(renderer), config);

        config = _config();
        config.name = "";
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        new MembershipTier(address(this), token, address(renderer), config);

        config = _config();
        config.symbol = string(new bytes(tier.MAX_SYMBOL_BYTES() + 1));
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        new MembershipTier(address(this), token, address(renderer), config);

        config = _config();
        config.metadata.externalURI = string(new bytes(tier.MAX_URI_BYTES() + 1));
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        new MembershipTier(address(this), token, address(renderer), config);
    }

    function test_lifecycleMutationsEmitPublishedStandardsEvents() public {
        vm.recordLogs();
        uint256 tokenId = tier.grantTime(member, 1);
        Vm.Log[] memory grantLogs = vm.getRecordedLogs();

        assertEq(_countLogs(grantLogs, keccak256("Locked(uint256)")), 1);
        assertEq(_countLogs(grantLogs, keccak256("SubscriptionUpdate(uint256,uint64)")), 1);
        assertEq(_countLogs(grantLogs, keccak256("MetadataUpdate(uint256)")), 1);

        vm.warp(tier.expiresAt(tokenId));
        vm.recordLogs();
        assertTrue(tier.synchronize(tokenId));
        Vm.Log[] memory syncLogs = vm.getRecordedLogs();

        assertEq(_countLogs(syncLogs, keccak256("MembershipSynchronized(uint256,address)")), 1);
        assertEq(_countLogs(syncLogs, keccak256("MetadataUpdate(uint256)")), 1);
    }

    function test_standardAdaptersExposeRenewalEconomicsAndDeferredCancellation() public {
        uint256 tokenId = tier.grantTime(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);

        assertTrue(tier.supportsInterface(type(IERC721).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5643).interfaceId));
        assertTrue(tier.supportsInterface(0x49064906));
        assertTrue(tier.locked(tokenId));
        assertTrue(tier.isRenewable(tokenId));

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceRequired.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        vm.prank(member);
        vm.expectRevert(MembershipTier.LifecycleUnavailable.selector);
        tier.cancelSubscription(tokenId);

        assertEq(tier.expiresAt(tokenId), expiration);
        assertEq(address(tier).balance, 0);
    }

    function _decodeTokenURI(string memory uri) private pure returns (string memory json) {
        bytes memory encodedURI = bytes(uri);
        bytes memory prefix = bytes("data:application/json;base64,");
        require(encodedURI.length >= prefix.length, "short URI");
        for (uint256 i; i < prefix.length; ++i) {
            require(encodedURI[i] == prefix[i], "invalid URI prefix");
        }

        bytes memory encodedJSON = new bytes(encodedURI.length - prefix.length);
        for (uint256 i; i < encodedJSON.length; ++i) {
            encodedJSON[i] = encodedURI[i + prefix.length];
        }
        json = string(Base64.decode(string(encodedJSON)));
    }

    function _contains(string memory value, string memory needle) private pure returns (bool) {
        bytes memory haystack = bytes(value);
        bytes memory search = bytes(needle);
        if (search.length > haystack.length) return false;
        for (uint256 i; i <= haystack.length - search.length; ++i) {
            bool matches = true;
            for (uint256 j; j < search.length; ++j) {
                if (haystack[i + j] != search[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return true;
        }
        return false;
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 signature)
        private
        pure
        returns (uint256 count)
    {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length != 0 && logs[i].topics[0] == signature) ++count;
        }
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return MembershipTestConfig.defaultConfig(address(this));
    }
}
