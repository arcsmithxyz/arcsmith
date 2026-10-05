// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolId} from "v4-core/types/PoolId.sol";

/// @notice What a block sees about a trade. Built by the HookKernel; blocks never touch
/// the pool, the PoolManager or any funds.
struct SwapContext {
    PoolId poolId;
    /// True when the swapper receives the pool's subject token (the launched or listed token).
    bool isBuy;
    bool exactInput;
    /// |amountSpecified|, in units of the currency the swapper specified.
    uint256 amount;
    /// Trade size against the pool's virtual reserve of the specified currency, in ppm:
    /// amount / (reserve + amount). Always below 1e6.
    uint256 impactPpm;
    /// Subject tokens that left the pool (buys) or entered it (sells). 0 in beforeSwap.
    uint256 subjectAmount;
    /// When the pool was initialized.
    uint40 openedAt;
    uint40 timestamp;
    /// Total supply of the subject token when the pool was registered.
    uint256 subjectSupply;
    /// True for the launch lane: a new token whose whole supply is the locked founding position.
    bool isLaunch;
}

/// @notice What a block sees about a liquidity addition.
struct LiquidityContext {
    PoolId poolId;
    uint40 openedAt;
    uint40 timestamp;
    bool isLaunch;
    /// True when the Launchpad is adding a launch's founding liquidity.
    bool fromLaunchpad;
}

/// @title IRuleBlock
/// @notice A reusable trading rule. Blocks are pure calculators: the kernel calls every
/// function with STATICCALL and a fixed gas budget, so a block can read its inputs and
/// its own config but can't change any state, move funds or call the pool. Per-pool
/// memory lives in the kernel as one bytes32 per block, handed in and returned.
///
/// The kernel adds up what blocks return and enforces platform-wide limits on the sum,
/// so a block can only make a trade cost more, never exceed the caps. A block that
/// reverts or returns malformed data is skipped for that call ("fail open").
interface IRuleBlock {
    /// Bitmask of the hook points a block uses. See HookPoints.
    function hookPoints() external pure returns (uint8);

    /// True when `config` is valid for this block in a pool of the given lane.
    function validateConfig(bytes calldata config, bool isLaunch) external view returns (bool);

    /// @return feeAdd Pips added to the pool's base fee for this trade.
    /// @return reject True to refuse the trade.
    /// @return newState The block's per-pool memory after this trade.
    function beforeSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        view
        returns (uint24 feeAdd, bool reject, bytes32 newState);

    /// @return burnBps Share of an exact-input buy's output to burn, in bps.
    /// @return reject True to refuse the trade (after seeing its size).
    /// @return newState The block's per-pool memory after this trade.
    function afterSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        view
        returns (uint16 burnBps, bool reject, bytes32 newState);

    /// @return reject True to refuse the liquidity addition.
    function beforeAddLiquidity(LiquidityContext calldata ctx, bytes calldata config, bytes32 state)
        external
        view
        returns (bool reject);
}

library HookPoints {
    uint8 internal constant BEFORE_SWAP = 1;
    uint8 internal constant AFTER_SWAP = 2;
    uint8 internal constant BEFORE_ADD_LIQUIDITY = 4;
    uint8 internal constant ALL = 7;
}
