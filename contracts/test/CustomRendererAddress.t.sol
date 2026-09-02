// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IMembershipRenderer} from "../src/interfaces/IMembershipRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract TaggedRenderer is IMembershipRenderer {
    bytes32 private constant _SCHEMA = keccak256("BackedByFans.MembershipRenderer.v1");
    string private _tag;
    bool private _reject;

    constructor(string memory tag_, bool reject_) {
        _tag = tag_;
        _reject = reject_;
    }

    function rendererSchema() external pure returns (bytes32) {
        return _SCHEMA;
    }

    function rendererName() external pure returns (string memory) {
        return "TAGGED";
    }

    function engineCount() external pure returns (uint16) {
        return 1;
    }

    function engineName(uint16) external pure returns (string memory) {
        return "TAGGED";
    }

    function validateConfiguration(
        MembershipTypes.ArtConfig calldata,
        MembershipTypes.MediaConfig calldata
    ) external view {
        if (_reject) revert("configuration rejected");
    }

    function previewSVG(MembershipTypes.PreviewContext calldata)
        external
        view
        returns (string memory)
    {
        return _tag;
    }

    function previewTokenURI(MembershipTypes.PreviewContext calldata)
        external
        view
        returns (string memory)
    {
        return _tag;
    }

    function renderTokenURI(MembershipTypes.TokenRenderData calldata)
        external
        view
        returns (string memory)
    {
        return _tag;
    }
}

contract WrongUpdateRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return bytes32(uint256(1));
    }
}

contract CustomRendererAddressTest is Test {
    event TierRendererUpdated(address indexed previousRenderer, address indexed newRenderer);

    MockUSDG private paymentToken;
    OnchainMetadataRenderer private canonicalRenderer;
    OnchainMediaStoreFactory private mediaStoreFactory;
    MembershipFactory private factory;
    address private creator;

    function setUp() public {
        creator = makeAddr("creator");
        paymentToken = new MockUSDG();
        canonicalRenderer = new OnchainMetadataRenderer();
        mediaStoreFactory = new OnchainMediaStoreFactory();
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(paymentToken),
            address(mediaStoreFactory),
            address(this),
            makeAddr("feeRecipient")
        );
    }

    function test_unregisteredCompatibleRendererCreatesTierAndIsExposed() public {
        OnchainMetadataRenderer creatorRenderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(creatorRenderer), address(paymentToken)
        );

        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));

        assertEq(tier.renderer(), address(creatorRenderer));
        assertEq(tier.pricePerPeriod(), config.pricePerPeriod);
        assertEq(tier.periodDuration(), config.periodDuration);
        assertEq(tier.rewardBps(), config.rewardBps);
        assertEq(tier.referralBps(), config.referralBps);
        assertEq(tier.supplyCap(), config.supplyCap);
        assertEq(tier.maxPrepaidPeriods(), config.maxPrepaidPeriods);
    }

    function test_canonicalRendererAlsoUsesDirectAddress() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(canonicalRenderer), address(paymentToken)
        );

        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));

        assertEq(tier.renderer(), address(canonicalRenderer));
    }

    function test_zeroRendererAddressIsRejected() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(0), address(paymentToken));

        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.createTier(config);
    }

    function test_nonContractRendererAddressIsRejected() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, makeAddr("not-a-contract"), address(paymentToken)
        );

        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.createTier(config);
    }

    function test_currentOwnerCanReplaceRendererByDirectAddress() public {
        MembershipTier tier = _createTier();
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);

        vm.expectEmit(true, true, false, false, address(tier));
        emit TierRendererUpdated(address(canonicalRenderer), address(replacement));
        vm.prank(creator);
        tier.setRenderer(address(replacement));

        assertEq(tier.renderer(), address(replacement));
    }

    function test_rendererReplacementRefreshesAllMintedMetadata() public {
        MembershipTier tier = _createTier();
        address member = makeAddr("member");
        vm.prank(creator);
        uint256 tokenId = tier.grantTime(member, 1);
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);
        vm.recordLogs();

        vm.prank(creator);
        tier.setRenderer(address(replacement));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(tier.tokenURI(tokenId), "replacement");
        assertTrue(_hasBatchRefresh(logs, address(tier), 1, tokenId));
    }

    function test_pendingFormerAndNonOwnerCannotReplaceRenderer() public {
        MembershipTier tier = _createTier();
        address nextOwner = makeAddr("nextOwner");
        address outsider = makeAddr("outsider");
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);

        vm.prank(creator);
        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        vm.expectRevert();
        tier.setRenderer(address(replacement));
        vm.prank(outsider);
        vm.expectRevert();
        tier.setRenderer(address(replacement));

        vm.prank(nextOwner);
        tier.acceptOwnership();
        vm.prank(creator);
        vm.expectRevert();
        tier.setRenderer(address(replacement));
        vm.prank(nextOwner);
        tier.setRenderer(address(replacement));
        assertEq(tier.renderer(), address(replacement));
    }

    function test_invalidReplacementPreservesCurrentRenderer() public {
        MembershipTier tier = _createTier();
        TaggedRenderer rejecting = new TaggedRenderer("rejecting", true);
        WrongUpdateRenderer wrong = new WrongUpdateRenderer();

        vm.startPrank(creator);
        vm.expectRevert(MembershipTier.InvalidRenderer.selector);
        tier.setRenderer(address(0));
        vm.expectRevert(MembershipTier.InvalidRenderer.selector);
        tier.setRenderer(makeAddr("eoa"));
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.InvalidRendererSchema.selector,
                factory.rendererSchema(),
                bytes32(uint256(1))
            )
        );
        tier.setRenderer(address(wrong));
        vm.expectRevert("configuration rejected");
        tier.setRenderer(address(rejecting));
        vm.stopPrank();

        assertEq(tier.renderer(), address(canonicalRenderer));
    }

    function test_rendererReplacementPreservesMembershipAndEconomicState() public {
        MembershipTier tier = _createTier();
        address member = makeAddr("member");
        vm.prank(creator);
        uint256 tokenId = tier.grantTime(member, 2);
        bytes32 beforeState = _stateHash(tier, tokenId);
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);

        vm.prank(creator);
        tier.setRenderer(address(replacement));

        assertEq(_stateHash(tier, tokenId), beforeState);
    }

    function _createTier() private returns (MembershipTier tier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(canonicalRenderer), address(paymentToken)
        );
        vm.prank(creator);
        tier = MembershipTier(factory.createTier(config));
    }

    function _stateHash(MembershipTier tier, uint256 tokenId) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.owner(),
                tier.paymentToken(),
                tier.pricePerPeriod(),
                tier.periodDuration(),
                tier.rewardBps(),
                tier.referralBps(),
                tier.supplyCap(),
                tier.maxPrepaidPeriods(),
                tier.occupiedSupply(),
                tier.totalMinted(),
                tier.expiresAt(tokenId),
                tier.artConfig(),
                tier.mediaConfig()
            )
        );
    }

    function _hasBatchRefresh(Vm.Log[] memory logs, address emitter, uint256 from, uint256 to)
        private
        pure
        returns (bool)
    {
        bytes32 signature = keccak256("BatchMetadataUpdate(uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == signature) {
                (uint256 observedFrom, uint256 observedTo) =
                    abi.decode(logs[i].data, (uint256, uint256));
                return observedFrom == from && observedTo == to;
            }
        }
        return false;
    }
}
