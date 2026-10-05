// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRuleBlock, SwapContext, LiquidityContext} from "../interfaces/IRuleBlock.sol";

/// @notice Neutral defaults for every hook point, so a block only overrides what it uses.
/// Also the starting point for third-party blocks.
abstract contract BaseBlock is IRuleBlock {
    function beforeSwap(SwapContext calldata, bytes calldata, bytes32 state)
        external
        view
        virtual
        returns (uint24, bool, bytes32)
    {
        return (0, false, state);
    }

    function afterSwap(SwapContext calldata, bytes calldata, bytes32 state)
        external
        view
        virtual
        returns (uint16, bool, bytes32)
    {
        return (0, false, state);
    }

    function beforeAddLiquidity(LiquidityContext calldata, bytes calldata, bytes32)
        external
        view
        virtual
        returns (bool)
    {
        return false;
    }
}
