// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {HookKernel} from "../src/HookKernel.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";
import {LaunchTestBase} from "./utils/LaunchTestBase.sol";

/// @notice The launch lane end to end, and every native block's behaviour in a launch.
/// Abstract: runs once per token ordering via the two contracts at the bottom.
abstract contract LaunchBehavior is LaunchTestBase {
    using StateLibrary for IPoolManager;

    function expectedSubjectIs0() internal pure virtual returns (bool);

    // ---------------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------------

    function test_launch_locksWholeSupplyInThePool() public {
        (uint256 id, address token) = _launch(standardRules());

        assertEq(_subjectIs0(id), expectedSubjectIs0(), "token sorted to the wrong side");
        assertEq(IERC20(token).totalSupply(), SUPPLY);
        assertEq(IERC20(token).balanceOf(address(launchpad)), 0, "launchpad kept tokens");
        uint256 burned = IERC20(token).balanceOf(DEAD);
        assertLe(burned, 2e9, "leftover larger than the liquidity margin");
        assertEq(IERC20(token).balanceOf(address(manager)), SUPPLY - burned);
        assertEq(usdc.balanceOf(address(manager)), 0, "launch should not need USDC");
    }

    function test_launch_opensAtAboutFiveThousandDollarsFdv() public {
        (uint256 id,) = _launch(standardRules());
        assertApproxEqRel(_fdv(id), 5_000e6, 0.005e18);
    }

    function test_launch_recordsMarketMetadataAndStack() public {
        (uint256 id, address token) = _launch(standardRules());
        (Launchpad.Market memory m, Launchpad.LaunchMetadata memory meta) = launchpad.getMarket(id);

        assertEq(m.subject, token);
        assertEq(m.quote, address(usdc));
        assertEq(m.creator, creator);
        assertTrue(m.isLaunch);
        assertEq(m.protocolShareBps, PROTOCOL_SHARE_BPS);
        assertEq(meta.imageURI, "https://example.com/t.png");
        assertEq(launchpad.launchIdPlusOne(token), id + 1);
        assertEq(launchpad.marketIdPlusOne(m.poolId), id + 1);

        address[] memory blocks = kernel.blocksOf(m.poolId);
        assertEq(blocks.length, 2);
        assertEq(blocks[0], address(guard));
        assertEq(blocks[1], address(damper));
        uint16[] memory royalties = launchpad.royaltiesOf(id);
        assertEq(royalties[0], 0);
        assertEq(royalties[1], DAMPER_ROYALTY_BPS);

        PoolKey memory key = _key(id);
        assertEq(address(key.hooks), address(kernel));
        assertEq(key.fee, LPFeeLibrary.DYNAMIC_FEE_FLAG);
    }

    function test_launch_rejectsBadMetadata() public {
        Launchpad.LaunchParams memory p = Launchpad.LaunchParams({
            name: "",
            symbol: "X",
            imageURI: "",
            description: "",
            website: "",
            rules: plainRules()
        });
        vm.expectRevert(Launchpad.InvalidMetadata.selector);
        launchpad.launch(p);

        p.name = "Name";
        p.symbol = "WAYTOOLONGSYMBOL";
        vm.expectRevert(Launchpad.InvalidMetadata.selector);
        launchpad.launch(p);
    }

    function test_getMarkets_paginates() public {
        _launch(standardRules());
        _launch(plainRules());
        _launch(standardRules());
        assertEq(launchpad.getMarkets(0, 2).length, 2);
        assertEq(launchpad.getMarkets(1, 10).length, 2);
        assertEq(launchpad.getMarkets(3, 10).length, 0);
    }

    // ---------------------------------------------------------------------------
    // GuardBlock
    // ---------------------------------------------------------------------------

    function test_guard_buyFeeDecaysLinearly() public {
        (uint256 id,) = _launch(standardRules());
        (uint24 buyFee, uint24 sellFee) = _fees(id);
        assertEq(buyFee, 300_000, "1% base + 29% premium at the open");
        assertEq(sellFee, 10_000, "the guard never touches sells");

        vm.warp(vm.getBlockTimestamp() + 90);
        (buyFee,) = _fees(id);
        assertEq(buyFee, 155_000, "halfway");

        vm.warp(vm.getBlockTimestamp() + 90);
        (buyFee,) = _fees(id);
        assertEq(buyFee, 10_000, "base fee once the guard ends");
    }

    function test_guard_launchFeeActuallyCharged() public {
        (uint256 guarded,) = _launch(standardRules());
        (uint256 plain,) = _launch(plainRules());
        uint256 outGuarded = _buy(alice, guarded, 50e6);
        uint256 outPlain = _buy(alice, plain, 50e6);
        // 30% vs 1% fee on the same $50: ~70.7% as many tokens.
        assertApproxEqRel(outGuarded * 1e18 / outPlain, 0.707e18, 0.01e18);
    }

    function test_guard_capsBuySize() public {
        (uint256 id,) = _launch(standardRules());
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);

        // $100 at a 30% fee buys ~1.4% of supply: over the 1% cap.
        vm.prank(alice);
        try router.swapExactIn(key, zeroForOne, 100e6, 0, 0, alice, type(uint256).max) {
            fail("oversized guard-window buy went through");
        } catch (bytes memory err) {
            assertEq(_innerSelector(err), HookKernel.BlockRejected.selector);
        }

        assertLt(_buy(alice, id, 50e6), SUPPLY / 100, "a buy under the cap works during the guard");
        vm.warp(vm.getBlockTimestamp() + 181);
        assertGt(_buy(bob, id, 100e6), SUPPLY / 100, "the same oversized buy works after it");
    }

    function test_guard_blocksThirdPartyLiquidityUntilItEnds() public {
        (uint256 id, address token) = _launch(standardRules());
        uint256 tokens = _buy(alice, id, 40e6);
        PoolKey memory key = _key(id);
        (uint256 max0, uint256 max1) = _subjectIs0(id) ? (tokens, uint256(40e6)) : (uint256(40e6), tokens);

        vm.startPrank(alice);
        IERC20(token).approve(address(liquidity), type(uint256).max);
        vm.expectRevert(
            _hookError(
                IHooks.beforeAddLiquidity.selector,
                abi.encodeWithSelector(HookKernel.BlockRejected.selector, 0, address(guard))
            )
        );
        liquidity.addLiquidity(key, max0, max1, type(uint256).max);

        vm.warp(vm.getBlockTimestamp() + 181);
        (uint128 added,) = liquidity.addLiquidity(key, max0, max1, type(uint256).max);
        vm.stopPrank();
        assertGt(added, 0);
    }

    // ---------------------------------------------------------------------------
    // DamperBlock
    // ---------------------------------------------------------------------------

    function test_damper_smallSellPaysAboutTheBaseFee() public {
        (uint256 id,) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 2_000e6);
        _sell(alice, id, tokens / 1_000);
        (, uint24 sellFee) = _fees(id);
        assertGt(sellFee, 10_000, "pressure registered");
        assertLt(sellFee, 10_300, "a 0.1% sell barely moves the fee");
    }

    function test_damper_bigSellPaysMoreThanInAPlainPool() public {
        (uint256 damped,) = _afterGuard(standardRules());
        (uint256 plain,) = _launch(plainRules());
        uint256 a = _buy(alice, damped, 3_000e6);
        uint256 b = _buy(alice, plain, 3_000e6);
        assertLt(_sell(alice, damped, a / 2), _sell(alice, plain, b / 2), "dumping half gets no surcharge");
    }

    function test_damper_consecutiveSellsEscalateUpToTheCap() public {
        (uint256 id,) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 4_000e6);
        uint24 previous;
        for (uint256 i; i < 6; i++) {
            _sell(alice, id, tokens / 10);
            (, uint24 sellFee) = _fees(id);
            assertGe(sellFee, previous, "sell fee dropped during a dump");
            assertLe(sellFee, 80_000, "sell fee above its cap");
            previous = sellFee;
        }
        assertEq(previous, 80_000, "a fast 60% exit should hit the cap");
    }

    function test_damper_pressureDecaysOverTime() public {
        (uint256 id,) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 3_000e6);
        _sell(alice, id, tokens / 2);
        uint256 before = _pressure(id);
        (, uint24 feeNow) = _fees(id);
        assertGt(feeNow, 10_000);

        vm.warp(vm.getBlockTimestamp() + 10 minutes);
        assertEq(before - _pressure(id), 10 minutes * damper.DECAY_PER_SECOND());

        vm.warp(vm.getBlockTimestamp() + 3 hours);
        assertEq(_pressure(id), 0);
        (, uint24 feeLater) = _fees(id);
        assertEq(feeLater, 10_000);
    }

    function test_damper_buysRelievePressure() public {
        (uint256 id,) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 3_000e6);
        _sell(alice, id, tokens / 2);
        uint256 before = _pressure(id);
        _buy(bob, id, 500e6);
        assertLt(_pressure(id), before);
    }

    // ---------------------------------------------------------------------------
    // BurnBlock
    // ---------------------------------------------------------------------------

    function test_burn_takesShareOfExactInputBuys() public {
        (uint256 id, address token) = _launch(_with(plainRules(), address(burn), abi.encode(uint16(100))));
        uint256 deadBefore = IERC20(token).balanceOf(DEAD);
        uint256 received = _buy(alice, id, 1_000e6);
        uint256 burned = IERC20(token).balanceOf(DEAD) - deadBefore;

        assertEq(IERC20(token).balanceOf(alice), received);
        assertGt(burned, 0);
        assertEq(burned, (received + burned) / 100, "burn is not 1% of the gross output");
    }

    function test_burn_skipsExactOutputBuys() public {
        (uint256 id, address token) = _launch(_with(plainRules(), address(burn), abi.encode(uint16(100))));
        uint256 deadBefore = IERC20(token).balanceOf(DEAD);
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);

        PoolSwapTest swapper = new PoolSwapTest(manager);
        vm.startPrank(alice);
        usdc.approve(address(swapper), type(uint256).max);
        swapper.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: int256(1_000_000e18),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();

        assertEq(IERC20(token).balanceOf(alice), 1_000_000e18, "exact output not delivered");
        assertEq(IERC20(token).balanceOf(DEAD), deadBefore, "exact-output buy burned tokens");
    }

    // ---------------------------------------------------------------------------
    // SurgeBlock
    // ---------------------------------------------------------------------------

    function test_surge_bigTradesPayMoreSmallOnesDoNot() public {
        (uint256 surged,) = _launch(_with(plainRules(), address(surge), abi.encode(uint32(500_000), uint24(50_000))));
        (uint256 plain,) = _launch(plainRules());

        // A $1 buy: impact is tiny, so both pools pay ~the same.
        assertApproxEqRel(_buy(alice, surged, 1e6), _buy(alice, plain, 1e6), 0.001e18);
        // A $3k buy is ~37% of the pool's USDC depth, so its surcharge hits the 5% cap: 6% vs 1%
        // in fees works out to ~3% fewer tokens at this size.
        assertLt(_buy(bob, surged, 3_000e6) * 100, _buy(bob, plain, 3_000e6) * 98, "big buy paid no surge");
        // A negligible trade previews at the base fee.
        (uint24 buyFee, uint24 sellFee) = _fees(surged);
        assertEq(buyFee, 10_000);
        assertEq(sellFee, 10_000);
    }

    // ---------------------------------------------------------------------------
    // Launch floor (kernel-native for launches)
    // ---------------------------------------------------------------------------

    function test_floor_sellsCannotPushPriceBelowLaunch() public {
        (uint256 id, address token) = _launch(plainRules());
        _buy(alice, id, 1_000e6);
        PoolKey memory key = _key(id);
        bool zeroForOne = _subjectIs0(id);
        uint160 floor = _config(id).floorSqrtPriceX96;

        // Tokens that never came out of the pool are the only way to oversell it.
        deal(token, bob, 500_000_000e18);
        vm.startPrank(bob);
        IERC20(token).approve(address(router), type(uint256).max);
        try router.swapExactIn(key, zeroForOne, 500_000_000e18, 0, 0, bob, type(uint256).max) {
            fail("sold through the launch floor");
        } catch (bytes memory err) {
            assertEq(_innerSelector(err), HookKernel.BelowLaunchFloor.selector);
        }
        (uint256 used, uint256 out) = router.swapExactIn(key, zeroForOne, 500_000_000e18, 0, floor, bob, type(uint256).max);
        vm.stopPrank();

        assertLt(used, 500_000_000e18, "should only partially fill");
        assertGt(out, 0);
        (uint160 sqrtPriceX96,,) = launchpad.marketState(id);
        assertEq(sqrtPriceX96, floor, "price should rest exactly on the floor");
    }

    // ---------------------------------------------------------------------------
    // Fees and royalties
    // ---------------------------------------------------------------------------

    function test_fees_splitBetweenCreatorAuthorAndTreasury() public {
        (uint256 id, address token) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 2_000e6);
        _sell(alice, id, tokens / 2);

        (uint256 pending0, uint256 pending1) = launchpad.pendingFees(id);
        (uint256 collected0, uint256 collected1) = launchpad.collectFees(id);
        assertEq(collected0, pending0, "pendingFees disagrees with collection (0)");
        assertEq(collected1, pending1, "pendingFees disagrees with collection (1)");

        (uint256 tokenFees, uint256 usdcFees) = _subjectIs0(id) ? (collected0, collected1) : (collected1, collected0);
        assertGt(usdcFees, 19e6, "1% of the $2k buy should be ~$20");
        assertGt(tokenFees, 0, "sells pay their fee in tokens");

        uint256 protocolUsdc = usdcFees * PROTOCOL_SHARE_BPS / 10_000;
        uint256 royaltyUsdc = protocolUsdc * DAMPER_ROYALTY_BPS / 10_000;
        assertEq(launchpad.claimable(creator, address(usdc)), usdcFees - protocolUsdc, "creator");
        assertEq(launchpad.claimable(author, address(usdc)), royaltyUsdc, "block author royalty");
        assertEq(launchpad.claimable(treasury, address(usdc)), protocolUsdc - royaltyUsdc, "treasury");
        assertEq(
            launchpad.claimable(creator, token) + launchpad.claimable(treasury, token) + launchpad.claimable(author, token),
            tokenFees,
            "token fees leak"
        );

        uint256 before = usdc.balanceOf(author);
        vm.prank(author);
        launchpad.claim(address(usdc));
        assertEq(usdc.balanceOf(author) - before, royaltyUsdc);
    }

    function test_fees_royaltiesFollowTheBlocksCurrentAuthor() public {
        (uint256 id,) = _afterGuard(standardRules());
        _buy(alice, id, 1_000e6);
        vm.prank(author);
        catalog.setAuthor(address(damper), bob);
        launchpad.collectFees(id);
        assertGt(launchpad.claimable(bob, address(usdc)), 0);
        assertEq(launchpad.claimable(author, address(usdc)), 0);
    }

    function test_fees_collectAndClaimPaysTheCreator() public {
        (uint256 id, address token) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, 1_000e6);
        _sell(alice, id, tokens / 4);

        uint256 usdcBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        (uint256 tokenAmount, uint256 quoteAmount) = launchpad.collectAndClaim(id);
        assertGt(quoteAmount, 0);
        assertGt(tokenAmount, 0);
        assertEq(usdc.balanceOf(creator) - usdcBefore, quoteAmount);
        assertEq(IERC20(token).balanceOf(creator), tokenAmount);
    }

    function test_fees_protocolShareIsFrozenPerLaunch() public {
        (uint256 early,) = _launch(plainRules());
        vm.prank(owner);
        launchpad.setProtocolShareBps(5_000);
        (uint256 late,) = _launch(plainRules());
        assertEq(_market(early).protocolShareBps, PROTOCOL_SHARE_BPS, "existing launch was re-priced");
        assertEq(_market(late).protocolShareBps, 5_000);
    }

    function test_fees_lockedLiquidityIsNeverRemoved() public {
        (uint256 id,) = _afterGuard(standardRules());
        (int24 lower, int24 upper) = _launchRange(id);
        (uint128 before,,) = IPoolManager(address(manager)).getPositionInfo(_poolId(id), address(launchpad), lower, upper, bytes32(0));

        uint256 tokens = _buy(alice, id, 2_000e6);
        _sell(alice, id, tokens / 2);
        launchpad.collectFees(id);

        (uint128 afterwards,,) = IPoolManager(address(manager)).getPositionInfo(_poolId(id), address(launchpad), lower, upper, bytes32(0));
        assertGt(before, 0);
        assertEq(afterwards, before);
    }

    function test_transferCreator_movesFutureFees() public {
        (uint256 id,) = _afterGuard(standardRules());
        vm.prank(alice);
        vm.expectRevert(Launchpad.NotCreator.selector);
        launchpad.transferCreator(id, alice);

        vm.prank(creator);
        launchpad.transferCreator(id, bob);
        _buy(alice, id, 1_000e6);
        launchpad.collectFees(id);
        assertGt(launchpad.claimable(bob, address(usdc)), 0);
        assertEq(launchpad.claimable(creator, address(usdc)), 0);
    }

    // ---------------------------------------------------------------------------
    // Router
    // ---------------------------------------------------------------------------

    function test_router_quoteMatchesSwap() public {
        (uint256 id,) = _afterGuard(standardRules());
        PoolKey memory key = _key(id);
        (uint256 quotedIn, uint256 quotedOut) = router.quoteExactIn(key, !_subjectIs0(id), 750e6, 0);
        assertEq(quotedIn, 750e6);
        assertEq(quotedOut, _buy(alice, id, 750e6));
    }

    function test_router_enforcesSlippageAndDeadline() public {
        (uint256 id,) = _afterGuard(standardRules());
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);
        (, uint256 quotedOut) = router.quoteExactIn(key, zeroForOne, 100e6, 0);
        uint256 deadline = vm.getBlockTimestamp();

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchRouter.TooLittleReceived.selector, quotedOut, quotedOut + 1));
        router.swapExactIn(key, zeroForOne, 100e6, quotedOut + 1, 0, alice, deadline);
        vm.expectRevert(LaunchRouter.DeadlineExpired.selector);
        router.swapExactIn(key, zeroForOne, 100e6, 0, 0, alice, deadline - 1);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------

    /// Buying and immediately selling everything back never returns more USDC than spent.
    function testFuzz_roundTripNeverProfits(uint256 usdcIn) public {
        usdcIn = bound(usdcIn, 1e6, 1_000_000e6);
        (uint256 id,) = _afterGuard(standardRules());
        uint256 tokens = _buy(alice, id, usdcIn);
        assertLt(_sell(alice, id, tokens), usdcIn);
    }

    /// No sequence of sells and waits pushes the sell fee outside [base, base + damper cap].
    function testFuzz_sellFeeStaysWithinBounds(uint256 buy, uint8 sells, uint256 seed) public {
        buy = bound(buy, 10e6, 100_000e6);
        sells = uint8(bound(sells, 1, 12));
        (uint256 id, address token) = _afterGuard(standardRules());
        _buy(alice, id, buy);

        for (uint256 i; i < sells; i++) {
            uint256 balance = IERC20(token).balanceOf(alice);
            uint256 amount = bound(uint256(keccak256(abi.encode(seed, i))), 1, balance / 2 + 1);
            if (amount > balance || amount == 0) break;
            _sell(alice, id, amount);
            vm.warp(vm.getBlockTimestamp() + bound(uint256(keccak256(abi.encode(seed, i, "t"))), 0, 600));

            (uint24 buyFee, uint24 sellFee) = _fees(id);
            assertGe(sellFee, 10_000);
            assertLe(sellFee, 80_000);
            assertEq(buyFee, 10_000);
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function _pressure(uint256 id) internal view returns (uint256) {
        (,,, bytes32[] memory states) = kernel.getPool(_poolId(id));
        return damper.decayed(states[1], vm.getBlockTimestamp());
    }

    function _launchRange(uint256 id) internal view returns (int24, int24) {
        int24 maxUsable = TickMath.maxUsableTick(200);
        return _subjectIs0(id) ? (LAUNCH_TICK, maxUsable) : (-maxUsable, -LAUNCH_TICK);
    }
}

/// USDC sorts above every launched token, so the token is currency0.
contract LaunchTokenIsCurrency0Test is LaunchBehavior {
    function usdcAddress() internal pure override returns (address) {
        return 0xfFfffFFFfffFFfFFFFffFFFFffffFfFFFFff0000;
    }

    function expectedSubjectIs0() internal pure override returns (bool) {
        return true;
    }
}

/// USDC sorts below every launched token, so the token is currency1.
contract LaunchTokenIsCurrency1Test is LaunchBehavior {
    function usdcAddress() internal pure override returns (address) {
        return 0x0000000000000000000000000000000000C0FFEE;
    }

    function expectedSubjectIs0() internal pure override returns (bool) {
        return false;
    }
}
