// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseBlock} from "./BaseBlock.sol";
import {HookPoints, SwapContext} from "../interfaces/IRuleBlock.sol";

/// @title BurnBlock — "Auto-burn"
/// @notice Burns a share of every exact-input buy's output. (On exact-output buys the kernel
/// skips burns: the adjustment would land on the input side and charge the buyer extra.)
///
/// Config: abi.encode(uint16 burnBps)
contract BurnBlock is BaseBlock {
    uint16 public constant MAX_BURN_BPS = 500;

    function hookPoints() external pure returns (uint8) {
        return HookPoints.AFTER_SWAP;
    }

    function validateConfig(bytes calldata config, bool) external pure returns (bool) {
        if (config.length != 32) return false;
        uint16 burnBps = abi.decode(config, (uint16));
        return burnBps > 0 && burnBps <= MAX_BURN_BPS;
    }

    function afterSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        pure
        override
        returns (uint16, bool, bytes32)
    {
        return (ctx.isBuy ? abi.decode(config, (uint16)) : 0, false, state);
    }
}
