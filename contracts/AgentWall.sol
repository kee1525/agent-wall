// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal read interface of the SPACE ID Agent ID contract (ERC-721).
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentWall — the on-chain guestbook for Agent ID holders
/// @notice Only wallets holding an Agent ID (.ai) can sign the wall.
///         Each holder keeps one entry; signing again updates the message.
///         The contract is ownerless, non-upgradeable, and holds no funds.
contract AgentWall {
    /// @notice The Agent ID contract this wall gates on (immutable, set at deploy).
    IAgentID public immutable agentID;

    /// @notice Maximum message size in bytes.
    uint256 public constant MAX_MESSAGE_BYTES = 280;

    struct Entry {
        string message;
        uint256 updatedAt;
        uint256 signCount;
    }

    mapping(address => Entry) private _entries;
    mapping(address => bool) private _isSigner;
    address[] private _signers;

    /// @notice Total number of sign() calls ever made.
    uint256 public totalSigns;

    event Signed(
        address indexed signer,
        string message,
        uint256 timestamp,
        bool firstTime
    );

    error NotAgentIDHolder();
    error EmptyMessage();
    error MessageTooLong();

    constructor(address agentIDContract) {
        require(agentIDContract != address(0), "agentID is zero address");
        agentID = IAgentID(agentIDContract);
    }

    /// @notice Sign the wall, or update your existing message.
    /// @param message Your message, 1 to 280 bytes of UTF-8 text.
    function sign(string calldata message) external {
        if (agentID.balanceOf(msg.sender) == 0) revert NotAgentIDHolder();
        uint256 len = bytes(message).length;
        if (len == 0) revert EmptyMessage();
        if (len > MAX_MESSAGE_BYTES) revert MessageTooLong();

        bool first = !_isSigner[msg.sender];
        if (first) {
            _isSigner[msg.sender] = true;
            _signers.push(msg.sender);
        }
        Entry storage e = _entries[msg.sender];
        e.message = message;
        e.updatedAt = block.timestamp;
        e.signCount += 1;
        totalSigns += 1;

        emit Signed(msg.sender, message, block.timestamp, first);
    }

    /// @notice Number of distinct Agent ID holders who have signed.
    function signerCount() external view returns (uint256) {
        return _signers.length;
    }

    /// @notice Whether an address has ever signed the wall.
    function hasSigned(address who) external view returns (bool) {
        return _isSigner[who];
    }

    /// @notice The current entry of an address (empty message if never signed).
    function entryOf(
        address who
    ) external view returns (string memory message, uint256 updatedAt, uint256 signCount) {
        Entry storage e = _entries[who];
        return (e.message, e.updatedAt, e.signCount);
    }

    /// @notice Paginated list of signer addresses, in first-sign order.
    function signers(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory page) {
        uint256 total = _signers.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _signers[i];
        }
    }
}
