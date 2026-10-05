// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/libraries/FixedPoint96.sol";
import {FixedPoint128} from "v4-core/libraries/FixedPoint128.sol";
import {SafeCast} from "v4-core/libraries/SafeCast.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";

/// @title LiquidityManager
/// @notice Full-range liquidity for any Uniswap v4 pool with ERC-20 currencies. Each user
/// has their own position per pool (the position salt is their address), owned by this
/// contract on their behalf and only ever modifiable by them. Adding, removing or
/// collecting always pays out the fees the position has earned.
///
/// Plain ERC-20 approvals, no NFTs and no Permit2: the simplest path for the web app.
/// Full range keeps positions always active, which suits newly opened markets.
contract LiquidityManager is IUnlockCallback, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using BalanceDeltaLibrary for BalanceDelta;
    using SafeERC20 for IERC20;

    struct CallbackData {
        address owner;
        PoolKey key;
        int256 liquidityDelta;
        uint256 amount0Max;
        uint256 amount1Max;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    IPoolManager public immutable poolManager;

    event LiquidityModified(PoolId indexed poolId, address indexed owner, int256 liquidityDelta, int256 amount0, int256 amount1);

    error NotPoolManager();
    error DeadlineExpired();
    error NativeCurrencyUnsupported();
    error ZeroLiquidity();
    error PoolNotInitialized();
    error TooMuchRequested(uint256 amount0, uint256 amount1);
    error TooLittleReceived(uint256 amount0, uint256 amount1);

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    /// @notice Adds full-range liquidity using at most the given amounts, at the current
    /// price. Whatever isn't needed stays in the caller's wallet (only what's used is pulled).
    function addLiquidity(PoolKey calldata key, uint256 amount0Max, uint256 amount1Max, uint256 deadline)
        external
        nonReentrant
        returns (uint128 liquidity, BalanceDelta delta)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (key.currency0.isAddressZero()) revert NativeCurrencyUnsupported();
        liquidity = liquidityForAmounts(key, amount0Max, amount1Max);
        if (liquidity == 0) revert ZeroLiquidity();
        delta = _modify(key, int256(uint256(liquidity)), amount0Max, amount1Max, 0, 0);
    }

    /// @notice Removes liquidity (and collects fees) to the caller.
    function removeLiquidity(PoolKey calldata key, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)
        external
        nonReentrant
        returns (BalanceDelta delta)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (liquidity == 0) revert ZeroLiquidity();
        delta = _modify(key, -int256(uint256(liquidity)), 0, 0, amount0Min, amount1Min);
    }

    /// @notice Collects the fees the caller's position has earned, leaving the liquidity.
    function collect(PoolKey calldata key) external nonReentrant returns (BalanceDelta delta) {
        delta = _modify(key, 0, 0, 0, 0, 0);
    }

    function unlockCallback(bytes calldata raw) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        CallbackData memory data = abi.decode(raw, (CallbackData));
        (int24 tickLower, int24 tickUpper) = fullRange(data.key.tickSpacing);

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            data.key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: data.liquidityDelta,
                salt: _salt(data.owner)
            }),
            ""
        );

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        // Negative = owed to the pool (adding); positive = paid out (removing / fees).
        uint256 owed0 = amount0 < 0 ? uint256(uint128(-amount0)) : 0;
        uint256 owed1 = amount1 < 0 ? uint256(uint128(-amount1)) : 0;
        if (owed0 > data.amount0Max || owed1 > data.amount1Max) revert TooMuchRequested(owed0, owed1);
        uint256 out0 = amount0 > 0 ? uint256(uint128(amount0)) : 0;
        uint256 out1 = amount1 > 0 ? uint256(uint128(amount1)) : 0;
        if (out0 < data.amount0Min || out1 < data.amount1Min) revert TooLittleReceived(out0, out1);

        _settle(data.key.currency0, data.owner, owed0, out0);
        _settle(data.key.currency1, data.owner, owed1, out1);
        return abi.encode(delta);
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    /// @notice A user's full-range position in a pool and the fees it has earned so far.
    function positionOf(PoolKey calldata key, address owner)
        external
        view
        returns (uint128 liquidity, uint256 fees0, uint256 fees1)
    {
        PoolId id = key.toId();
        (int24 tickLower, int24 tickUpper) = fullRange(key.tickSpacing);
        uint256 last0;
        uint256 last1;
        (liquidity, last0, last1) = poolManager.getPositionInfo(id, address(this), tickLower, tickUpper, _salt(owner));
        (uint256 growth0, uint256 growth1) = poolManager.getFeeGrowthInside(id, tickLower, tickUpper);
        // Fee growth counters are designed to wrap; the difference is what matters.
        unchecked {
            fees0 = FullMath.mulDiv(growth0 - last0, liquidity, FixedPoint128.Q128);
            fees1 = FullMath.mulDiv(growth1 - last1, liquidity, FixedPoint128.Q128);
        }
    }

    /// @notice Full-range liquidity that the given amounts buy at the current price.
    /// Leaves one unit of each amount as headroom for the PoolManager's rounding.
    function liquidityForAmounts(PoolKey calldata key, uint256 amount0, uint256 amount1) public view returns (uint128) {
        (uint160 sqrtPrice,,,) = poolManager.getSlot0(key.toId());
        if (sqrtPrice == 0) revert PoolNotInitialized();
        (int24 tickLower, int24 tickUpper) = fullRange(key.tickSpacing);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        amount0 = amount0 > 1 ? amount0 - 1 : 0;
        amount1 = amount1 > 1 ? amount1 - 1 : 0;

        // Full range: the price is always inside, so both amounts constrain liquidity.
        uint256 fromAmount0 =
            FullMath.mulDiv(amount0, FullMath.mulDiv(sqrtPrice, sqrtUpper, FixedPoint96.Q96), sqrtUpper - sqrtPrice);
        uint256 fromAmount1 = FullMath.mulDiv(amount1, FixedPoint96.Q96, sqrtPrice - sqrtLower);
        return SafeCast.toUint128(fromAmount0 < fromAmount1 ? fromAmount0 : fromAmount1);
    }

    function fullRange(int24 tickSpacing) public pure returns (int24 tickLower, int24 tickUpper) {
        return (TickMath.minUsableTick(tickSpacing), TickMath.maxUsableTick(tickSpacing));
    }

    // ---------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------

    function _modify(
        PoolKey calldata key,
        int256 liquidityDelta,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal returns (BalanceDelta delta) {
        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData(msg.sender, key, liquidityDelta, amount0Max, amount1Max, amount0Min, amount1Min))
        );
        delta = abi.decode(result, (BalanceDelta));
        emit LiquidityModified(key.toId(), msg.sender, liquidityDelta, delta.amount0(), delta.amount1());
    }

    function _settle(Currency currency, address owner, uint256 owed, uint256 out) internal {
        if (owed != 0) {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransferFrom(owner, address(poolManager), owed);
            poolManager.settle();
        }
        if (out != 0) poolManager.take(currency, owner, out);
    }

    function _salt(address owner) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(owner)));
    }
}
