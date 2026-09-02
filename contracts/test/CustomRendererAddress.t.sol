// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IMembershipRenderer} from "../src/interfaces/IMembershipRenderer.sol";
import {IOnchainMediaStoreFactory} from "../src/interfaces/IOnchainMediaStoreFactory.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "./helpers/RealImageFixtures.sol";
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
    event PresentationUpdated(
        address indexed previousRenderer,
        address indexed newRenderer,
        bytes32 previousArtHash,
        bytes32 newArtHash,
        bytes32 previousMediaHash,
        bytes32 newMediaHash
    );

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

    function test_currentOwnerCanReplaceCompletePresentation() public {
        MembershipTier tier = _createTier();
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);
        MembershipTypes.ArtConfig memory previousArt = tier.artConfig();
        MembershipTypes.MediaConfig memory previousMedia = tier.mediaConfig();
        bytes32 previousArtHash = keccak256(abi.encode(previousArt));
        MembershipTypes.ArtConfig memory nextArt = previousArt;
        nextArt.palette = 4;
        nextArt.intensity = 88;

        bytes memory payload = RealImageFixtures.png();
        vm.prank(creator);
        address store = mediaStoreFactory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaConfig memory nextMedia =
            _nativeMedia(mediaStoreFactory.mediaRecord(store));

        vm.recordLogs();
        vm.prank(creator);
        tier.setPresentation(address(replacement), nextArt, nextMedia);

        assertTrue(
            _hasPresentationUpdate(
                vm.getRecordedLogs(),
                address(tier),
                address(canonicalRenderer),
                address(replacement),
                previousArtHash,
                keccak256(abi.encode(nextArt)),
                keccak256(abi.encode(previousMedia)),
                keccak256(abi.encode(nextMedia))
            )
        );
        assertEq(tier.renderer(), address(replacement));
        assertEq(keccak256(abi.encode(tier.artConfig())), keccak256(abi.encode(nextArt)));
        assertEq(keccak256(abi.encode(tier.mediaConfig())), keccak256(abi.encode(nextMedia)));
    }

    function test_rendererReplacementRefreshesAllMintedMetadata() public {
        MembershipTier tier = _createTier();
        address member = makeAddr("member");
        vm.prank(creator);
        uint256 tokenId = tier.grantTime(member, 1);
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);
        MembershipTypes.ArtConfig memory art = tier.artConfig();
        MembershipTypes.MediaConfig memory media = tier.mediaConfig();
        vm.recordLogs();

        vm.prank(creator);
        tier.setPresentation(address(replacement), art, media);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(tier.tokenURI(tokenId), "replacement");
        assertTrue(_hasBatchRefresh(logs, address(tier), 1, tokenId));
    }

    function test_pendingFormerAndNonOwnerCannotReplaceRenderer() public {
        MembershipTier tier = _createTier();
        address nextOwner = makeAddr("nextOwner");
        address outsider = makeAddr("outsider");
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);
        MembershipTypes.ArtConfig memory art = tier.artConfig();
        MembershipTypes.MediaConfig memory media = tier.mediaConfig();

        vm.prank(creator);
        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        vm.expectRevert();
        tier.setPresentation(address(replacement), art, media);
        vm.prank(outsider);
        vm.expectRevert();
        tier.setPresentation(address(replacement), art, media);

        vm.prank(nextOwner);
        tier.acceptOwnership();
        vm.prank(creator);
        vm.expectRevert();
        tier.setPresentation(address(replacement), art, media);
        vm.prank(nextOwner);
        tier.setPresentation(address(replacement), art, media);
        assertEq(tier.renderer(), address(replacement));
    }

    function test_invalidReplacementPreservesCurrentRenderer() public {
        MembershipTier tier = _createTier();
        TaggedRenderer rejecting = new TaggedRenderer("rejecting", true);
        WrongUpdateRenderer wrong = new WrongUpdateRenderer();
        MembershipTypes.ArtConfig memory art = tier.artConfig();
        MembershipTypes.MediaConfig memory media = tier.mediaConfig();

        vm.startPrank(creator);
        vm.expectRevert(MembershipTier.InvalidRenderer.selector);
        tier.setPresentation(address(0), art, media);
        vm.expectRevert(MembershipTier.InvalidRenderer.selector);
        tier.setPresentation(makeAddr("eoa"), art, media);
        vm.expectRevert(MembershipTier.InvalidRenderer.selector);
        tier.setPresentation(address(wrong), art, media);
        vm.expectRevert("configuration rejected");
        tier.setPresentation(address(rejecting), art, media);
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
        MembershipTypes.ArtConfig memory nextArt = tier.artConfig();
        MembershipTypes.MediaConfig memory media = tier.mediaConfig();
        nextArt.grain = 77;

        vm.prank(creator);
        tier.setPresentation(address(replacement), nextArt, media);

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
                tier.claimableReward(tokenId)
            )
        );
    }

    function test_presentationRejectsMediaFromAnotherCreatorAndPreservesAllFields() public {
        MembershipTier tier = _createTier();
        MembershipTypes.ArtConfig memory previousArt = tier.artConfig();
        MembershipTypes.MediaConfig memory previousMedia = tier.mediaConfig();
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);
        address otherCreator = makeAddr("otherCreator");
        vm.prank(otherCreator);
        address store =
            mediaStoreFactory.store(RealImageFixtures.png(), MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaConfig memory invalidMedia =
            _nativeMedia(mediaStoreFactory.mediaRecord(store));

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaCreatorMismatch.selector,
                store,
                creator,
                otherCreator
            )
        );
        tier.setPresentation(address(replacement), previousArt, invalidMedia);

        assertEq(tier.renderer(), address(canonicalRenderer));
        assertEq(keccak256(abi.encode(tier.artConfig())), keccak256(abi.encode(previousArt)));
        assertEq(keccak256(abi.encode(tier.mediaConfig())), keccak256(abi.encode(previousMedia)));
    }

    function test_newOwnerCanKeepMediaStoredByThePreviousOwner() public {
        vm.prank(creator);
        address store =
            mediaStoreFactory.store(RealImageFixtures.png(), MembershipTypes.MediaMIME.PNG);
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(canonicalRenderer), address(paymentToken)
        );
        config.media = _nativeMedia(mediaStoreFactory.mediaRecord(store));
        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));
        address nextOwner = makeAddr("nextOwner");
        TaggedRenderer replacement = new TaggedRenderer("replacement", false);

        vm.prank(creator);
        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        tier.acceptOwnership();
        MembershipTypes.ArtConfig memory art = tier.artConfig();
        vm.prank(nextOwner);
        tier.setPresentation(address(replacement), art, config.media);

        assertEq(tier.renderer(), address(replacement));
        assertEq(keccak256(abi.encode(tier.mediaConfig())), keccak256(abi.encode(config.media)));
    }

    function test_completePresentationNoOpEmitsNoMetadataRefresh() public {
        MembershipTier tier = _createTier();
        MembershipTypes.ArtConfig memory art = tier.artConfig();
        MembershipTypes.MediaConfig memory media = tier.mediaConfig();
        vm.recordLogs();

        vm.prank(creator);
        tier.setPresentation(address(canonicalRenderer), art, media);

        assertEq(vm.getRecordedLogs().length, 0);
    }

    function _nativeMedia(MembershipTypes.MediaRecord memory record)
        private
        pure
        returns (MembershipTypes.MediaConfig memory)
    {
        return MembershipTypes.MediaConfig({
            mime: record.mime,
            store: record.store,
            length: record.length,
            digest: record.digest,
            runtimeCodehash: record.runtimeCodehash
        });
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

    function _hasPresentationUpdate(
        Vm.Log[] memory logs,
        address emitter,
        address previousRenderer,
        address newRenderer,
        bytes32 previousArtHash,
        bytes32 newArtHash,
        bytes32 previousMediaHash,
        bytes32 newMediaHash
    ) private pure returns (bool) {
        bytes32 signature = keccak256(
            "PresentationUpdated(address,address,bytes32,bytes32,bytes32,bytes32)"
        );
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == emitter && logs[i].topics[0] == signature
                    && address(uint160(uint256(logs[i].topics[1]))) == previousRenderer
                    && address(uint160(uint256(logs[i].topics[2]))) == newRenderer
            ) {
                (bytes32 oldArt, bytes32 nextArt, bytes32 oldMedia, bytes32 nextMedia) =
                    abi.decode(logs[i].data, (bytes32, bytes32, bytes32, bytes32));
                return oldArt == previousArtHash && nextArt == newArtHash
                    && oldMedia == previousMediaHash && nextMedia == newMediaHash;
            }
        }
        return false;
    }
}
