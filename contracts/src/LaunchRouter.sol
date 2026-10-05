// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";

/// @title LaunchRouter
/// @notice Minimal exact-input swap router for Uniswap v4 pools with ERC-20 currencies.
/// The web app uses it instead of the Universal Router so a trade needs one plain ERC-20
/// approval instead of the Permit2 flow. It holds no funds between transactions.
contract LaunchRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;

    struct SwapData {
        address payer;
        address recipient;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint160 sqrtPriceLimitX96;
        bool quoteOnly;
    }

    IPoolManager public immutable poolManager;

    error NotPoolManager();
    error DeadlineExpired();
    error InvalidAmount();
    error NativeCurrencyUnsupported();
    error UnexpectedDelta();
    error TooLittleReceived(uint256 amountOut, uint256 minAmountOut);
    /// @dev Carries a simulated result out of the unlock callback; see `quoteExactIn`.
    error QuoteResult(uint256 amountIn, uint256 amountOut);

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    /// @notice Swaps up to `amountIn` of the input currency for as much output as possible.
    /// @param sqrtPriceLimitX96 Price the swap may not cross; 0 for no limit. If the limit
    /// is reached, only part of `amountIn` is spent and only that part is pulled.
    /// @return amountInUsed Input actually pulled from the caller.
    /// @return amountOut Output sent to `recipient`, after any hook adjustment (e.g. burn).
    function swapExactIn(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minAmountOut,
        uint160 sqrtPriceLimitX96,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountInUsed, uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        bytes memory result = poolManager.unlock(
            _encode(msg.sender, recipient, key, zeroForOne, amountIn, sqrtPriceLimitX96, false)
        );
        (amountInUsed, amountOut) = abi.decode(result, (uint256, uint256));
        if (amountOut < minAmountOut) revert TooLittleReceived(amountOut, minAmountOut);
    }

    /// @notice Simulates `swapExactIn` against live state, hooks included, and returns the
    /// result without moving any funds. Meant to be called with eth_call.
    /// @dev The swap runs inside the unlock callback, which then reverts with the result;
    /// the revert undoes every state change and is decoded here.
    function quoteExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint160 sqrtPriceLimitX96)
        external
        returns (uint256 amountInUsed, uint256 amountOut)
    {
        try poolManager.unlock(_encode(address(0), address(0), key, zeroForOne, amountIn, sqrtPriceLimitX96, true)) {
            // The callback always reverts in quote mode.
            revert UnexpectedDelta();
        } catch (bytes memory reason) {
            if (reason.length == 68 && bytes4(reason) == QuoteResult.selector) {
                assembly ("memory-safe") {
                    amountInUsed := mload(add(reason, 36))
                    amountOut := mload(add(reason, 68))
                }
            } else {
                // Anything else (e.g. a hook rejecting the trade) is surfaced as-is.
                assembly ("memory-safe") {
                    revert(add(reason, 32), mload(reason))
                }
            }
        }
    }

    function unlockCallback(bytes calldata raw) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        SwapData memory data = abi.decode(raw, (SwapData));

        uint160 limit = data.sqrtPriceLimitX96;
        if (limit == 0) limit = data.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;

        BalanceDelta delta = poolManager.swap(
            data.key,
            IPoolManager.SwapParams({
                zeroForOne: data.zeroForOne,
                amountSpecified: -int256(data.amountIn),
                sqrtPriceLimitX96: limit
            }),
            ""
        );

        (int128 inDelta, int128 outDelta) =
            data.zeroForOne ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
        if (inDelta > 0 || outDelta < 0) revert UnexpectedDelta();
        uint256 paid = uint256(uint128(-inDelta));
        uint256 received = uint256(uint128(outDelta));

        if (data.quoteOnly) revert QuoteResult(paid, received);

        (Currency input, Currency output) =
            data.zeroForOne ? (data.key.currency0, data.key.currency1) : (data.key.currency1, data.key.currency0);
        if (paid != 0) {
            poolManager.sync(input);
            IERC20(Currency.unwrap(input)).safeTransferFrom(data.payer, address(poolManager), paid);
            poolManager.settle();
        }
        if (received != 0) poolManager.take(output, data.recipient, received);
        return abi.encode(paid, received);
    }

    function _encode(
        address payer,
        address recipient,
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96,
        bool quoteOnly
    ) internal pure returns (bytes memory) {
        // int128 bounds what the PoolManager can account for in one swap.
        if (amountIn == 0 || amountIn > uint256(uint128(type(int128).max))) revert InvalidAmount();
        if (key.currency0.isAddressZero()) revert NativeCurrencyUnsupported();
        return abi.encode(
            SwapData({
                payer: payer,
                recipient: recipient,
                key: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                sqrtPriceLimitX96: sqrtPriceLimitX96,
                quoteOnly: quoteOnly
            })
        );
    }
}
