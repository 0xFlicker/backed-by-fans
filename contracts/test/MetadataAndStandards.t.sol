// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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
        tier = _deployTier(_config());
    }

    function test_tokenMetadataContainsOneSelfContainedSVGArtwork() public {
        uint256 tokenId = tier.grantTime(member, 1);
        string memory json = _decodeDataURI(tier.tokenURI(tokenId), "data:application/json;base64,");
        string memory image = vm.parseJsonString(json, ".image");
        string memory svg = _decodeDataURI(image, "data:image/svg+xml;base64,");

        assertTrue(_contains(json, '"value":"STACK"'));
        assertTrue(_contains(json, '"value":"ACTIVE"'));
        assertFalse(_contains(json, "animation_url"));
        assertTrue(_contains(svg, '<svg xmlns="http://www.w3.org/2000/svg"'));
        assertTrue(_contains(svg, 'data-state="active"'));
        assertTrue(_contains(svg, "BACKED BY FANS"));
        assertTrue(_contains(svg, "Creator Backers"));
        assertFalse(_contains(svg, "<script"));
        assertFalse(_contains(svg, "example.com"));
    }

    function test_tokenMetadataReflectsPassiveExpirationWithStableGeometry() public {
        uint256 tokenId = tier.grantTime(member, 1);
        string memory activeSVG = _svgFromTier(tokenId);
        string memory activeGeometry = _attribute(activeSVG, "data-geometry");

        vm.warp(tier.expiresAt(tokenId));
        string memory afterglowSVG = _svgFromTier(tokenId);
        string memory afterglowGeometry = _attribute(afterglowSVG, "data-geometry");

        assertEq(activeGeometry, afterglowGeometry);
        assertTrue(_contains(activeSVG, 'data-state="active"'));
        assertTrue(_contains(afterglowSVG, 'data-state="afterglow"'));
        assertTrue(_contains(activeSVG, ">ACTIVE</text>"));
        assertTrue(_contains(afterglowSVG, ">EXPIRED</text>"));
        assertFalse(_contains(activeSVG, "LIVE SUPPORT"));
        assertFalse(_contains(afterglowSVG, "ARCHIVAL AFTERGLOW"));
        assertTrue(
            _contains(
                _decodeDataURI(tier.tokenURI(tokenId), "data:application/json;base64,"),
                '"value":"EXPIRED"'
            )
        );
        assertFalse(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
    }

    function test_mutableMetadataSignalsRefreshWithoutChangingImmutableArt() public {
        tier.grantTime(member, 1);
        tier.grantTime(makeAddr("other"), 1);
        bytes32 artBefore = keccak256(abi.encode(tier.artConfig()));
        bytes32 mediaBefore = keccak256(abi.encode(tier.mediaConfig()));
        bytes32 identityBefore = tier.tierIdentity();
        MembershipTypes.TierMetadata memory updated = MembershipTypes.TierMetadata({
            description: "Updated membership", externalURI: "https://example.com/updated"
        });
        vm.recordLogs();

        tier.setTierMetadata(updated);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, keccak256("TierMetadataUpdated(string,string)")), 1);
        assertEq(_countLogs(logs, keccak256("BatchMetadataUpdate(uint256,uint256)")), 1);
        assertEq(tier.description(), updated.description);
        assertEq(tier.externalURI(), updated.externalURI);
        assertEq(keccak256(abi.encode(tier.artConfig())), artBefore);
        assertEq(keccak256(abi.encode(tier.mediaConfig())), mediaBefore);
        assertEq(tier.tierIdentity(), identityBefore);

        string memory invalidDescription = string(new bytes(tier.MAX_DESCRIPTION_BYTES() + 1));
        MembershipTypes.TierMetadata memory invalid = MembershipTypes.TierMetadata({
            description: invalidDescription, externalURI: updated.externalURI
        });
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        tier.setTierMetadata(invalid);
        assertEq(tier.description(), "Updated membership");
    }

    function test_constructorMetadataBoundsAcceptLimitsAndRejectOverflow() public {
        MembershipTypes.TierConfig memory config = _config();
        config.name = _ascii(tier.MAX_NAME_BYTES());
        config.symbol = _ascii(tier.MAX_SYMBOL_BYTES());
        config.metadata.description = _ascii(tier.MAX_DESCRIPTION_BYTES());
        config.metadata.externalURI = _ascii(tier.MAX_URI_BYTES());
        _deployTier(config);

        config = _config();
        config.name = "";
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        _deployTier(config);

        config = _config();
        config.symbol = _ascii(tier.MAX_SYMBOL_BYTES() + 1);
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        _deployTier(config);

        config = _config();
        config.metadata.externalURI = _ascii(tier.MAX_URI_BYTES() + 1);
        vm.expectRevert(MembershipTier.InvalidMetadata.selector);
        _deployTier(config);
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

    function test_standardAdaptersExposeRenewalAndCreatorOnlyCancellation() public {
        uint256 tokenId = tier.grantTime(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);

        assertTrue(tier.supportsInterface(type(IERC721).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5643).interfaceId));
        assertTrue(tier.supportsInterface(0x49064906));
        assertTrue(tier.locked(tokenId));
        assertFalse(tier.isRenewable(tokenId));

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceRequired.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        vm.prank(member);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, member));
        tier.cancelSubscription(tokenId);

        assertEq(tier.expiresAt(tokenId), expiration);
        assertEq(address(tier).balance, 0);
    }

    function test_isRenewableTurnsTrueAfterReferralChoiceIsLocked() public {
        uint256 tokenId = tier.grantTime(member, 1);
        assertFalse(tier.isRenewable(tokenId));

        uint256 price = tier.pricePerPeriod();
        token.mint(member, price);
        vm.startPrank(member);
        token.approve(address(tier), price);
        tier.purchase(1, address(0));
        vm.stopPrank();

        assertTrue(tier.isRenewable(tokenId));
    }

    function _svgFromTier(uint256 tokenId) private view returns (string memory) {
        string memory json = _decodeDataURI(tier.tokenURI(tokenId), "data:application/json;base64,");
        return _decodeDataURI(vm.parseJsonString(json, ".image"), "data:image/svg+xml;base64,");
    }

    function _decodeDataURI(string memory uri, string memory expectedPrefix)
        private
        pure
        returns (string memory decoded)
    {
        bytes memory encodedURI = bytes(uri);
        bytes memory prefix = bytes(expectedPrefix);
        require(encodedURI.length >= prefix.length, "short URI");
        for (uint256 index; index < prefix.length; ++index) {
            require(encodedURI[index] == prefix[index], "invalid URI prefix");
        }

        bytes memory payload = new bytes(encodedURI.length - prefix.length);
        for (uint256 index; index < payload.length; ++index) {
            payload[index] = encodedURI[index + prefix.length];
        }
        decoded = string(Base64.decode(string(payload)));
    }

    function _attribute(string memory document, string memory name)
        private
        pure
        returns (string memory)
    {
        bytes memory source = bytes(document);
        bytes memory prefix = bytes(string.concat(name, "=\""));
        uint256 start = _indexOf(source, prefix) + prefix.length;
        uint256 end = start;
        while (source[end] != '"') ++end;
        bytes memory value = new bytes(end - start);
        for (uint256 index; index < value.length; ++index) {
            value[index] = source[start + index];
        }
        return string(value);
    }

    function _contains(string memory value, string memory needle) private pure returns (bool) {
        bytes memory search = bytes(needle);
        if (search.length > bytes(value).length) return false;
        return _indexOf(bytes(value), search) != type(uint256).max;
    }

    function _indexOf(bytes memory source, bytes memory search) private pure returns (uint256) {
        if (search.length > source.length) return type(uint256).max;
        for (uint256 index; index <= source.length - search.length; ++index) {
            bool matches = true;
            for (uint256 offset; offset < search.length; ++offset) {
                if (source[index + offset] != search[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return index;
        }
        return type(uint256).max;
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 signature)
        private
        pure
        returns (uint256 count)
    {
        for (uint256 index; index < logs.length; ++index) {
            if (logs[index].topics.length != 0 && logs[index].topics[0] == signature) ++count;
        }
    }

    function _ascii(uint256 length) private pure returns (string memory) {
        bytes memory value = new bytes(length);
        for (uint256 index; index < length; ++index) {
            value[index] = "a";
        }
        return string(value);
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return MembershipTestConfig.defaultConfig(address(this), address(renderer));
    }

    function _deployTier(MembershipTypes.TierConfig memory config)
        private
        returns (MembershipTier deployed)
    {
        deployed = new MembershipTier(address(this), token, config);
    }
}
