// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {HookKernel} from "../src/HookKernel.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LiquidityManager} from "../src/LiquidityManager.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {LaunchTestBase} from "./utils/LaunchTestBase.sol";

/// @notice The open-market lane (rules on a token that already exists) and the
/// LiquidityManager that lets anyone provide liquidity to those pools.
contract MarketTest is LaunchTestBase {
    MockToken internal existing;

    function setUp() public override {
        super.setUp();
        existing = new MockToken("Existing", "EXT");
        address[3] memory lps = [alice, bob, creator];
        for (uint256 i; i < lps.length; i++) {
            existing.mint(lps[i], 1_000_000e18);
            vm.startPrank(lps[i]);
            existing.approve(address(router), type(uint256).max);
            existing.approve(address(liquidity), type(uint256).max);
            vm.stopPrank();
        }
    }

    /// $2 per EXT (18 decimals) in USDC (6 decimals). USDC sits at a low address in these
    /// tests, so EXT is currency1 and the pool price (EXT per USDC, raw) is 5e11.
    function _open(Launchpad.Rules memory rules, int24 spacing) internal returns (uint256 id) {
        assertGt(uint160(address(existing)), uint160(address(usdc)), "test assumes EXT sorts above USDC");
        vm.prank(alice);
        id = launchpad.openMarket(
            Launchpad.OpenParams({
                subject: address(existing),
                quote: address(usdc),
                tickSpacing: spacing,
                sqrtPriceX96: TickMath.getSqrtPriceAtTick(269_400),
                rules: rules
            })
        );
    }

    function _damperAndSurge() internal view returns (Launchpad.Rules memory) {
        return _with(
            _with(_rules(3_000), address(damper), damperConfig()), address(surge), abi.encode(uint32(300_000), uint24(20_000))
        );
    }

    /// Alice provides ~$20k a side, full range.
    function _seedLiquidity(uint256 id) internal returns (uint128 added) {
        PoolKey memory key = _key(id);
        vm.prank(alice);
        (added,) = liquidity.addLiquidity(key, 20_000e6, 10_000e18, type(uint256).max);
    }

    function test_openMarket_createsAnEmptyHookedPool() public {
        uint256 id = _open(_damperAndSurge(), 60);
        Launchpad.Market memory m = _market(id);
        assertEq(m.subject, address(existing));
        assertEq(m.quote, address(usdc));
        assertEq(m.creator, alice);
        assertFalse(m.isLaunch);
        assertEq(m.tickSpacing, 60);
        assertEq(m.protocolShareBps, 0);

        HookKernel.PoolConfig memory config = _config(id);
        assertFalse(config.isLaunch);
        assertEq(config.floorSqrtPriceX96, 0, "no floor outside the launch lane");
        assertEq(config.baseFee, 3_000);
        assertEq(config.subjectSupply, existing.totalSupply());
        (,, uint128 inRange) = launchpad.marketState(id);
        assertEq(inRange, 0, "starts without liquidity");
    }

    function test_openMarket_rejectsTheLaunchGuard() public {
        Launchpad.Rules memory rules = _with(_rules(3_000), address(guard), guardConfig());
        vm.expectRevert(abi.encodeWithSelector(HookKernel.InvalidBlockConfig.selector, address(guard)));
        _open(rules, 60);
    }

    function test_openMarket_rejectsBadParams() public {
        Launchpad.OpenParams memory p = Launchpad.OpenParams({
            subject: address(existing),
            quote: address(existing),
            tickSpacing: 60,
            sqrtPriceX96: TickMath.getSqrtPriceAtTick(0),
            rules: _rules(3_000)
        });
        vm.expectRevert(Launchpad.InvalidMarket.selector);
        launchpad.openMarket(p);

        p.quote = address(usdc);
        p.tickSpacing = 30;
        vm.expectRevert(Launchpad.InvalidMarket.selector);
        launchpad.openMarket(p);

        p.tickSpacing = 60;
        p.subject = makeAddr("not-a-token");
        vm.expectRevert(Launchpad.InvalidMarket.selector);
        launchpad.openMarket(p);
    }

    function test_openMarket_onePerPairAndSpacing() public {
        _open(_rules(3_000), 60);
        vm.expectRevert(); // PoolManager: PoolAlreadyInitialized
        _open(_rules(3_000), 60);
        _open(_rules(3_000), 200); // a different spacing is a different pool
        assertEq(launchpad.marketCount(), 2);
    }

    function test_openMarket_respectsPause() public {
        vm.prank(owner);
        launchpad.setPaused(true);
        Launchpad.OpenParams memory p = Launchpad.OpenParams({
            subject: address(existing),
            quote: address(usdc),
            tickSpacing: 60,
            sqrtPriceX96: TickMath.getSqrtPriceAtTick(269_400),
            rules: _rules(3_000)
        });
        vm.expectRevert(Launchpad.Paused.selector);
        launchpad.openMarket(p);
    }

    function test_market_collectFeesIsLaunchOnly() public {
        uint256 id = _open(_rules(3_000), 60);
        vm.expectRevert(Launchpad.NotALaunch.selector);
        launchpad.collectFees(id);
    }

    function test_market_lpEarnsFeesAndCanExit() public {
        uint256 id = _open(_damperAndSurge(), 60);
        PoolKey memory key = _key(id);
        uint128 added = _seedLiquidity(id);
        assertGt(added, 0);

        uint256 bought = _buy(bob, id, 2_000e6);
        _sell(bob, id, bought / 2);

        (uint128 position, uint256 fees0, uint256 fees1) = liquidity.positionOf(key, alice);
        assertEq(position, added);
        assertGt(fees0, 0, "USDC fees from the buy");
        assertGt(fees1, 0, "EXT fees from the sell");

        uint256 usdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        liquidity.collect(key);
        assertEq(usdc.balanceOf(alice) - usdcBefore, fees0, "collected USDC fees");
        (, uint256 left0,) = liquidity.positionOf(key, alice);
        assertEq(left0, 0);

        // Bob has no position here, so he can't remove anything.
        vm.prank(bob);
        vm.expectRevert();
        liquidity.removeLiquidity(key, added, 0, 0, type(uint256).max);

        vm.prank(alice);
        liquidity.removeLiquidity(key, added, 0, 0, type(uint256).max);
        (uint128 remaining,,) = liquidity.positionOf(key, alice);
        assertEq(remaining, 0);
    }

    function test_market_blocksRunOnThirdPartyLiquidity() public {
        uint256 id = _open(_damperAndSurge(), 60);
        _seedLiquidity(id);
        uint256 bought = _buy(bob, id, 5_000e6);
        _sell(bob, id, bought);
        (, uint24 sellFee) = _fees(id);
        assertGt(sellFee, 3_000, "the damper reacts in open markets too");
        assertLe(sellFee, 3_000 + 70_000);
    }

    function test_liquidity_slippageAndDeadline() public {
        uint256 id = _open(_rules(3_000), 60);
        PoolKey memory key = _key(id);
        uint256 past = vm.getBlockTimestamp() - 1;

        vm.startPrank(alice);
        vm.expectRevert(LiquidityManager.DeadlineExpired.selector);
        liquidity.addLiquidity(key, 1_000e6, 500e18, past);

        (uint128 added,) = liquidity.addLiquidity(key, 1_000e6, 500e18, type(uint256).max);
        vm.expectRevert();
        liquidity.removeLiquidity(key, added, type(uint256).max, 0, type(uint256).max);
        vm.stopPrank();
    }
}
