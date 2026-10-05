// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title BlockCatalog
/// @notice The list of rule blocks pools may use. Anyone can submit a deployed block; the
/// curator (owner) reviews it and approves or rejects it. Approval pins the block's code
/// hash, so what runs in pools is exactly what was reviewed. Approved blocks earn their
/// author a royalty: a share of the protocol's cut of fees from every launch using them.
///
/// Retiring a block stops *new* pools from using it. Pools that already use it keep it:
/// their rules are frozen and nothing here can change them.
contract BlockCatalog is Ownable2Step {
    enum Status {
        None,
        Pending,
        Approved,
        Rejected,
        Retired
    }

    struct Entry {
        address author;
        bytes32 codehash;
        Status status;
        uint16 royaltyBps;
        uint40 submittedAt;
        string metadataURI;
    }

    /// Royalty ceiling per block, as a share of the protocol's cut. With at most five
    /// blocks per pool, royalties can never exceed the protocol's cut itself.
    uint16 public constant MAX_ROYALTY_BPS = 2_000;
    /// Room for an inline data: URI carrying the block's JSON description and config schema.
    uint256 internal constant MAX_METADATA_LENGTH = 2_048;

    mapping(address blk => Entry) internal _entries;
    address[] internal _blocks;

    event Submitted(address indexed blk, address indexed author, string metadataURI);
    event Approved(address indexed blk, uint16 royaltyBps);
    event Rejected(address indexed blk, string reason);
    event Retired(address indexed blk);
    event AuthorChanged(address indexed blk, address indexed author);

    error NotAContract();
    error InvalidStatus(Status status);
    error CodeChanged();
    error InvalidRoyalty();
    error NotAuthor();
    error ZeroAddress();
    error MetadataTooLong();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Submits a deployed block for review. The caller becomes its author and
    /// royalty recipient. A rejected block can be resubmitted (e.g. after a redeploy).
    function submit(address blk, string calldata metadataURI) external {
        if (blk.code.length == 0) revert NotAContract();
        if (bytes(metadataURI).length > MAX_METADATA_LENGTH) revert MetadataTooLong();
        Entry storage entry = _entries[blk];
        if (entry.status != Status.None && entry.status != Status.Rejected) revert InvalidStatus(entry.status);
        if (entry.status == Status.None) _blocks.push(blk);

        entry.author = msg.sender;
        entry.codehash = blk.codehash;
        entry.status = Status.Pending;
        entry.royaltyBps = 0;
        entry.submittedAt = uint40(block.timestamp);
        entry.metadataURI = metadataURI;
        emit Submitted(blk, msg.sender, metadataURI);
    }

    function approve(address blk, uint16 royaltyBps) external onlyOwner {
        Entry storage entry = _entries[blk];
        if (entry.status != Status.Pending) revert InvalidStatus(entry.status);
        if (blk.codehash != entry.codehash) revert CodeChanged();
        if (royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty();
        entry.status = Status.Approved;
        entry.royaltyBps = royaltyBps;
        emit Approved(blk, royaltyBps);
    }

    function reject(address blk, string calldata reason) external onlyOwner {
        Entry storage entry = _entries[blk];
        if (entry.status != Status.Pending) revert InvalidStatus(entry.status);
        entry.status = Status.Rejected;
        emit Rejected(blk, reason);
    }

    function retire(address blk) external onlyOwner {
        Entry storage entry = _entries[blk];
        if (entry.status != Status.Approved) revert InvalidStatus(entry.status);
        entry.status = Status.Retired;
        emit Retired(blk);
    }

    /// @notice Moves a block's royalties to a new address. Only its current author.
    function setAuthor(address blk, address author) external {
        Entry storage entry = _entries[blk];
        if (msg.sender != entry.author) revert NotAuthor();
        if (author == address(0)) revert ZeroAddress();
        entry.author = author;
        emit AuthorChanged(blk, author);
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    /// @notice True when new pools may use `blk`: approved, and its code is the reviewed code.
    function isUsable(address blk) external view returns (bool) {
        Entry storage entry = _entries[blk];
        return entry.status == Status.Approved && blk.codehash == entry.codehash;
    }

    function entryOf(address blk) external view returns (Entry memory) {
        return _entries[blk];
    }

    function authorOf(address blk) external view returns (address) {
        return _entries[blk].author;
    }

    function royaltyBpsOf(address blk) external view returns (uint16) {
        return _entries[blk].royaltyBps;
    }

    function blockCount() external view returns (uint256) {
        return _blocks.length;
    }

    function getBlocks(uint256 start, uint256 count) external view returns (address[] memory page) {
        uint256 total = _blocks.length;
        if (start >= total) return page;
        uint256 end = start + count > total ? total : start + count;
        page = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = _blocks[i];
        }
    }
}
