// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {IRuleBlock, HookPoints, SwapContext, LiquidityContext} from "./interfaces/IRuleBlock.sol";
import {BlockCatalog} from "./BlockCatalog.sol";

/// @title HookKernel
/// @notice One Uniswap v4 hook for every pool the Launchpad opens. Each pool runs a stack of
/// up to five rule blocks from the BlockCatalog, chosen at creation and frozen for life:
/// no function here can change a registered pool, including for the deployer.
///
/// Blocks are called with STATICCALL and a fixed gas budget, so they can compute but never
/// move funds, touch the pool, or call anything with side effects. The kernel keeps each
/// block's per-pool memory, adds up what the blocks return, and enforces platform-wide
/// guarantees no block can override:
///  - total fee ≤ 50% during a pool's first 15 minutes, ≤ 10% forever after;
///  - total burn ≤ 5% of a buy;
///  - a launch's price can never trade below its launch price.
/// A block that reverts or returns malformed data is skipped ("fail open"), so a broken
/// block can't freeze a pool. Callers must send enough gas for every block to run, so
/// nobody can starve a block on purpose to get it skipped.
contract HookKernel is IHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using BalanceDeltaLibrary for BalanceDelta;

    uint256 public constant MAX_BLOCKS = 5;
    uint24 public constant MIN_BASE_FEE = 100; // 0.01%
    uint24 public constant MAX_BASE_FEE = 30_000; // 3%
    uint24 public constant MAX_FEE = 100_000; // 10%, once a pool is past its opening window
    uint24 public constant MAX_OPENING_FEE = 500_000; // 50%, during the opening window
    uint32 public constant OPENING_WINDOW = 15 minutes;
    uint16 public constant MAX_BURN_BPS = 500; // 5%
    uint256 public constant BLOCK_GAS_LIMIT = 100_000;
    /// Gas a call must still have before running a block: 63/64ths of it must cover the
    /// block's full budget (EIP-150), plus room to finish the callback.
    uint256 internal constant BLOCK_GAS_REQUIRED = BLOCK_GAS_LIMIT * 64 / 63 + 30_000;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    struct PoolConfig {
        bool registered;
        /// Launch lane: a new token whose whole supply is the locked founding position.
        bool isLaunch;
        /// True when the pool's subject token (launched or listed) is currency0.
        bool subjectIsCurrency0;
        uint24 baseFee;
        uint40 openedAt;
        /// Launches only: the launch price, which sells may never cross. 0 = no floor.
        uint160 floorSqrtPriceX96;
        uint256 subjectSupply;
    }

    struct RegisterParams {
        bool isLaunch;
        bool subjectIsCurrency0;
        uint24 baseFee;
        uint256 subjectSupply;
        address[] blocks;
        bytes[] configs;
    }

    IPoolManager public immutable poolManager;
    BlockCatalog public immutable catalog;
    /// The one address allowed to call `bindLaunchpad`, once.
    address private immutable binder;
    /// The Launchpad allowed to register and initialize pools. Set once, never changed.
    address public launchpad;

    mapping(PoolId => PoolConfig) internal _pools;
    mapping(PoolId => address[]) internal _blocks;
    mapping(PoolId => uint8[]) internal _points;
    mapping(PoolId => bytes[]) internal _configs;
    mapping(PoolId => mapping(uint256 => bytes32)) internal _state;

    event LaunchpadBound(address indexed launchpad);
    event PoolRegistered(PoolId indexed poolId, bool isLaunch, uint24 baseFee, address[] blocks, bytes[] configs);
    event BlockSkipped(PoolId indexed poolId, uint256 index, address indexed block);
    event Burned(PoolId indexed poolId, uint256 amount);

    error NotPoolManager();
    error NotLaunchpad();
    error NotBinder();
    error AlreadyBound();
    error ZeroAddress();
    error InvalidPoolKey();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidBaseFee();
    error TooManyBlocks();
    error LengthMismatch();
    error DuplicateBlock(address block);
    error BlockNotUsable(address block);
    error InvalidBlockConfig(address block);
    error BlockRejected(uint256 index, address block);
    error BelowLaunchFloor();
    error InsufficientGasForBlocks();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager poolManager_, BlockCatalog catalog_, address binder_) {
        if (address(poolManager_) == address(0) || address(catalog_) == address(0) || binder_ == address(0)) {
            revert ZeroAddress();
        }
        poolManager = poolManager_;
        catalog = catalog_;
        binder = binder_;
        // Reverts unless deployed at an address whose low bits encode exactly these
        // permissions (Uniswap v4 reads a hook's permissions from its address).
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ---------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------

    /// @notice Binds the Launchpad. Callable once, by the binder given at deployment.
    /// @dev A one-shot setter breaks the circular dependency: the Launchpad needs this
    /// contract's (mined) address at construction.
    function bindLaunchpad(address launchpad_) external {
        if (msg.sender != binder) revert NotBinder();
        if (launchpad != address(0)) revert AlreadyBound();
        if (launchpad_ == address(0)) revert ZeroAddress();
        launchpad = launchpad_;
        emit LaunchpadBound(launchpad_);
    }

    /// @notice Registers a pool's frozen block stack, right before the Launchpad initializes it.
    function register(PoolKey calldata key, RegisterParams calldata params) external {
        if (msg.sender != launchpad) revert NotLaunchpad();
        if (address(key.hooks) != address(this) || key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert InvalidPoolKey();
        if (params.baseFee < MIN_BASE_FEE || params.baseFee > MAX_BASE_FEE) revert InvalidBaseFee();
        uint256 count = params.blocks.length;
        if (count > MAX_BLOCKS) revert TooManyBlocks();
        if (count != params.configs.length) revert LengthMismatch();

        PoolId id = key.toId();
        PoolConfig storage config = _pools[id];
        if (config.registered) revert AlreadyRegistered();

        for (uint256 i; i < count; i++) {
            address blk = params.blocks[i];
            for (uint256 j; j < i; j++) {
                if (params.blocks[j] == blk) revert DuplicateBlock(blk);
            }
            _addBlock(id, blk, params.configs[i], params.isLaunch);
        }

        config.registered = true;
        config.isLaunch = params.isLaunch;
        config.subjectIsCurrency0 = params.subjectIsCurrency0;
        config.baseFee = params.baseFee;
        config.subjectSupply = params.subjectSupply;
        emit PoolRegistered(id, params.isLaunch, params.baseFee, params.blocks, params.configs);
    }

    function _addBlock(PoolId id, address blk, bytes calldata blockConfig, bool isLaunch) internal {
        if (!catalog.isUsable(blk)) revert BlockNotUsable(blk);

        (bool ok, uint256 points,,) = _callBlock(blk, abi.encodeCall(IRuleBlock.hookPoints, ()), 32);
        if (!ok || points == 0 || points > HookPoints.ALL) revert InvalidBlockConfig(blk);
        (bool valid, uint256 isValid,,) =
            _callBlock(blk, abi.encodeCall(IRuleBlock.validateConfig, (blockConfig, isLaunch)), 32);
        if (!valid || isValid != 1) revert InvalidBlockConfig(blk);

        _blocks[id].push(blk);
        _points[id].push(uint8(points));
        _configs[id].push(blockConfig);
    }

    // ---------------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------------

    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        onlyPoolManager
        returns (bytes4)
    {
        // Only pools the Launchpad registered can use this hook at all.
        if (sender != launchpad) revert NotLaunchpad();
        PoolConfig storage config = _pools[key.toId()];
        if (!config.registered) revert NotRegistered();
        config.openedAt = uint40(block.timestamp);
        if (config.isLaunch) config.floorSqrtPriceX96 = sqrtPriceX96;
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata key, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        PoolId id = key.toId();
        uint8[] storage points = _points[id];
        uint256 count = points.length;
        if (count == 0) return IHooks.beforeAddLiquidity.selector;

        PoolConfig storage config = _pools[id];
        LiquidityContext memory ctx = LiquidityContext({
            poolId: id,
            openedAt: config.openedAt,
            timestamp: uint40(block.timestamp),
            isLaunch: config.isLaunch,
            fromLaunchpad: sender == launchpad
        });
        for (uint256 i; i < count; i++) {
            if (points[i] & HookPoints.BEFORE_ADD_LIQUIDITY == 0) continue;
            address blk = _blocks[id][i];
            (bool ok, uint256 reject,,) = _callBlock(
                blk, abi.encodeCall(IRuleBlock.beforeAddLiquidity, (ctx, _configs[id][i], _state[id][i])), 32
            );
            if (ok && reject == 1) revert BlockRejected(i, blk);
        }
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolConfig memory config = _pools[id];
        uint256 fee = config.baseFee;

        uint8[] storage points = _points[id];
        uint256 count = points.length;
        if (count != 0) {
            SwapContext memory ctx = _swapContext(id, config, params);
            for (uint256 i; i < count; i++) {
                if (points[i] & HookPoints.BEFORE_SWAP != 0) fee += _runBeforeSwap(id, i, ctx);
            }
        }

        uint256 cap = _feeCap(config.openedAt);
        if (fee > cap) fee = cap;
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, uint24(fee) | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolConfig memory config = _pools[id];
        bool isBuy = config.subjectIsCurrency0 != params.zeroForOne;

        if (!isBuy && config.floorSqrtPriceX96 != 0) {
            (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
            uint160 floor = config.floorSqrtPriceX96;
            // Currency0's price falls as it's sold into the pool; currency1's rises.
            if (config.subjectIsCurrency0 ? sqrtPriceX96 < floor : sqrtPriceX96 > floor) revert BelowLaunchFloor();
        }

        uint8[] storage points = _points[id];
        uint256 count = points.length;
        if (count == 0) return (IHooks.afterSwap.selector, 0);

        // `delta` is from the swapper's side: positive = paid out to them.
        int128 subjectDelta = config.subjectIsCurrency0 ? delta.amount0() : delta.amount1();
        SwapContext memory ctx = _swapContext(id, config, params);
        ctx.subjectAmount = subjectDelta < 0 ? uint256(uint128(-subjectDelta)) : uint256(uint128(subjectDelta));

        uint256 burnBps;
        for (uint256 i; i < count; i++) {
            if (points[i] & HookPoints.AFTER_SWAP != 0) burnBps += _runAfterSwap(id, i, ctx);
        }

        // Burns apply to exact-input buys only: there the unspecified currency is the
        // subject token, so the hook's delta comes out of the tokens bought.
        if (burnBps == 0 || !isBuy || params.amountSpecified >= 0) return (IHooks.afterSwap.selector, 0);
        if (burnBps > MAX_BURN_BPS) burnBps = MAX_BURN_BPS;
        uint256 burnAmount = ctx.subjectAmount * burnBps / 10_000;
        if (burnAmount == 0) return (IHooks.afterSwap.selector, 0);

        poolManager.take(config.subjectIsCurrency0 ? key.currency0 : key.currency1, DEAD, burnAmount);
        emit Burned(id, burnAmount);
        // burnAmount < subjectAmount, which came from an int128.
        return (IHooks.afterSwap.selector, int128(int256(burnAmount)));
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    function getPool(PoolId id)
        external
        view
        returns (PoolConfig memory config, address[] memory blocks, bytes[] memory configs, bytes32[] memory states)
    {
        config = _pools[id];
        blocks = _blocks[id];
        configs = _configs[id];
        states = new bytes32[](blocks.length);
        for (uint256 i; i < blocks.length; i++) {
            states[i] = _state[id][i];
        }
    }

    function blocksOf(PoolId id) external view returns (address[] memory) {
        return _blocks[id];
    }

    /// @notice The fee cap in force for a pool right now.
    function feeCap(PoolId id) external view returns (uint24) {
        return _feeCap(_pools[id].openedAt);
    }

    /// @notice What a negligible buy and a negligible sell would pay right now, with every
    /// block's current state (e.g. the damper's decayed pressure) taken into account.
    function previewFees(PoolId id) external view returns (uint24 buyFee, uint24 sellFee) {
        PoolConfig memory config = _pools[id];
        return (_previewFee(id, config, true), _previewFee(id, config, false));
    }

    // ---------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------

    function _runBeforeSwap(PoolId id, uint256 i, SwapContext memory ctx) internal returns (uint256) {
        address blk = _blocks[id][i];
        bytes32 state = _state[id][i];
        (bool ok, uint256 feeAdd, uint256 reject, uint256 newState) =
            _callBlock(blk, abi.encodeCall(IRuleBlock.beforeSwap, (ctx, _configs[id][i], state)), 96);
        if (!ok || feeAdd > type(uint24).max || reject > 1) {
            emit BlockSkipped(id, i, blk);
            return 0;
        }
        if (reject == 1) revert BlockRejected(i, blk);
        if (bytes32(newState) != state) _state[id][i] = bytes32(newState);
        return feeAdd;
    }

    function _runAfterSwap(PoolId id, uint256 i, SwapContext memory ctx) internal returns (uint256) {
        address blk = _blocks[id][i];
        bytes32 state = _state[id][i];
        (bool ok, uint256 burnBps, uint256 reject, uint256 newState) =
            _callBlock(blk, abi.encodeCall(IRuleBlock.afterSwap, (ctx, _configs[id][i], state)), 96);
        if (!ok || burnBps > type(uint16).max || reject > 1) {
            emit BlockSkipped(id, i, blk);
            return 0;
        }
        if (reject == 1) revert BlockRejected(i, blk);
        if (bytes32(newState) != state) _state[id][i] = bytes32(newState);
        return burnBps;
    }

    function _previewFee(PoolId id, PoolConfig memory config, bool isBuy) internal view returns (uint24) {
        uint256 fee = config.baseFee;
        SwapContext memory ctx = SwapContext({
            poolId: id,
            isBuy: isBuy,
            exactInput: true,
            amount: 0,
            impactPpm: 0,
            subjectAmount: 0,
            openedAt: config.openedAt,
            timestamp: uint40(block.timestamp),
            subjectSupply: config.subjectSupply,
            isLaunch: config.isLaunch
        });
        uint8[] storage points = _points[id];
        for (uint256 i; i < points.length; i++) {
            if (points[i] & HookPoints.BEFORE_SWAP == 0) continue;
            (bool ok, uint256 feeAdd,,) = _callBlock(
                _blocks[id][i], abi.encodeCall(IRuleBlock.beforeSwap, (ctx, _configs[id][i], _state[id][i])), 96
            );
            if (ok && feeAdd <= type(uint24).max) fee += feeAdd;
        }
        uint256 cap = _feeCap(config.openedAt);
        return uint24(fee > cap ? cap : fee);
    }

    function _feeCap(uint40 openedAt) internal view returns (uint24) {
        return block.timestamp < uint256(openedAt) + OPENING_WINDOW ? MAX_OPENING_FEE : MAX_FEE;
    }

    function _swapContext(PoolId id, PoolConfig memory config, IPoolManager.SwapParams calldata params)
        internal
        view
        returns (SwapContext memory)
    {
        bool exactInput = params.amountSpecified < 0;
        return SwapContext({
            poolId: id,
            isBuy: config.subjectIsCurrency0 != params.zeroForOne,
            exactInput: exactInput,
            amount: exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified),
            impactPpm: _impactPpm(id, params),
            subjectAmount: 0,
            openedAt: config.openedAt,
            timestamp: uint40(block.timestamp),
            subjectSupply: config.subjectSupply,
            isLaunch: config.isLaunch
        });
    }

    /// @dev Trade size relative to the pool's virtual reserve of the specified currency, in
    /// ppm: a / (reserve + a). Exact-input trades are measured on the input side,
    /// exact-output trades on the output side.
    function _impactPpm(PoolId id, IPoolManager.SwapParams calldata params) internal view returns (uint256) {
        uint128 liquidity = poolManager.getLiquidity(id);
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);
        if (liquidity == 0) {
            // Resting exactly on a position's edge — e.g. a fresh launch whose token sorts
            // as currency1 — no liquidity is active yet, but the trade crosses straight into
            // it. Measure against the liquidity that starts at this tick rather than treating
            // the pool as empty (which would price a $1 first buy as a 100%-of-depth trade).
            (liquidity,) = poolManager.getTickLiquidity(id, tick);
            if (liquidity == 0) return 1_000_000;
        }

        bool exactInput = params.amountSpecified < 0;
        uint256 amount = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        bool measuredIsCurrency0 = exactInput == params.zeroForOne;
        // Virtual reserves at the current price: x = L / sqrtP, y = L * sqrtP.
        uint256 reserve = measuredIsCurrency0
            ? FullMath.mulDiv(liquidity, FixedPoint96.Q96, sqrtPriceX96)
            : FullMath.mulDiv(liquidity, sqrtPriceX96, FixedPoint96.Q96);
        return FullMath.mulDiv(amount, 1_000_000, reserve + amount);
    }

    /// @dev STATICCALLs a block with a fixed gas budget and reads exactly `size` bytes of
    /// return data as up to three words. `ok` is false if the block reverted or returned
    /// any other size, so callers treat both the same: skip the block.
    function _callBlock(address blk, bytes memory data, uint256 size)
        internal
        view
        returns (bool ok, uint256 w0, uint256 w1, uint256 w2)
    {
        if (gasleft() < BLOCK_GAS_REQUIRED) revert InsufficientGasForBlocks();
        uint256 gasLimit = BLOCK_GAS_LIMIT;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            ok := staticcall(gasLimit, blk, add(data, 0x20), mload(data), 0, 0)
            switch and(ok, eq(returndatasize(), size))
            case 0 { ok := 0 }
            default {
                returndatacopy(ptr, 0, size)
                w0 := mload(ptr)
                if gt(size, 0x20) {
                    w1 := mload(add(ptr, 0x20))
                    w2 := mload(add(ptr, 0x40))
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Callbacks this hook does not use. Its address flags never enable them.
    // ---------------------------------------------------------------------------

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
