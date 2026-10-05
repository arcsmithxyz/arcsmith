// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArcPrecompiles} from "../../script/ArcPrecompiles.sol";

/// @notice Shared setup for tests that fork Arc mainnet and move real USDC.
/// Carried over from the earlier arc-launchpad project, where these workarounds were
/// found by iterating against the live contracts.
///
/// Arc's USDC moves native balance through system precompiles a forge fork can't run (see
/// script/ArcPrecompiles.sol). Workarounds:
///  1. Fund USDC with `vm.deal(account, usdcAmount * 1e12)` — native balance, 18 decimals.
///  2. Stub both precompiles with working stand-ins.
abstract contract ArcTestBase is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function setUpArcFork() internal {
        vm.createSelectFork(vm.rpcUrl("arc_mainnet"));
        assertEq(block.chainid, 5042, "not forked onto Arc mainnet");
        ArcPrecompiles.stub(vm);
    }

    /// @dev Funds `account` with `usdcAmount` (6-decimal units) of Arc USDC.
    function dealUsdc(address account, uint256 usdcAmount) internal {
        vm.deal(account, account.balance + usdcAmount * 1e12);
    }
}
