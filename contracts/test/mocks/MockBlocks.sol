// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseBlock} from "../../src/blocks/BaseBlock.sol";
import {HookPoints, SwapContext, LiquidityContext} from "../../src/interfaces/IRuleBlock.sol";

/// Misbehaving blocks for the kernel's safety tests. Each one is approved in the catalog
/// in the tests that use it, to prove the kernel's guarantees hold even for reviewed code.

/// Asks for the largest fee a uint24 can express on every trade.
contract GreedyBlock is BaseBlock {
    function hookPoints() external pure returns (uint8) {
        return HookPoints.BEFORE_SWAP | HookPoints.AFTER_SWAP;
    }

    function validateConfig(bytes calldata, bool) external pure returns (bool) {
        return true;
    }

    function beforeSwap(SwapContext calldata, bytes calldata, bytes32 state)
        external
        pure
        override
        returns (uint24, bool, bytes32)
    {
        return (type(uint24).max, false, state);
    }

    function afterSwap(SwapContext calldata, bytes calldata, bytes32 state)
        external
        pure
        override
        returns (uint16, bool, bytes32)
    {
        return (type(uint16).max, false, state);
    }
}

/// Reverts on every trade (but validates fine, so it can be registered).
contract RevertingBlock is BaseBlock {
    function hookPoints() external pure returns (uint8) {
        return HookPoints.ALL;
    }

    function validateConfig(bytes calldata, bool) external pure returns (bool) {
        return true;
    }

    function beforeSwap(SwapContext calldata, bytes calldata, bytes32) external pure override returns (uint24, bool, bytes32) {
        revert("broken");
    }

    function afterSwap(SwapContext calldata, bytes calldata, bytes32) external pure override returns (uint16, bool, bytes32) {
        revert("broken");
    }

    function beforeAddLiquidity(LiquidityContext calldata, bytes calldata, bytes32) external pure override returns (bool) {
        revert("broken");
    }
}

/// Spins until it runs out of gas on every trade.
contract GasBurnerBlock is BaseBlock {
    function hookPoints() external pure returns (uint8) {
        return HookPoints.BEFORE_SWAP;
    }

    function validateConfig(bytes calldata, bool) external pure returns (bool) {
        return true;
    }

    function beforeSwap(SwapContext calldata, bytes calldata, bytes32 state)
        external
        view
        override
        returns (uint24, bool, bytes32)
    {
        uint256 x;
        while (gasleft() > 0) {
            x++;
        }
        return (uint24(x), false, state);
    }
}

/// Returns a 64-byte answer where the kernel expects 96, and a bool that isn't 0 or 1.
contract MalformedBlock is BaseBlock {
    function hookPoints() external pure returns (uint8) {
        return HookPoints.BEFORE_SWAP | HookPoints.AFTER_SWAP;
    }

    function validateConfig(bytes calldata, bool) external pure returns (bool) {
        return true;
    }

    function beforeSwap(SwapContext calldata, bytes calldata, bytes32) external pure override returns (uint24, bool, bytes32) {
        assembly {
            mstore(0, 50000)
            mstore(32, 1)
            return(0, 64)
        }
    }

    function afterSwap(SwapContext calldata, bytes calldata, bytes32) external pure override returns (uint16, bool, bytes32) {
        assembly {
            mstore(0, 100)
            mstore(32, 2) // not a valid bool
            mstore(64, 0)
            return(0, 96)
        }
    }
}

/// Refuses every buy.
contract RejectBuysBlock is BaseBlock {
    function hookPoints() external pure returns (uint8) {
        return HookPoints.BEFORE_SWAP;
    }

    function validateConfig(bytes calldata, bool) external pure returns (bool) {
        return true;
    }

    function beforeSwap(SwapContext calldata ctx, bytes calldata, bytes32 state)
        external
        pure
        override
        returns (uint24, bool, bytes32)
    {
        return (0, ctx.isBuy, state);
    }
}
