// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {CustomRevert} from "v4-core/libraries/CustomRevert.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
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
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Shared setup: a local PoolManager, mock USDC at a chosen address, the catalog
/// with the four native blocks approved, the kernel etched at an address carrying its
/// permission flags, the Launchpad, the router and the LiquidityManager.
///
/// The launched token's address is effectively random, so which side of the pair it sorts
/// to depends on where USDC lives. Behaviour suites run twice — USDC at a very high address
/// (token = currency0) and at a very low one (token = currency1) — because the two cases
/// mirror every price and range calculation.
///
/// Notes for every test: read anything that needs an external call (pool keys, market
/// records) *before* `vm.prank` / `vm.expectRevert`, or the cheatcode is consumed by that
/// read. And use `vm.getBlockTimestamp()` after a warp: via-IR may cache block.timestamp.
abstract contract LaunchTestBase is Test {
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );
    /// ~$5,000 FDV for a 1e9-token, 18-decimal supply priced in 6-decimal USDC.
    int24 internal constant LAUNCH_TICK = -398_400;
    uint16 internal constant PROTOCOL_SHARE_BPS = 2_000;
    uint16 internal constant DAMPER_ROYALTY_BPS = 1_000;
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    PoolManager internal manager;
    BlockCatalog internal catalog;
    HookKernel internal kernel;
    Launchpad internal launchpad;
    LaunchRouter internal router;
    LiquidityManager internal liquidity;
    MockUSDC internal usdc;

    GuardBlock internal guard;
    DamperBlock internal damper;
    BurnBlock internal burn;
    SurgeBlock internal surge;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal author = makeAddr("author");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    /// Where the mock USDC is placed; decides the token's side of the pair.
    function usdcAddress() internal pure virtual returns (address) {
        return 0x0000000000000000000000000000000000C0FFEE;
    }

    function setUp() public virtual {
        manager = new PoolManager(address(this));
        deployCodeTo("MockUSDC.sol:MockUSDC", usdcAddress());
        usdc = MockUSDC(usdcAddress());

        catalog = new BlockCatalog(owner);
        guard = new GuardBlock();
        damper = new DamperBlock();
        burn = new BurnBlock();
        surge = new SurgeBlock();
        _approve(address(guard), 0);
        _approve(address(burn), 0);
        _approve(address(surge), 0);
        // The damper is "third-party" in these tests: its author earns a royalty.
        _approveAs(author, address(damper), DAMPER_ROYALTY_BPS);

        address kernelAddress = address(HOOK_FLAGS | (uint160(0x4444) << 144));
        deployCodeTo(
            "HookKernel.sol:HookKernel", abi.encode(address(manager), address(catalog), address(this)), kernelAddress
        );
        kernel = HookKernel(kernelAddress);

        launchpad = new Launchpad(manager, kernel, Currency.wrap(address(usdc)), LAUNCH_TICK, treasury, PROTOCOL_SHARE_BPS, owner);
        kernel.bindLaunchpad(address(launchpad));
        router = new LaunchRouter(manager);
        liquidity = new LiquidityManager(manager);

        address[3] memory traders = [alice, bob, creator];
        for (uint256 i; i < traders.length; i++) {
            usdc.mint(traders[i], 10_000_000e6);
            vm.startPrank(traders[i]);
            usdc.approve(address(router), type(uint256).max);
            usdc.approve(address(liquidity), type(uint256).max);
            vm.stopPrank();
        }
    }

    // ---------------------------------------------------------------------------
    // Catalog
    // ---------------------------------------------------------------------------

    function _approve(address blk, uint16 royaltyBps) internal {
        _approveAs(address(this), blk, royaltyBps);
    }

    function _approveAs(address blockAuthor, address blk, uint16 royaltyBps) internal {
        vm.prank(blockAuthor);
        catalog.submit(blk, "ipfs://block");
        vm.prank(owner);
        catalog.approve(blk, royaltyBps);
    }

    // ---------------------------------------------------------------------------
    // Rules
    // ---------------------------------------------------------------------------

    function _rules(uint24 baseFee) internal pure returns (Launchpad.Rules memory r) {
        r.baseFee = baseFee;
    }

    function _with(Launchpad.Rules memory r, address blk, bytes memory config)
        internal
        pure
        returns (Launchpad.Rules memory out)
    {
        out.baseFee = r.baseFee;
        out.blocks = new address[](r.blocks.length + 1);
        out.configs = new bytes[](r.blocks.length + 1);
        for (uint256 i; i < r.blocks.length; i++) {
            out.blocks[i] = r.blocks[i];
            out.configs[i] = r.configs[i];
        }
        out.blocks[r.blocks.length] = blk;
        out.configs[r.blocks.length] = config;
    }

    /// 30% launch buy fee (1% base + 29% premium) decaying over 3 minutes, 1%-of-supply
    /// buy cap during the guard.
    function guardConfig() internal pure returns (bytes memory) {
        return abi.encode(uint24(290_000), uint32(180), uint16(100));
    }

    /// Sell surcharge up to 7% on top of the 1% base (8% total).
    function damperConfig() internal pure returns (bytes memory) {
        return abi.encode(uint32(500_000), uint24(70_000));
    }

    /// The "Standard" preset: guard + damper on a 1% base.
    function standardRules() internal view returns (Launchpad.Rules memory) {
        return _with(_with(_rules(10_000), address(guard), guardConfig()), address(damper), damperConfig());
    }

    /// Plain 1% pool with no blocks.
    function plainRules() internal pure returns (Launchpad.Rules memory) {
        return _rules(10_000);
    }

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    function _launch(Launchpad.Rules memory rules) internal returns (uint256 id, address token) {
        vm.prank(creator);
        return launchpad.launch(
            Launchpad.LaunchParams({
                name: "Test Token",
                symbol: "TEST",
                imageURI: "https://example.com/t.png",
                description: "A token for tests",
                website: "",
                rules: rules
            })
        );
    }

    function _afterGuard(Launchpad.Rules memory rules) internal returns (uint256 id, address token) {
        (id, token) = _launch(rules);
        vm.warp(vm.getBlockTimestamp() + 181);
    }

    function _market(uint256 id) internal view returns (Launchpad.Market memory m) {
        (m,) = launchpad.getMarket(id);
    }

    function _key(uint256 id) internal view returns (PoolKey memory) {
        return launchpad.poolKeyOf(id);
    }

    function _poolId(uint256 id) internal view returns (PoolId) {
        return _market(id).poolId;
    }

    function _subjectIs0(uint256 id) internal view returns (bool) {
        return _market(id).subjectIsCurrency0;
    }

    /// Buys with exactly `quoteIn` and returns subject tokens received.
    function _buy(address who, uint256 id, uint256 quoteIn) internal returns (uint256 out) {
        PoolKey memory key = _key(id);
        bool zeroForOne = !_subjectIs0(id);
        vm.prank(who);
        (, out) = router.swapExactIn(key, zeroForOne, quoteIn, 0, 0, who, type(uint256).max);
    }

    /// Sells `amount` of the subject token (approving the router first); returns quote received.
    function _sell(address who, uint256 id, uint256 amount) internal returns (uint256 out) {
        PoolKey memory key = _key(id);
        bool zeroForOne = _subjectIs0(id);
        IERC20 subject = IERC20(_market(id).subject);
        vm.startPrank(who);
        subject.approve(address(router), amount);
        (, out) = router.swapExactIn(key, zeroForOne, amount, 0, 0, who, type(uint256).max);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------

    /// Fully diluted value at the current price, in USDC base units.
    function _fdv(uint256 id) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,) = launchpad.marketState(id);
        if (_subjectIs0(id)) {
            return FullMath.mulDiv(FullMath.mulDiv(SUPPLY, sqrtPriceX96, FixedPoint96.Q96), sqrtPriceX96, FixedPoint96.Q96);
        }
        return FullMath.mulDiv(FullMath.mulDiv(SUPPLY, FixedPoint96.Q96, sqrtPriceX96), FixedPoint96.Q96, sqrtPriceX96);
    }

    function _fees(uint256 id) internal view returns (uint24 buyFee, uint24 sellFee) {
        return kernel.previewFees(_poolId(id));
    }

    function _config(uint256 id) internal view returns (HookKernel.PoolConfig memory config) {
        (config,,,) = kernel.getPool(_poolId(id));
    }

    /// The error the PoolManager raises when a hook callback reverts (ERC-7751 wrapping).
    function _hookError(bytes4 callback, bytes memory reason) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector, address(kernel), callback, reason, abi.encodeWithSelector(Hooks.HookCallFailed.selector)
        );
    }

    /// The kernel's own error selector from inside a PoolManager WrappedError.
    function _innerSelector(bytes memory err) internal pure returns (bytes4) {
        bytes memory body = new bytes(err.length - 4);
        for (uint256 i; i < body.length; i++) {
            body[i] = err[i + 4];
        }
        (,, bytes memory reason,) = abi.decode(body, (address, bytes4, bytes, bytes));
        return bytes4(reason);
    }
}
