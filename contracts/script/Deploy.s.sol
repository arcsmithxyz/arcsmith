// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {DeployBase} from "./DeployBase.sol";

/// @notice Deploys the whole platform to Arc mainnet or testnet and writes
/// deployments/<chainId>.json for the web app (on a real broadcast only).
///
/// Env (all optional): OWNER (curator + launchpad owner) and TREASURY (default: deployer),
/// PROTOCOL_SHARE_BPS (default 2000 = 20%), LAUNCH_TICK (default -398400 ≈ $5,000 FDV).
/// If OWNER isn't the deployer, the catalog's ownership is *offered* to OWNER (two-step);
/// OWNER must call acceptOwnership() on the catalog to become curator.
///
/// Dry run:  forge script script/Deploy.s.sol --rpc-url arc_testnet --sender <address>
/// Deploy:   forge script script/Deploy.s.sol --rpc-url arc_testnet --private-key $KEY --broadcast
contract Deploy is DeployBase {
    uint256 internal constant ARC_MAINNET = 5042;
    uint256 internal constant ARC_TESTNET = 5042002;
    // Same addresses on Arc mainnet and testnet (verified with eth_getCode on both).
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        require(block.chainid == ARC_MAINNET || block.chainid == ARC_TESTNET, "Deploy: not Arc mainnet or testnet");
        _requireCode("PoolManager", POOL_MANAGER);
        _requireCode("USDC", USDC);
        _requireCode("CREATE2 deployer", CREATE2_DEPLOYER);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);
        uint16 protocolShareBps = uint16(vm.envOr("PROTOCOL_SHARE_BPS", uint256(2_000)));
        int24 launchTick = int24(vm.envOr("LAUNCH_TICK", int256(-398_400)));

        Platform memory p = deployPlatform(IPoolManager(POOL_MANAGER), USDC, deployer, launchTick, treasury, protocolShareBps, owner);
        if (owner != deployer) p.catalog.transferOwnership(owner);
        vm.stopBroadcast();

        logPlatform(p);
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console2.log("Dry run: deployments file not written.");
            return;
        }
        writeDeployment(p, POOL_MANAGER, USDC, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }

    function _requireCode(string memory label, address target) internal view {
        require(target.code.length > 0, string.concat("Deploy: no code at ", label));
    }
}
