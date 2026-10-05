// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {HookKernel} from "../src/HookKernel.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {SurgeBlock} from "../src/blocks/SurgeBlock.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {GreedyBlock, RevertingBlock, GasBurnerBlock, MalformedBlock, RejectBuysBlock} from "./mocks/MockBlocks.sol";
import {LaunchTestBase} from "./utils/LaunchTestBase.sol";

/// @notice The kernel's guarantees: access control, registration checks, platform-wide
/// caps, and how it treats blocks that misbehave (even after being approved).
contract KernelTest is LaunchTestBase {
    // ---------------------------------------------------------------------------
    // Access control
    // ---------------------------------------------------------------------------

    function test_register_onlyLaunchpad() public {
        (uint256 id,) = _launch(plainRules());
        PoolKey memory key = _key(id);
        HookKernel.RegisterParams memory params;
        params.baseFee = 10_000;
        vm.prank(alice);
        vm.expectRevert(HookKernel.NotLaunchpad.selector);
        kernel.register(key, params);
    }

    function test_bindLaunchpad_isOneShot() public {
        vm.expectRevert(HookKernel.AlreadyBound.selector);
        kernel.bindLaunchpad(alice);
    }

    function test_initialize_onlyThroughLaunchpad() public {
        MockUSDC other = new MockUSDC();
        (Currency c0, Currency c1) = address(other) < address(usdc)
            ? (Currency.wrap(address(other)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(other)));
        PoolKey memory key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 200, IHooks(address(kernel)));
        bytes memory err =
            _hookError(IHooks.beforeInitialize.selector, abi.encodeWithSelector(HookKernel.NotLaunchpad.selector));
        vm.prank(alice);
        vm.expectRevert(err);
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));
    }

    function test_callbacks_onlyPoolManager() public {
        (uint256 id,) = _launch(plainRules());
        PoolKey memory key = _key(id);
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams(true, -1, TickMath.MIN_SQRT_PRICE + 1);
        vm.expectRevert(HookKernel.NotPoolManager.selector);
        kernel.beforeSwap(address(this), key, params, "");
    }

    // ---------------------------------------------------------------------------
    // Registration checks
    // ---------------------------------------------------------------------------

    function test_register_rejectsUnreviewedBlocks() public {
        SurgeBlock unreviewed = new SurgeBlock();
        vm.prank(author);
        catalog.submit(address(unreviewed), "ipfs://x"); // pending, not approved
        Launchpad.Rules memory rules = _with(plainRules(), address(unreviewed), abi.encode(uint32(1), uint24(1)));
        vm.expectRevert(abi.encodeWithSelector(HookKernel.BlockNotUsable.selector, address(unreviewed)));
        _launch(rules);
    }

    function test_register_retiredBlockOnlyAffectsNewPools() public {
        Launchpad.Rules memory rules = _with(plainRules(), address(surge), abi.encode(uint32(500_000), uint24(50_000)));
        (uint256 id,) = _launch(rules);
        vm.prank(owner);
        catalog.retire(address(surge));

        vm.expectRevert(abi.encodeWithSelector(HookKernel.BlockNotUsable.selector, address(surge)));
        _launch(rules);

        // The existing pool keeps its surge: a big buy still pays more than a plain pool's.
        (uint256 plain,) = _launch(plainRules());
        assertLt(_buy(alice, id, 3_000e6), _buy(alice, plain, 3_000e6));
    }

    function test_register_rejectsInvalidConfigs() public {
        vm.expectRevert(abi.encodeWithSelector(HookKernel.InvalidBlockConfig.selector, address(damper)));
        _launch(_with(plainRules(), address(damper), abi.encode(uint32(0), uint24(70_000))));

        vm.expectRevert(abi.encodeWithSelector(HookKernel.InvalidBlockConfig.selector, address(guard)));
        _launch(_with(plainRules(), address(guard), abi.encode(uint24(290_000), uint32(16 minutes), uint16(100))));

        vm.expectRevert(abi.encodeWithSelector(HookKernel.InvalidBlockConfig.selector, address(burn)));
        _launch(_with(plainRules(), address(burn), abi.encode(uint16(501))));
    }

    function test_register_rejectsTooManyAndDuplicateBlocks() public {
        GreedyBlock g = new GreedyBlock();
        RejectBuysBlock r = new RejectBuysBlock();
        _approve(address(g), 0);
        _approve(address(r), 0);

        Launchpad.Rules memory six = standardRules();
        six = _with(six, address(burn), abi.encode(uint16(100)));
        six = _with(six, address(surge), abi.encode(uint32(1), uint24(1)));
        six = _with(six, address(g), "");
        six = _with(six, address(r), "");
        vm.expectRevert(HookKernel.TooManyBlocks.selector);
        _launch(six);

        Launchpad.Rules memory dup = _with(_with(plainRules(), address(burn), abi.encode(uint16(100))), address(burn), abi.encode(uint16(50)));
        vm.expectRevert(abi.encodeWithSelector(HookKernel.DuplicateBlock.selector, address(burn)));
        _launch(dup);
    }

    function test_register_rejectsBaseFeeOutOfBounds() public {
        vm.expectRevert(HookKernel.InvalidBaseFee.selector);
        _launch(_rules(99));
        vm.expectRevert(HookKernel.InvalidBaseFee.selector);
        _launch(_rules(30_001));
    }

    // ---------------------------------------------------------------------------
    // Platform-wide caps
    // ---------------------------------------------------------------------------

    function test_caps_holdAgainstAGreedyBlock() public {
        GreedyBlock greedy = new GreedyBlock();
        _approve(address(greedy), 0);
        (uint256 id, address token) = _launch(_with(plainRules(), address(greedy), ""));

        (uint24 buyFee, uint24 sellFee) = _fees(id);
        assertEq(buyFee, kernel.MAX_OPENING_FEE(), "50% cap during the opening window");
        assertEq(sellFee, kernel.MAX_OPENING_FEE());

        vm.warp(vm.getBlockTimestamp() + 15 minutes);
        (buyFee, sellFee) = _fees(id);
        assertEq(buyFee, kernel.MAX_FEE(), "10% cap forever after");
        assertEq(sellFee, kernel.MAX_FEE());

        // Trades still work, and the greedy burn is cut to 5% of the output.
        uint256 deadBefore = IERC20(token).balanceOf(DEAD);
        uint256 received = _buy(alice, id, 100e6);
        uint256 burned = IERC20(token).balanceOf(DEAD) - deadBefore;
        assertEq(burned, (received + burned) * 500 / 10_000);
    }

    // ---------------------------------------------------------------------------
    // Misbehaving blocks
    // ---------------------------------------------------------------------------

    function test_failOpen_revertingBlockIsSkipped() public {
        RevertingBlock broken = new RevertingBlock();
        _approve(address(broken), 0);
        (uint256 id, address token) = _launch(_with(plainRules(), address(broken), ""));
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);

        vm.expectEmit(true, true, true, false, address(kernel));
        emit HookKernel.BlockSkipped(_poolId(id), 0, address(broken));
        vm.prank(alice);
        (, uint256 tokens) = router.swapExactIn(key, zeroForOne, 100e6, 0, 0, alice, type(uint256).max);
        assertGt(tokens, 0, "a broken block froze buys");
        assertGt(_sell(alice, id, tokens / 2), 0, "a broken block froze sells");

        // Liquidity additions skip it too.
        vm.startPrank(alice);
        IERC20(token).approve(address(liquidity), type(uint256).max);
        (uint128 added,) = liquidity.addLiquidity(key, tokens / 4, tokens / 4, type(uint256).max);
        vm.stopPrank();
        assertGt(added, 0);
    }

    function test_failOpen_gasBurnerIsSkippedAndBounded() public {
        GasBurnerBlock burner = new GasBurnerBlock();
        _approve(address(burner), 0);
        (uint256 id,) = _launch(_with(plainRules(), address(burner), ""));
        (uint256 plain,) = _launch(plainRules());

        uint256 gasBefore = gasleft();
        uint256 out = _buy(alice, id, 100e6);
        uint256 used = gasBefore - gasleft();
        assertApproxEqRel(out, _buy(alice, plain, 100e6), 0.01e18, "burner changed the price");
        assertLt(used, 600_000, "a block may cost at most its gas budget");
    }

    function test_failOpen_malformedAnswersAreSkipped() public {
        MalformedBlock bad = new MalformedBlock();
        _approve(address(bad), 0);
        (uint256 id, address token) = _launch(_with(plainRules(), address(bad), ""));
        (uint24 buyFee,) = _fees(id);
        assertEq(buyFee, 10_000, "a malformed fee answer was used");
        uint256 deadBefore = IERC20(token).balanceOf(DEAD);
        _buy(alice, id, 100e6);
        assertEq(IERC20(token).balanceOf(DEAD), deadBefore, "a malformed burn answer was used");
    }

    function test_reject_blocksTheTrade() public {
        RejectBuysBlock rejecter = new RejectBuysBlock();
        _approve(address(rejecter), 0);
        (uint256 id, address token) = _launch(_with(plainRules(), address(rejecter), ""));
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);
        bytes memory err = _hookError(
            IHooks.beforeSwap.selector, abi.encodeWithSelector(HookKernel.BlockRejected.selector, 0, address(rejecter))
        );

        vm.prank(alice);
        vm.expectRevert(err);
        router.swapExactIn(key, zeroForOne, 100e6, 0, 0, alice, type(uint256).max);

        // The block only refuses buys. A sell here can only fail on the launch floor (the pool
        // holds no USDC yet), never on the block.
        deal(token, bob, 1e18);
        vm.startPrank(bob);
        IERC20(token).approve(address(router), type(uint256).max);
        try router.swapExactIn(key, !zeroForOne, 1e18, 0, 0, bob, type(uint256).max) {}
        catch (bytes memory e) {
            assertEq(_innerSelector(e), HookKernel.BelowLaunchFloor.selector, "sell rejected by the buy-only block");
        }
        vm.stopPrank();
    }

    /// Starving a block of gas must never turn its "reject" into a skip. At every gas limit
    /// the buy either reverts for lack of gas or is rejected — it never goes through.
    function test_gasStarvation_neverSkipsARejection() public {
        RejectBuysBlock rejecter = new RejectBuysBlock();
        _approve(address(rejecter), 0);
        (uint256 id,) = _launch(_with(plainRules(), address(rejecter), ""));
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);

        for (uint256 gasLimit = 80_000; gasLimit <= 600_000; gasLimit += 4_000) {
            vm.prank(alice);
            try router.swapExactIn{gas: gasLimit}(key, zeroForOne, 1e6, 0, 0, alice, type(uint256).max) {
                fail("a rejected buy went through when gas was limited");
            } catch {}
        }
    }
}
