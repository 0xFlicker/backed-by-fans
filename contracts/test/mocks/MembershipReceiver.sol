// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev Receiver adversary: observes the public position, then optionally catches
/// or bubbles nested mutations. It never bypasses a production entry point.
contract MembershipReceiver is IERC721Receiver {
    enum Response {
        Accept,
        WrongSelector,
        RevertCallback
    }

    struct Observation {
        address operator;
        address from;
        address owner;
        address approved;
        uint256 tokenId;
        uint256 balance;
        uint256 enumeratedToken;
        uint256 shares;
        uint256 liability;
        uint256 gross;
        uint256 lots;
        uint256 expirationCount;
        uint64 expiration;
        bool eligible;
        bytes32 economicState;
    }

    MembershipTier public immutable tier;
    Response public response;
    bool public bubbleFailure;
    uint256 public callbackCount;
    bytes public lastData;
    Observation private _observed;
    bytes[] private _calls;
    bytes[] private _results;
    bool[] private _successes;

    error ReceiverRejected();
    error UnexpectedCaller();

    constructor(MembershipTier tier_) {
        tier = tier_;
    }

    function configure(Response response_, bytes[] memory calls_, bool bubbleFailure_) external {
        response = response_;
        bubbleFailure = bubbleFailure_;
        _calls = calls_;
        delete _results;
        delete _successes;
    }

    function execute(bytes calldata payload) external returns (bytes memory) {
        (bool success, bytes memory data) = address(tier).call(payload);
        if (!success) _bubble(data);
        return data;
    }

    function observed() external view returns (Observation memory) {
        return _observed;
    }

    function attempts() external view returns (uint256) {
        return _successes.length;
    }

    function succeeded(uint256 index) external view returns (bool) {
        return _successes[index];
    }

    function result(uint256 index) external view returns (bytes memory) {
        return _results[index];
    }

    function economicState(uint256 tokenId) public view returns (bytes32) {
        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        return keccak256(
            abi.encode(
                tier.allocationState(tokenId),
                tier.reserveState(),
                tier.accountingStatus(),
                tier.expiresAt(tokenId),
                tier.sharesOf(tokenId),
                tier.claimableReward(tokenId),
                tier.lifetimeGross(),
                status,
                referrer
            )
        );
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4)
    {
        if (msg.sender != address(tier)) revert UnexpectedCaller();
        ++callbackCount;
        lastData = data;
        _observed.operator = operator;
        _observed.from = from;
        _observed.owner = tier.ownerOf(tokenId);
        _observed.approved = tier.getApproved(tokenId);
        _observed.tokenId = tokenId;
        _observed.balance = tier.balanceOf(address(this));
        _observed.enumeratedToken = tier.tokensOfOwner(address(this), 0, 1).tokenIds[0];
        _observed.shares = tier.sharesOf(tokenId);
        _observed.liability = tier.totalProtectedLiability();
        _observed.gross = tier.lifetimeGross();
        _observed.lots = tier.allocationState(tokenId).lotCount;
        _observed.expirationCount = tier.accountingStatus().scheduledExpirations;
        _observed.expiration = tier.expiresAt(tokenId);
        _observed.eligible = tier.rewardEligible(tokenId);
        _observed.economicState = economicState(tokenId);

        if (response == Response.RevertCallback) revert ReceiverRejected();
        if (response == Response.WrongSelector) return bytes4(0);
        for (uint256 i; i < _calls.length; ++i) {
            (bool success, bytes memory returned) = address(tier).call(_calls[i]);
            if (!success && bubbleFailure) _bubble(returned);
            _successes.push(success);
            _results.push(returned);
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function _bubble(bytes memory data) private pure {
        assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
    }
}
