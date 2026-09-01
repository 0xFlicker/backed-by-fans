// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Permissionless renderer deployment and per-wallet enumeration.
interface IRendererRegistry {
    enum RegistrationKind {
        None,
        Created,
        Saved
    }

    event CreatorAdded(address indexed creator, uint256 indexed creatorIndex);
    event RendererDeployed(
        address indexed creator,
        address indexed renderer,
        bytes32 indexed initCodeHash,
        uint256 createdIndex
    );
    event RendererRegistered(
        address indexed owner,
        address indexed renderer,
        RegistrationKind indexed kind,
        uint256 index
    );
    event RendererUnregistered(
        address indexed owner, address indexed renderer, RegistrationKind indexed kind
    );

    function rendererSchema() external view returns (bytes32);

    function maxPageSize() external view returns (uint256);

    function maxInitCodeBytes() external view returns (uint256);

    function deployAndRegister(bytes calldata initCode) external returns (address renderer);

    function register(address renderer) external;

    function unregister(address renderer) external;

    function creatorOf(address renderer) external view returns (address);

    function isCreator(address account) external view returns (bool);

    function registrationKind(address owner, address renderer)
        external
        view
        returns (RegistrationKind);

    function creatorCount() external view returns (uint256);

    function creators(uint256 offset, uint256 limit) external view returns (address[] memory page);

    function createdRendererCount(address owner) external view returns (uint256);

    function createdRenderers(address owner, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page);

    function savedRendererCount(address owner) external view returns (uint256);

    function savedRenderers(address owner, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page);
}
