// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {HookKernel} from "../src/HookKernel.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LiquidityManager} from "../src/LiquidityManager.sol";
import {ArcPrecompiles} from "./ArcPrecompiles.sol";

/// @notice Exercises a live deployment end to end with small amounts: launch a token with
/// guard + damper, buy $1 during the guard, sell half back, collect creator fees, then open
/// a surge-only market for the same token and add and remove $0.50 of liquidity.
/// Reads addresses from deployments/<chainId>.json.
///
/// Run (--skip-simulation is required, see ArcPrecompiles):
///   forge script script/Smoke.s.sol --rpc-url arc_testnet --private-key $TESTNET_PRIVATE_KEY \
///     --broadcast --slow --skip-simulation
contract Smoke is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        Launchpad launchpad = Launchpad(vm.parseJsonAddress(json, ".launchpad"));
        HookKernel kernel = HookKernel(vm.parseJsonAddress(json, ".kernel"));
        LaunchRouter router = LaunchRouter(vm.parseJsonAddress(json, ".router"));
        LiquidityManager liquidity = LiquidityManager(vm.parseJsonAddress(json, ".liquidityManager"));

        Launchpad.Rules memory rules;
        rules.baseFee = 10_000;
        rules.blocks = new address[](2);
        rules.configs = new bytes[](2);
        rules.blocks[0] = vm.parseJsonAddress(json, ".guardBlock");
        rules.configs[0] = abi.encode(uint24(290_000), uint32(180), uint16(100));
        rules.blocks[1] = vm.parseJsonAddress(json, ".damperBlock");
        rules.configs[1] = abi.encode(uint32(500_000), uint24(70_000));

        // Forge's local run can't execute Arc's USDC precompiles, so stub them locally. The
        // broadcast transactions still run against the real precompiles on Arc.
        ArcPrecompiles.stub(vm);

        vm.startBroadcast();
        (, address me,) = vm.readCallers();

        (uint256 id, address token) = launchpad.launch(
            Launchpad.LaunchParams({
                name: "Smoke Test",
                symbol: "SMOKE",
                imageURI: "",
                description: "Deployment smoke test. Not a real token.",
                website: "",
                rules: rules
            })
        );
        (Launchpad.Market memory m,) = launchpad.getMarket(id);
        PoolKey memory key = launchpad.poolKeyOf(id);

        IERC20(USDC).approve(address(router), 1e6);
        (, uint256 bought) = router.swapExactIn(key, !m.subjectIsCurrency0, 1e6, 1, 0, me, block.timestamp + 300);
        IERC20(token).approve(address(router), bought / 2);
        (, uint256 usdcBack) = router.swapExactIn(key, m.subjectIsCurrency0, bought / 2, 1, 0, me, block.timestamp + 300);
        (uint256 tokenFees, uint256 usdcFees) = launchpad.collectAndClaim(id);

        // Second lane on the same token.
        Launchpad.Rules memory surgeOnly;
        surgeOnly.baseFee = 3_000;
        surgeOnly.blocks = new address[](1);
        surgeOnly.configs = new bytes[](1);
        surgeOnly.blocks[0] = vm.parseJsonAddress(json, ".surgeBlock");
        surgeOnly.configs[0] = abi.encode(uint32(300_000), uint24(20_000));
        (uint160 sqrtPriceX96,,) = launchpad.marketState(id);
        uint256 marketId = launchpad.openMarket(
            Launchpad.OpenParams({subject: token, quote: USDC, tickSpacing: 60, sqrtPriceX96: sqrtPriceX96, rules: surgeOnly})
        );
        PoolKey memory marketKey = launchpad.poolKeyOf(marketId);
        uint256 tokens = IERC20(token).balanceOf(me);
        IERC20(token).approve(address(liquidity), tokens);
        IERC20(USDC).approve(address(liquidity), 5e5);
        (uint256 max0, uint256 max1) = m.subjectIsCurrency0 ? (tokens, uint256(5e5)) : (uint256(5e5), tokens);
        (uint128 added,) = liquidity.addLiquidity(marketKey, max0, max1, block.timestamp + 300);
        liquidity.removeLiquidity(marketKey, added, 0, 0, block.timestamp + 300);
        vm.stopBroadcast();

        (uint24 buyFee, uint24 sellFee) = kernel.previewFees(m.poolId);
        console2.log("launch id          ", id);
        console2.log("token              ", token);
        console2.log("bought (tokens)    ", bought);
        console2.log("sold back, USDC    ", usdcBack);
        console2.log("creator fees, token", tokenFees);
        console2.log("creator fees, USDC ", usdcFees);
        console2.log("buy fee now (pips) ", buyFee);
        console2.log("sell fee now (pips)", sellFee);
        console2.log("market id          ", marketId);
        console2.log("liquidity added    ", added);
    }
}
