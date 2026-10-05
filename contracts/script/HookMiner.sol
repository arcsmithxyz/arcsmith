// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Hooks} from "v4-core/libraries/Hooks.sol";

/// @notice Finds a CREATE2 salt that deploys a hook at an address whose low 14 bits are
/// exactly its permission flags — Uniswap v4 reads a hook's permissions from its address.
/// A match takes ~16k tries on average (1 in 2^14).
library HookMiner {
    uint256 internal constant MAX_LOOP = 300_000;

    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        view
        returns (address hookAddress, bytes32 salt)
    {
        flags = flags & Hooks.ALL_HOOK_MASK;
        bytes32 initCodeHash = keccak256(abi.encodePacked(creationCode, constructorArgs));
        for (uint256 i; i < MAX_LOOP; i++) {
            salt = bytes32(i);
            hookAddress = computeAddress(deployer, salt, initCodeHash);
            if (uint160(hookAddress) & Hooks.ALL_HOOK_MASK == flags && hookAddress.code.length == 0) {
                return (hookAddress, salt);
            }
        }
        revert("HookMiner: no salt found");
    }

    function computeAddress(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
