// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseBlock} from "./BaseBlock.sol";
import {HookPoints, SwapContext, LiquidityContext} from "../interfaces/IRuleBlock.sol";

/// @title GuardBlock — "Launch guard"
/// @notice For the first minutes of a launch: a buy fee premium that decays linearly to
/// zero, a cap on how much of the supply one swap may buy, and no third-party liquidity
/// (so nobody can park a narrow position at the launch price to skim the premium).
/// Launch lane only: an existing asset already trades elsewhere, so a guard means nothing.
///
/// Config: abi.encode(uint24 premium, uint32 duration, uint16 maxBuyBps)
contract GuardBlock is BaseBlock {
    uint24 public constant MAX_PREMIUM = 490_000; // + base fee stays under the kernel's 50% opening cap
    uint32 public constant MAX_DURATION = 15 minutes;
    uint16 public constant MAX_BUY_BPS = 1_000; // 10% of supply per swap

    function hookPoints() external pure returns (uint8) {
        return HookPoints.ALL;
    }

    function validateConfig(bytes calldata config, bool isLaunch) external pure returns (bool) {
        if (!isLaunch || config.length != 96) return false;
        (uint24 premium, uint32 duration, uint16 maxBuyBps) = abi.decode(config, (uint24, uint32, uint16));
        return duration > 0 && duration <= MAX_DURATION && premium <= MAX_PREMIUM && maxBuyBps <= MAX_BUY_BPS
            && (premium > 0 || maxBuyBps > 0);
    }

    function beforeSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        pure
        override
        returns (uint24, bool, bytes32)
    {
        (uint24 premium, uint32 duration,) = abi.decode(config, (uint24, uint32, uint16));
        uint256 elapsed = ctx.timestamp - ctx.openedAt;
        if (!ctx.isBuy || elapsed >= duration) return (0, false, state);
        return (uint24(uint256(premium) * (duration - elapsed) / duration), false, state);
    }

    function afterSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        pure
        override
        returns (uint16, bool, bytes32)
    {
        (, uint32 duration, uint16 maxBuyBps) = abi.decode(config, (uint24, uint32, uint16));
        bool active = ctx.timestamp - ctx.openedAt < duration;
        bool tooLarge = maxBuyBps != 0 && ctx.subjectAmount > ctx.subjectSupply * maxBuyBps / 10_000;
        return (0, ctx.isBuy && active && tooLarge, state);
    }

    function beforeAddLiquidity(LiquidityContext calldata ctx, bytes calldata config, bytes32)
        external
        pure
        override
        returns (bool)
    {
        (, uint32 duration,) = abi.decode(config, (uint24, uint32, uint16));
        return !ctx.fromLaunchpad && ctx.timestamp - ctx.openedAt < duration;
    }
}
