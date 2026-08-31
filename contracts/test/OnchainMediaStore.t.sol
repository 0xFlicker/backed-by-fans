// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {IOnchainMediaStoreFactory} from "../src/interfaces/IOnchainMediaStoreFactory.sol";
import {CodeStoreReader} from "../src/media/CodeStoreReader.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {TextValidation} from "../src/renderer/TextValidation.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";

contract CodeStoreReaderHarness {
    function read(address store, uint32 length, bytes32 codehash)
        external
        view
        returns (bytes memory)
    {
        return CodeStoreReader.read(store, length, codehash);
    }

    function readAndValidate(address store, uint32 length, bytes32 digest, bytes32 codehash)
        external
        view
        returns (bytes memory)
    {
        return CodeStoreReader.readAndValidate(store, length, digest, codehash);
    }
}

contract TextValidationHarness {
    function isValid(string calldata value) external pure returns (bool) {
        return TextValidation.isValid(value);
    }

    function validate(string calldata value) external pure {
        TextValidation.validate(value);
    }
}

contract OnchainMediaStoreTest is Test {
    bytes32 private constant _MEDIA_STORED_SIGNATURE =
        keccak256("MediaStored(address,address,bytes32,uint8,uint32,bytes32)");

    OnchainMediaStoreFactory private factory;
    CodeStoreReaderHarness private reader;
    TextValidationHarness private textValidation;
    address private creator;
    address private otherCreator;

    function setUp() public {
        factory = new OnchainMediaStoreFactory();
        reader = new CodeStoreReaderHarness();
        textValidation = new TextValidationHarness();
        creator = makeAddr("creator");
        otherCreator = makeAddr("other-creator");
    }

    function test_validJPEGUsesPredictionAndStoresExactSTOPPrefixedRuntime() public {
        bytes memory payload = _jpeg(0x41);
        address predicted = factory.predictStore(creator, payload, MembershipTypes.MediaMIME.JPEG);
        vm.recordLogs();

        vm.prank(creator);
        address store = factory.store(payload, MembershipTypes.MediaMIME.JPEG);

        assertEq(store, predicted);
        bytes memory runtime = store.code;
        assertEq(runtime.length, payload.length + 1);
        assertEq(uint8(runtime[0]), 0);
        for (uint256 index; index < payload.length; ++index) {
            assertEq(runtime[index + 1], payload[index]);
        }

        MembershipTypes.MediaRecord memory record = factory.mediaRecord(store);
        assertEq(record.store, store);
        assertEq(record.creator, creator);
        assertEq(uint256(record.mime), uint256(MembershipTypes.MediaMIME.JPEG));
        assertEq(record.length, payload.length);
        assertEq(record.digest, keccak256(payload));
        assertEq(record.runtimeCodehash, store.codehash);
        assertEq(factory.mediaStore(creator, record.mime, record.length, record.digest), store);
        assertEq(reader.read(store, record.length, record.runtimeCodehash), payload);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, _MEDIA_STORED_SIGNATURE), 1);
        Vm.Log memory storedLog = _findLog(logs, _MEDIA_STORED_SIGNATURE);
        assertEq(storedLog.data.length, 96);
    }

    function test_validPNGCanBeValidatedFromItsTypedNativeConfig() public {
        bytes memory payload = _png(0x42);
        vm.prank(creator);
        address store = factory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaRecord memory record = factory.mediaRecord(store);

        MembershipTypes.MediaConfig memory media = _config(record);
        assertTrue(factory.validateOnchainMedia(creator, media));
        assertEq(
            reader.readAndValidate(store, record.length, record.digest, record.runtimeCodehash),
            payload
        );
    }

    function test_duplicateUploadReusesOneStoreAndOneCreatorListEntry() public {
        bytes memory payload = _png(0x43);
        vm.recordLogs();

        vm.startPrank(creator);
        address first = factory.store(payload, MembershipTypes.MediaMIME.PNG);
        address second = factory.store(payload, MembershipTypes.MediaMIME.PNG);
        vm.stopPrank();

        assertEq(second, first);
        assertEq(factory.creatorMediaCount(creator), 1);
        assertEq(_countLogs(vm.getRecordedLogs(), _MEDIA_STORED_SIGNATURE), 1);
    }

    function test_identicalPayloadIsCreatorScopedAndCannotBeClaimedAcrossCreators() public {
        bytes memory payload = _jpeg(0x44);
        address creatorPrediction =
            factory.predictStore(creator, payload, MembershipTypes.MediaMIME.JPEG);
        address otherPrediction =
            factory.predictStore(otherCreator, payload, MembershipTypes.MediaMIME.JPEG);
        assertNotEq(creatorPrediction, otherPrediction);

        vm.prank(otherCreator);
        address otherStore = factory.store(payload, MembershipTypes.MediaMIME.JPEG);
        vm.prank(creator);
        address creatorStore = factory.store(payload, MembershipTypes.MediaMIME.JPEG);

        assertEq(otherStore, otherPrediction);
        assertEq(creatorStore, creatorPrediction);
        assertNotEq(otherStore, creatorStore);

        MembershipTypes.MediaConfig memory otherMedia = _config(factory.mediaRecord(otherStore));
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaCreatorMismatch.selector,
                otherStore,
                creator,
                otherCreator
            )
        );
        factory.validateOnchainMedia(creator, otherMedia);
    }

    function test_occupiedPredictionCannotCorruptRegistryState() public {
        bytes memory payload = _png(0x45);
        address predicted = factory.predictStore(creator, payload, MembershipTypes.MediaMIME.PNG);
        vm.etch(predicted, hex"00");

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.PredictedStoreOccupied.selector, predicted
            )
        );
        factory.store(payload, MembershipTypes.MediaMIME.PNG);

        assertEq(factory.creatorMediaCount(creator), 0);
        assertFalse(factory.isRegisteredMedia(predicted));
    }

    function test_rejectsEmptyOversizedAndMismatchedPayloads() public {
        vm.expectRevert(IOnchainMediaStoreFactory.EmptyMedia.selector);
        factory.store("", MembershipTypes.MediaMIME.JPEG);

        bytes memory oversized = new bytes(factory.maxRenderableMediaBytes() + 1);
        oversized[0] = 0xff;
        oversized[1] = 0xd8;
        oversized[2] = 0xff;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaTooLarge.selector,
                oversized.length,
                factory.maxRenderableMediaBytes()
            )
        );
        factory.store(oversized, MembershipTypes.MediaMIME.JPEG);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.InvalidMediaSignature.selector,
                MembershipTypes.MediaMIME.PNG
            )
        );
        factory.store(_jpeg(0x46), MembershipTypes.MediaMIME.PNG);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.InvalidMediaSignature.selector,
                MembershipTypes.MediaMIME.JPEG
            )
        );
        factory.store(_png(0x47), MembershipTypes.MediaMIME.JPEG);

        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.InvalidMediaSignature.selector,
                MembershipTypes.MediaMIME.None
            )
        );
        factory.store(_png(0x48), MembershipTypes.MediaMIME.None);
    }

    function test_rejectsPNGWithUnsafeDimensionsOrMalformedChunkFraming() public {
        bytes[] memory invalid = new bytes[](5);
        invalid[0] = _pngWithDimensions(0, 1, 0x60);
        invalid[1] = _pngWithDimensions(1281, 1281, 0x61);
        invalid[2] = _pngWithDimensions(1280, 1279, 0x62);
        invalid[3] = abi.encodePacked(hex"89504e470d0a1a0a0000000d49484452", bytes8(0));
        bytes memory truncated = _pngWithDimensions(1, 1, 0x63);
        assembly ("memory-safe") {
            mstore(truncated, 46)
        }
        invalid[4] = truncated;

        for (uint256 index; index < invalid.length; ++index) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IOnchainMediaStoreFactory.InvalidMediaSignature.selector,
                    MembershipTypes.MediaMIME.PNG
                )
            );
            factory.store(invalid[index], MembershipTypes.MediaMIME.PNG);
        }
    }

    function test_rejectsJPEGWithUnsafeDimensionsOrMalformedSegments() public {
        bytes[] memory invalid = new bytes[](7);
        invalid[0] = _jpegWithDimensions(0, 1, 0x70);
        invalid[1] = _jpegWithDimensions(1281, 1281, 0x71);
        invalid[2] = _jpegWithDimensions(1280, 1279, 0x72);
        invalid[3] = hex"ffd8ffe00010ffd9";
        invalid[4] = hex"ffd8ffda0008010100003f00ffd9";
        invalid[5] = _jpegWithDimensions(1, 1, 0x73);
        invalid[5][invalid[5].length - 1] = 0x00;
        invalid[6] = hex"ffd8ffc00017080001000105011100021100031100041100051100ffd9";

        for (uint256 index; index < invalid.length; ++index) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IOnchainMediaStoreFactory.InvalidMediaSignature.selector,
                    MembershipTypes.MediaMIME.JPEG
                )
            );
            factory.store(invalid[index], MembershipTypes.MediaMIME.JPEG);
        }
    }

    function test_onchainValidationRejectsUnregisteredAndMismatchedRecords() public {
        MembershipTypes.MediaConfig memory media = MembershipTypes.MediaConfig({
            mime: MembershipTypes.MediaMIME.PNG,
            store: makeAddr("not-a-store"),
            length: 9,
            digest: bytes32(uint256(1)),
            runtimeCodehash: bytes32(uint256(2))
        });
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.UnregisteredStore.selector, media.store
            )
        );
        factory.validateOnchainMedia(creator, media);

        bytes memory payload = _png(0x49);
        vm.prank(creator);
        address store = factory.store(payload, MembershipTypes.MediaMIME.PNG);
        MembershipTypes.MediaRecord memory record = factory.mediaRecord(store);
        media = _config(record);

        media.mime = MembershipTypes.MediaMIME.JPEG;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaMIMEMismatch.selector,
                store,
                MembershipTypes.MediaMIME.PNG,
                MembershipTypes.MediaMIME.JPEG
            )
        );
        factory.validateOnchainMedia(creator, media);

        media = _config(record);
        ++media.length;
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaLengthMismatch.selector,
                store,
                record.length,
                media.length
            )
        );
        factory.validateOnchainMedia(creator, media);

        media = _config(record);
        media.digest = bytes32(uint256(3));
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaDigestMismatch.selector,
                store,
                record.digest,
                media.digest
            )
        );
        factory.validateOnchainMedia(creator, media);

        media = _config(record);
        media.runtimeCodehash = bytes32(uint256(4));
        vm.expectRevert(
            abi.encodeWithSelector(
                IOnchainMediaStoreFactory.MediaCodehashMismatch.selector,
                store,
                record.runtimeCodehash,
                media.runtimeCodehash
            )
        );
        factory.validateOnchainMedia(creator, media);
    }

    function test_readerRejectsWrongLengthDigestHashAndPrefix() public {
        bytes memory payload = _jpeg(0x4a);
        vm.prank(creator);
        address store = factory.store(payload, MembershipTypes.MediaMIME.JPEG);
        MembershipTypes.MediaRecord memory record = factory.mediaRecord(store);

        vm.expectRevert(
            abi.encodeWithSelector(
                CodeStoreReader.CodeStoreLengthMismatch.selector,
                store,
                uint256(record.length) + 2,
                uint256(record.length) + 1
            )
        );
        reader.read(store, record.length + 1, record.runtimeCodehash);

        vm.expectRevert(
            abi.encodeWithSelector(
                CodeStoreReader.CodeStoreHashMismatch.selector,
                store,
                bytes32(uint256(5)),
                record.runtimeCodehash
            )
        );
        reader.read(store, record.length, bytes32(uint256(5)));

        vm.expectRevert(
            abi.encodeWithSelector(
                CodeStoreReader.CodeStoreDigestMismatch.selector,
                store,
                bytes32(uint256(6)),
                record.digest
            )
        );
        reader.readAndValidate(store, record.length, bytes32(uint256(6)), record.runtimeCodehash);

        bytes memory invalidRuntime = abi.encodePacked(hex"01", payload);
        vm.etch(store, invalidRuntime);
        vm.expectRevert(
            abi.encodeWithSelector(
                CodeStoreReader.CodeStorePrefixMismatch.selector, store, bytes1(0x01)
            )
        );
        reader.read(store, record.length, keccak256(invalidRuntime));
    }

    function test_creatorPaginationIsBoundedStableAndContainsNoPayloadBytes() public {
        address[] memory stores = new address[](3);
        vm.startPrank(creator);
        stores[0] = factory.store(_png(0x50), MembershipTypes.MediaMIME.PNG);
        stores[1] = factory.store(_png(0x51), MembershipTypes.MediaMIME.PNG);
        stores[2] = factory.store(_png(0x52), MembershipTypes.MediaMIME.PNG);
        vm.stopPrank();

        MembershipTypes.MediaRecord[] memory first = factory.creatorMedia(creator, 0, 2);
        MembershipTypes.MediaRecord[] memory second = factory.creatorMedia(creator, 2, 2);
        assertEq(first.length, 2);
        assertEq(first[0].store, stores[0]);
        assertEq(first[1].store, stores[1]);
        assertEq(second.length, 1);
        assertEq(second[0].store, stores[2]);
        assertEq(factory.creatorMedia(creator, 3, 2).length, 0);
        assertEq(factory.creatorMedia(creator, 0, 0).length, 0);

        uint256 oversizedPage = factory.maxPageSize() + 1;
        vm.expectRevert(IOnchainMediaStoreFactory.InvalidPageSize.selector);
        factory.creatorMedia(creator, 0, oversizedPage);
    }

    function test_textValidationAcceptsUTF8AndXMLCharacters() public view {
        string memory international =
            string(abi.encodePacked("Fan caf", hex"c3a9", " ", hex"f09f8eb5"));
        string memory boundaries = string(abi.encodePacked("\t\n\r", hex"f0908080f48fbfbf"));

        assertTrue(textValidation.isValid(""));
        assertTrue(textValidation.isValid(international));
        assertTrue(textValidation.isValid(boundaries));
    }

    function test_textValidationRejectsMalformedUTF8AndForbiddenXMLCharacters() public {
        bytes[] memory invalid = new bytes[](9);
        invalid[0] = hex"00";
        invalid[1] = hex"0b";
        invalid[2] = hex"80";
        invalid[3] = hex"c080";
        invalid[4] = hex"e282";
        invalid[5] = hex"eda080";
        invalid[6] = hex"f4908080";
        invalid[7] = hex"efbfbe";
        invalid[8] = hex"f5808080";

        for (uint256 index; index < invalid.length; ++index) {
            string memory value = string(invalid[index]);
            assertFalse(textValidation.isValid(value));
            vm.expectRevert(TextValidation.InvalidText.selector);
            textValidation.validate(value);
        }
    }

    function testFuzz_textValidationAcceptsPrintableASCII(uint8 value) public view {
        value = uint8(bound(value, 0x20, 0x7e));
        bytes memory character = new bytes(1);
        character[0] = bytes1(value);
        assertTrue(textValidation.isValid(string(character)));
    }

    function _config(MembershipTypes.MediaRecord memory record)
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

    function _jpeg(bytes1 unique) private pure returns (bytes memory) {
        return abi.encodePacked(
            hex"ffd8fffe0003",
            unique,
            hex"ffdb00430006040506050406060506070706080a100a0a09090a140e0f0c1017141818171416161a1d251f1a1b231c1616202c20232627292a29191f2d302d283025282928ffdb0043010707070a080a130a0a13281a161a2828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828ffc00011080001000103012200021101031101ffc4001500010100000000000000000000000000000006ffc40014100100000000000000000000000000000000ffc4001501010100000000000000000000000000000506ffc40014110100000000000000000000000000000000ffda000c03010002110311003f008a014231ffd9"
        );
    }

    function _png(bytes1 unique) private pure returns (bytes memory) {
        bytes memory textData = abi.encodePacked(hex"7500", unique);
        bytes memory typeAndData = abi.encodePacked(hex"74455874", textData);
        bytes memory textChunk = abi.encodePacked(
            bytes4(uint32(textData.length)), typeAndData, bytes4(_crc32(typeAndData))
        );
        return abi.encodePacked(
            hex"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
            textChunk,
            hex"0000000970485953000003e8000003e801b57b526b0000000d49444154089963708ceaf90f00042e02276eb17cc20000000049454e44ae426082"
        );
    }

    function _jpegWithDimensions(uint16 width, uint16 height, bytes1 unique)
        private
        pure
        returns (bytes memory)
    {
        bytes memory payload = _jpeg(unique);
        for (uint256 index = 2; index + 8 < payload.length; ++index) {
            if (payload[index] == 0xff && payload[index + 1] == 0xc0) {
                _writeUint16(payload, index + 5, height);
                _writeUint16(payload, index + 7, width);
                return payload;
            }
        }
        revert("SOF not found");
    }

    function _pngWithDimensions(uint32 width, uint32 height, bytes1 unique)
        private
        pure
        returns (bytes memory)
    {
        bytes memory payload = _png(unique);
        _writeUint32(payload, 16, width);
        _writeUint32(payload, 20, height);
        _writeUint32(payload, 29, _crc32Range(payload, 12, 29));
        return payload;
    }

    function _writeUint16(bytes memory payload, uint256 cursor, uint16 value) private pure {
        payload[cursor] = _byte(value >> 8);
        payload[cursor + 1] = _byte(value);
    }

    function _writeUint32(bytes memory payload, uint256 cursor, uint32 value) private pure {
        payload[cursor] = _byte(value >> 24);
        payload[cursor + 1] = _byte(value >> 16);
        payload[cursor + 2] = _byte(value >> 8);
        payload[cursor + 3] = _byte(value);
    }

    function _byte(uint256 value) private pure returns (bytes1 result) {
        assembly ("memory-safe") {
            result := shl(248, and(value, 0xff))
        }
    }

    function _crc32(bytes memory payload) private pure returns (uint32) {
        return _crc32Range(payload, 0, payload.length);
    }

    function _crc32Range(bytes memory payload, uint256 cursor, uint256 end)
        private
        pure
        returns (uint32)
    {
        uint32 crc = type(uint32).max;
        for (uint256 index = cursor; index < end; ++index) {
            crc ^= uint32(uint8(payload[index]));
            for (uint256 bit; bit < 8; ++bit) {
                crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
            }
        }
        return ~crc;
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

    function _findLog(Vm.Log[] memory logs, bytes32 signature)
        private
        pure
        returns (Vm.Log memory found)
    {
        for (uint256 index; index < logs.length; ++index) {
            if (logs[index].topics.length != 0 && logs[index].topics[0] == signature) {
                return logs[index];
            }
        }
        revert("log not found");
    }
}
