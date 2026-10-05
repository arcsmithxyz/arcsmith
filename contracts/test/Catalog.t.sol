// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BlockCatalog} from "../src/BlockCatalog.sol";
import {SurgeBlock} from "../src/blocks/SurgeBlock.sol";

contract CatalogTest is Test {
    BlockCatalog internal catalog;
    SurgeBlock internal blk;
    address internal curator = makeAddr("curator");
    address internal author = makeAddr("author");

    function setUp() public {
        catalog = new BlockCatalog(curator);
        blk = new SurgeBlock();
    }

    function test_submit_recordsPendingEntry() public {
        vm.prank(author);
        catalog.submit(address(blk), "ipfs://surge");
        BlockCatalog.Entry memory e = catalog.entryOf(address(blk));
        assertEq(uint8(e.status), uint8(BlockCatalog.Status.Pending));
        assertEq(e.author, author);
        assertEq(e.codehash, address(blk).codehash);
        assertEq(e.metadataURI, "ipfs://surge");
        assertFalse(catalog.isUsable(address(blk)), "pending blocks are not usable");
        assertEq(catalog.blockCount(), 1);
    }

    function test_submit_rejectsNonContractsAndDoubleSubmission() public {
        vm.expectRevert(BlockCatalog.NotAContract.selector);
        catalog.submit(makeAddr("eoa"), "");

        catalog.submit(address(blk), "");
        vm.expectRevert(abi.encodeWithSelector(BlockCatalog.InvalidStatus.selector, BlockCatalog.Status.Pending));
        catalog.submit(address(blk), "");
    }

    function test_approve_onlyCuratorAndBoundedRoyalty() public {
        catalog.submit(address(blk), "");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        catalog.approve(address(blk), 0);

        vm.startPrank(curator);
        vm.expectRevert(BlockCatalog.InvalidRoyalty.selector);
        catalog.approve(address(blk), 2_001);
        catalog.approve(address(blk), 2_000);
        vm.stopPrank();

        assertTrue(catalog.isUsable(address(blk)));
        assertEq(catalog.royaltyBpsOf(address(blk)), 2_000);
    }

    function test_reject_allowsResubmission() public {
        catalog.submit(address(blk), "v1");
        vm.prank(curator);
        catalog.reject(address(blk), "config can brick pools");
        assertEq(uint8(catalog.entryOf(address(blk)).status), uint8(BlockCatalog.Status.Rejected));

        vm.prank(author);
        catalog.submit(address(blk), "v2");
        BlockCatalog.Entry memory e = catalog.entryOf(address(blk));
        assertEq(uint8(e.status), uint8(BlockCatalog.Status.Pending));
        assertEq(e.author, author);
        assertEq(catalog.blockCount(), 1, "resubmission must not duplicate the listing");
    }

    function test_retire_stopsNewUseOnly() public {
        catalog.submit(address(blk), "");
        vm.startPrank(curator);
        catalog.approve(address(blk), 0);
        catalog.retire(address(blk));
        vm.stopPrank();
        assertFalse(catalog.isUsable(address(blk)));
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(BlockCatalog.InvalidStatus.selector, BlockCatalog.Status.Retired));
        catalog.retire(address(blk));
    }

    function test_setAuthor_onlyCurrentAuthor() public {
        vm.prank(author);
        catalog.submit(address(blk), "");
        vm.expectRevert(BlockCatalog.NotAuthor.selector);
        catalog.setAuthor(address(blk), address(this));

        address next = makeAddr("next");
        vm.prank(author);
        catalog.setAuthor(address(blk), next);
        assertEq(catalog.authorOf(address(blk)), next);
    }

    function test_getBlocks_paginates() public {
        catalog.submit(address(blk), "");
        catalog.submit(address(new SurgeBlock()), "");
        catalog.submit(address(new SurgeBlock()), "");
        assertEq(catalog.getBlocks(0, 2).length, 2);
        assertEq(catalog.getBlocks(2, 5).length, 1);
        assertEq(catalog.getBlocks(9, 5).length, 0);
    }
}
