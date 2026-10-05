// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {HookKernel} from "../../src/HookKernel.sol";
import {BlockCatalog} from "../../src/BlockCatalog.sol";
import {Launchpad} from "../../src/Launchpad.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {GuardBlock} from "../../src/blocks/GuardBlock.sol";
import {DamperBlock} from "../../src/blocks/DamperBlock.sol";
import {BurnBlock} from "../../src/blocks/BurnBlock.sol";
import {SurgeBlock} from "../../src/blocks/SurgeBlock.sol";
import {HookMiner} from "../../script/HookMiner.sol";
import {ArcTestBase} from "./ArcTestBase.sol";

/// @notice End to end on a fork of Arc mainnet: the real Uniswap v4 PoolManager, real USDC
/// (precompiles stubbed, see ArcTestBase), and the kernel deployed exactly as the deploy
/// script does it — a mined salt through the canonical CREATE2 factory.
///
/// Run: forge test --match-path "test/fork/*"
contract ArcForkTest is ArcTestBase {
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );
    int24 internal constant LAUNCH_TICK = -398_400;

    IPoolManager internal manager = IPoolManager(POOL_MANAGER);
    BlockCatalog internal catalog;
    HookKernel internal kernel;
    Launchpad internal launchpad;
    LaunchRouter internal router;
    LiquidityManager internal liquidity;
    GuardBlock internal guard;
    DamperBlock internal damper;
    BurnBlock internal burn;
    SurgeBlock internal surge;

    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");

    function setUp() public {
        setUpArcFork();

        catalog = new BlockCatalog(address(this));
        guard = new GuardBlock();
        damper = new DamperBlock();
        burn = new BurnBlock();
        surge = new SurgeBlock();
        address[4] memory natives = [address(guard), address(damper), address(burn), address(surge)];
        for (uint256 i; i < natives.length; i++) {
            catalog.submit(natives[i], "native");
            catalog.approve(natives[i], 0);
        }

        bytes memory args = abi.encode(address(manager), address(catalog), address(this));
        (address predicted, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, HOOK_FLAGS, type(HookKernel).creationCode, args);
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, type(HookKernel).creationCode, args));
        require(ok && predicted.code.length > 0, "CREATE2 kernel deployment failed");
        kernel = HookKernel(predicted);

        launchpad = new Launchpad(manager, kernel, Currency.wrap(USDC), LAUNCH_TICK, treasury, 2_000, address(this));
        kernel.bindLaunchpad(address(launchpad));
        router = new LaunchRouter(manager);
        liquidity = new LiquidityManager(manager);
    }

    function test_fork_kernelDeployedAtFlaggedAddress() public view {
        assertEq(uint160(address(kernel)) & Hooks.ALL_HOOK_MASK, HOOK_FLAGS);
        assertEq(address(kernel.poolManager()), POOL_MANAGER);
        assertEq(kernel.launchpad(), address(launchpad));
    }

    function test_fork_launchTradeCollectThenOpenAMarket() public {
        Launchpad.Rules memory rules;
        rules.baseFee = 10_000;
        rules.blocks = new address[](3);
        rules.configs = new bytes[](3);
        (rules.blocks[0], rules.configs[0]) = (address(guard), abi.encode(uint24(290_000), uint32(180), uint16(100)));
        (rules.blocks[1], rules.configs[1]) = (address(damper), abi.encode(uint32(500_000), uint24(70_000)));
        (rules.blocks[2], rules.configs[2]) = (address(burn), abi.encode(uint16(50)));

        vm.prank(creator);
        (uint256 id, address token) = launchpad.launch(
            Launchpad.LaunchParams({name: "Fork Token", symbol: "FORK", imageURI: "", description: "", website: "", rules: rules})
        );
        (Launchpad.Market memory m,) = launchpad.getMarket(id);
        PoolKey memory key = launchpad.poolKeyOf(id);
        emit log_named_string("token side", m.subjectIsCurrency0 ? "currency0" : "currency1");
        assertGt(IERC20(token).balanceOf(POOL_MANAGER), 999_999_999e18);

        // Buy after the guard with real USDC; the burn block burns part of it.
        vm.warp(vm.getBlockTimestamp() + 181);
        dealUsdc(alice, 2_000e6);
        vm.startPrank(alice);
        IERC20(USDC).approve(address(router), type(uint256).max);
        (, uint256 quoted) = router.quoteExactIn(key, !m.subjectIsCurrency0, 500e6, 0);
        (uint256 paid, uint256 bought) = router.swapExactIn(key, !m.subjectIsCurrency0, 500e6, quoted, 0, alice, type(uint256).max);
        assertEq(paid, 500e6);
        assertEq(bought, quoted);
        assertGt(IERC20(token).balanceOf(kernel.DEAD()), 0, "auto-burn did not burn");

        // Sell half back: the damper reacts.
        IERC20(token).approve(address(router), type(uint256).max);
        (, uint256 usdcBack) = router.swapExactIn(key, m.subjectIsCurrency0, bought / 2, 0, 0, alice, type(uint256).max);
        vm.stopPrank();
        assertGt(usdcBack, 0);
        (, uint24 sellFee) = kernel.previewFees(m.poolId);
        assertGt(sellFee, 10_000, "damper did not react to a large sell");

        // Creator collects and claims real USDC.
        uint256 before = IERC20(USDC).balanceOf(creator);
        vm.prank(creator);
        (, uint256 usdcFees) = launchpad.collectAndClaim(id);
        assertGt(usdcFees, 3e6);
        assertEq(IERC20(USDC).balanceOf(creator) - before, usdcFees);

        // Second lane: a surge-only market for the same token at a different spacing, with
        // real-USDC liquidity through the LiquidityManager.
        Launchpad.Rules memory surgeOnly;
        surgeOnly.baseFee = 3_000;
        surgeOnly.blocks = new address[](1);
        surgeOnly.configs = new bytes[](1);
        (surgeOnly.blocks[0], surgeOnly.configs[0]) = (address(surge), abi.encode(uint32(300_000), uint24(20_000)));
        (uint160 sqrtPriceX96,,) = launchpad.marketState(id);

        vm.startPrank(alice);
        uint256 marketId = launchpad.openMarket(
            Launchpad.OpenParams({subject: token, quote: USDC, tickSpacing: 60, sqrtPriceX96: sqrtPriceX96, rules: surgeOnly})
        );
        PoolKey memory marketKey = launchpad.poolKeyOf(marketId);
        IERC20(USDC).approve(address(liquidity), type(uint256).max);
        IERC20(token).approve(address(liquidity), type(uint256).max);
        uint256 tokens = IERC20(token).balanceOf(alice);
        (uint256 max0, uint256 max1) = m.subjectIsCurrency0 ? (tokens, uint256(100e6)) : (uint256(100e6), tokens);
        (uint128 added,) = liquidity.addLiquidity(marketKey, max0, max1, type(uint256).max);
        assertGt(added, 0);
        liquidity.removeLiquidity(marketKey, added, 0, 0, type(uint256).max);
        vm.stopPrank();
        assertTrue(TickMath.MIN_SQRT_PRICE < sqrtPriceX96);
    }
}
