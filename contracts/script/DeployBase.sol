// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {HookKernel} from "../src/HookKernel.sol";
import {BlockCatalog} from "../src/BlockCatalog.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LiquidityManager} from "../src/LiquidityManager.sol";
import {GuardBlock} from "../src/blocks/GuardBlock.sol";
import {DamperBlock} from "../src/blocks/DamperBlock.sol";
import {BurnBlock} from "../src/blocks/BurnBlock.sol";
import {SurgeBlock} from "../src/blocks/SurgeBlock.sol";
import {HookMiner} from "./HookMiner.sol";
import {BlockMetadata} from "./BlockMetadata.sol";

/// @notice The deployment sequence shared by Deploy.s.sol (Arc) and DeployLocal.s.sol
/// (Anvil), so the two can never drift. Must run inside a broadcast.
abstract contract DeployBase is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    struct Platform {
        BlockCatalog catalog;
        HookKernel kernel;
        Launchpad launchpad;
        LaunchRouter router;
        LiquidityManager liquidity;
        GuardBlock guard;
        DamperBlock damper;
        BurnBlock burn;
        SurgeBlock surge;
    }

    /// Deploys and wires everything. The broadcaster ends up as catalog curator (so it can
    /// approve the native blocks) and as the kernel's binder.
    function deployPlatform(
        IPoolManager manager,
        address usdc,
        address deployer,
        int24 launchTick,
        address treasury,
        uint16 protocolShareBps,
        address owner
    ) internal returns (Platform memory p) {
        p.catalog = new BlockCatalog(deployer);
        p.guard = new GuardBlock();
        p.damper = new DamperBlock();
        p.burn = new BurnBlock();
        p.surge = new SurgeBlock();
        address[4] memory natives = [address(p.guard), address(p.damper), address(p.burn), address(p.surge)];
        string[4] memory metadata =
            [BlockMetadata.guard(), BlockMetadata.damper(), BlockMetadata.burn(), BlockMetadata.surge()];
        for (uint256 i; i < natives.length; i++) {
            p.catalog.submit(natives[i], metadata[i]);
            p.catalog.approve(natives[i], 0);
        }

        bytes memory args = abi.encode(address(manager), address(p.catalog), deployer);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, HOOK_FLAGS, type(HookKernel).creationCode, args);
        p.kernel = new HookKernel{salt: salt}(manager, p.catalog, deployer);
        require(address(p.kernel) == predicted, "DeployBase: kernel landed at an unexpected address");

        p.launchpad = new Launchpad(manager, p.kernel, Currency.wrap(usdc), launchTick, treasury, protocolShareBps, owner);
        p.kernel.bindLaunchpad(address(p.launchpad));
        p.router = new LaunchRouter(manager);
        p.liquidity = new LiquidityManager(manager);
    }

    function logPlatform(Platform memory p) internal pure {
        console2.log("BlockCatalog    ", address(p.catalog));
        console2.log("HookKernel      ", address(p.kernel));
        console2.log("Launchpad       ", address(p.launchpad));
        console2.log("LaunchRouter    ", address(p.router));
        console2.log("LiquidityManager", address(p.liquidity));
    }

    function writeDeployment(Platform memory p, address poolManager, address usdc, string memory path) internal {
        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployedAtBlock", block.number);
        vm.serializeAddress(json, "poolManager", poolManager);
        vm.serializeAddress(json, "usdc", usdc);
        vm.serializeAddress(json, "catalog", address(p.catalog));
        vm.serializeAddress(json, "kernel", address(p.kernel));
        vm.serializeAddress(json, "launchpad", address(p.launchpad));
        vm.serializeAddress(json, "router", address(p.router));
        vm.serializeAddress(json, "liquidityManager", address(p.liquidity));
        vm.serializeAddress(json, "guardBlock", address(p.guard));
        vm.serializeAddress(json, "damperBlock", address(p.damper));
        vm.serializeAddress(json, "burnBlock", address(p.burn));
        string memory out = vm.serializeAddress(json, "surgeBlock", address(p.surge));
        vm.writeJson(out, path);
    }
}
