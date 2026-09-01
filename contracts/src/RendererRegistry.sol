// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IRendererRegistry} from "./interfaces/IRendererRegistry.sol";

/// @notice Permissionless renderer deployment and per-wallet enumeration.
/// @dev Registration is an indexing convenience. Membership tiers continue to accept compatible
///      renderer addresses without consulting this contract.
contract RendererRegistry is IRendererRegistry, ReentrancyGuard {
    bytes32 public constant override rendererSchema =
        0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    uint256 public constant override maxPageSize = 100;
    // Leaves room for the ABI envelope and a conservatively large signed EIP-1559 envelope under
    // Robinhood Nitro's 95,000-byte transaction limit.
    uint256 public constant override maxInitCodeBytes = 94_656;

    address[] private _creators;
    mapping(address creator => bool known) public override isCreator;
    mapping(address renderer => address creator) public override creatorOf;
    mapping(address owner => mapping(address renderer => RegistrationKind kind))
        public
        override registrationKind;
    mapping(address owner => address[] renderers) private _createdRenderers;
    mapping(address owner => address[] renderers) private _savedRenderers;
    mapping(address owner => mapping(address renderer => uint256 indexPlusOne)) private
        _createdIndexPlusOne;
    mapping(address owner => mapping(address renderer => uint256 indexPlusOne)) private
        _savedIndexPlusOne;

    error DeploymentFailed();
    error DuplicateRegistration(address owner, address renderer);
    error EmptyInitCode();
    error InitCodeTooLarge(uint256 maximum, uint256 actual);
    error InvalidPageSize(uint256 maximum, uint256 actual);
    error InvalidRenderer(address renderer);
    error InvalidRendererSchema(bytes32 expected, bytes32 actual);
    error RendererNotRegistered(address owner, address renderer);

    function deployAndRegister(bytes calldata initCode)
        external
        override
        nonReentrant
        returns (address renderer)
    {
        uint256 length = initCode.length;
        if (length == 0) revert EmptyInitCode();
        if (length > maxInitCodeBytes) revert InitCodeTooLarge(maxInitCodeBytes, length);

        bytes memory creationCode = initCode;
        assembly ("memory-safe") {
            renderer := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        if (renderer == address(0) || renderer.code.length == 0) revert DeploymentFailed();

        _validateRenderer(renderer);
        creatorOf[renderer] = msg.sender;

        if (!isCreator[msg.sender]) {
            uint256 creatorIndex = _creators.length;
            isCreator[msg.sender] = true;
            _creators.push(msg.sender);
            emit CreatorAdded(msg.sender, creatorIndex);
        }

        uint256 createdIndex = _register(msg.sender, renderer, RegistrationKind.Created);
        emit RendererDeployed(msg.sender, renderer, keccak256(initCode), createdIndex);
    }

    function register(address renderer) external override nonReentrant {
        _validateRenderer(renderer);
        RegistrationKind kind =
            creatorOf[renderer] == msg.sender ? RegistrationKind.Created : RegistrationKind.Saved;
        _register(msg.sender, renderer, kind);
    }

    function unregister(address renderer) external override nonReentrant {
        RegistrationKind kind = registrationKind[msg.sender][renderer];
        if (kind == RegistrationKind.None) {
            revert RendererNotRegistered(msg.sender, renderer);
        }

        if (kind == RegistrationKind.Created) {
            _remove(_createdRenderers[msg.sender], _createdIndexPlusOne[msg.sender], renderer);
        } else {
            _remove(_savedRenderers[msg.sender], _savedIndexPlusOne[msg.sender], renderer);
        }
        delete registrationKind[msg.sender][renderer];
        emit RendererUnregistered(msg.sender, renderer, kind);
    }

    function creatorCount() external view override returns (uint256) {
        return _creators.length;
    }

    function creators(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        return _page(_creators, offset, limit);
    }

    function createdRendererCount(address owner) external view override returns (uint256) {
        return _createdRenderers[owner].length;
    }

    function createdRenderers(address owner, uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        return _page(_createdRenderers[owner], offset, limit);
    }

    function savedRendererCount(address owner) external view override returns (uint256) {
        return _savedRenderers[owner].length;
    }

    function savedRenderers(address owner, uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        return _page(_savedRenderers[owner], offset, limit);
    }

    function _register(address owner, address renderer, RegistrationKind kind)
        private
        returns (uint256 index)
    {
        if (registrationKind[owner][renderer] != RegistrationKind.None) {
            revert DuplicateRegistration(owner, renderer);
        }

        registrationKind[owner][renderer] = kind;
        if (kind == RegistrationKind.Created) {
            index = _createdRenderers[owner].length;
            _createdRenderers[owner].push(renderer);
            _createdIndexPlusOne[owner][renderer] = index + 1;
        } else {
            index = _savedRenderers[owner].length;
            _savedRenderers[owner].push(renderer);
            _savedIndexPlusOne[owner][renderer] = index + 1;
        }
        emit RendererRegistered(owner, renderer, kind, index);
    }

    function _remove(
        address[] storage renderers,
        mapping(address renderer => uint256 indexPlusOne) storage indexes,
        address renderer
    ) private {
        uint256 index = indexes[renderer] - 1;
        uint256 lastIndex = renderers.length - 1;
        if (index != lastIndex) {
            address moved = renderers[lastIndex];
            renderers[index] = moved;
            indexes[moved] = index + 1;
        }
        renderers.pop();
        delete indexes[renderer];
    }

    function _validateRenderer(address renderer) private view {
        if (renderer == address(0) || renderer.code.length == 0) {
            revert InvalidRenderer(renderer);
        }

        bytes32 observed;
        try IMembershipRenderer(renderer).rendererSchema() returns (bytes32 schema) {
            observed = schema;
        } catch {
            revert InvalidRenderer(renderer);
        }
        if (observed != rendererSchema) {
            revert InvalidRendererSchema(rendererSchema, observed);
        }
    }

    function _page(address[] storage values, uint256 offset, uint256 limit)
        private
        view
        returns (address[] memory page)
    {
        if (limit > maxPageSize) revert InvalidPageSize(maxPageSize, limit);
        uint256 length = values.length;
        if (offset >= length || limit == 0) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;
        page = new address[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = values[offset + i];
        }
    }
}
