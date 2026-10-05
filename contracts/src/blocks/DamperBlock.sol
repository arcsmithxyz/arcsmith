// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseBlock} from "./BaseBlock.sol";
import {HookPoints, SwapContext} from "../interfaces/IRuleBlock.sol";

/// @title DamperBlock — "Dump damper"
/// @notice Sells pay a surcharge that grows with *net sell pressure*: every sell adds its
/// size (in ppm of pool depth), every buy removes its size, and pressure fades by ~100% of
/// depth per hour. One holder trimming a bag pays ~nothing extra; a fast mass exit pays up
/// to the cap. The surcharge accrues to the pool's LPs like any fee.
///
/// Config: abi.encode(uint32 slope, uint24 maxSurcharge)
///   surcharge = min(maxSurcharge, pressure × slope / 1e6)
/// State:  low 64 bits = pressure (ppm of depth), next 40 bits = last update timestamp.
contract DamperBlock is BaseBlock {
    uint32 public constant MAX_SLOPE = 1_000_000;
    uint24 public constant MAX_SURCHARGE = 99_000;
    /// ~100% of pool depth per hour.
    uint256 public constant DECAY_PER_SECOND = 278;
    /// Pressure never accumulates past this, so it always fades within ~3 hours.
    uint256 public constant MAX_PRESSURE = 3_000_000;

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
        returns (uint24 feeAdd, bool reject, bytes32 newState)
    {
        (uint32 slope, uint24 maxSurcharge) = abi.decode(config, (uint32, uint24));
        uint256 pressure = decayed(state, ctx.timestamp);

        if (ctx.isBuy) {
            pressure = pressure > ctx.impactPpm ? pressure - ctx.impactPpm : 0;
        } else {
            pressure += ctx.impactPpm;
            if (pressure > MAX_PRESSURE) pressure = MAX_PRESSURE;
            uint256 surcharge = pressure * slope / 1_000_000;
            feeAdd = surcharge > maxSurcharge ? maxSurcharge : uint24(surcharge);
        }
        newState = encode(pressure, ctx.timestamp);
        reject = false; // the damper only ever prices, never refuses
    }

    /// @notice Pressure after decay, for the kernel's fee previews and for UIs.
    function decayed(bytes32 state, uint256 timestamp) public pure returns (uint256) {
        uint256 raw = uint256(state);
        uint256 pressure = uint64(raw);
        uint256 updatedAt = uint40(raw >> 64);
        if (updatedAt == 0 || timestamp <= updatedAt) return pressure;
        uint256 decay = (timestamp - updatedAt) * DECAY_PER_SECOND;
        return pressure > decay ? pressure - decay : 0;
    }

    function encode(uint256 pressure, uint256 timestamp) public pure returns (bytes32) {
        return bytes32((uint256(uint40(timestamp)) << 64) | uint256(uint64(pressure)));
    }
}
