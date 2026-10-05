// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseBlock} from "./BaseBlock.sol";
import {HookPoints, SwapContext} from "../interfaces/IRuleBlock.sol";

/// @title SurgeBlock — "Surge fee"
/// @notice The fee scales with the size of each trade against pool depth, in both
/// directions. Small trades pay the base fee; a whale moving the price pays more, and the
/// extra goes to LPs who absorbed the move. Stateless: unlike the damper it looks at one
/// trade at a time.
///
/// Config: abi.encode(uint32 slope, uint24 maxSurcharge)
///   surcharge = min(maxSurcharge, impactPpm × slope / 1e6)
contract SurgeBlock is BaseBlock {
    uint32 public constant MAX_SLOPE = 1_000_000;
    uint24 public constant MAX_SURCHARGE = 99_000;

    function hookPoints() external pure returns (uint8) {
        return HookPoints.BEFORE_SWAP;
    }

    function validateConfig(bytes calldata config, bool) external pure returns (bool) {
        if (config.length != 64) return false;
        (uint32 slope, uint24 maxSurcharge) = abi.decode(config, (uint32, uint24));
        return slope > 0 && slope <= MAX_SLOPE && maxSurcharge > 0 && maxSurcharge <= MAX_SURCHARGE;
    }

    function beforeSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external
        pure
        override
        returns (uint24, bool, bytes32)
    {
        (uint32 slope, uint24 maxSurcharge) = abi.decode(config, (uint32, uint24));
        uint256 surcharge = ctx.impactPpm * slope / 1_000_000;
        return (surcharge > maxSurcharge ? maxSurcharge : uint24(surcharge), false, state);
    }
}
