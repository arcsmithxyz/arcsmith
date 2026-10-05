// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";

/// @notice Stand-ins for Arc's USDC system precompiles, for Forge's local EVM only.
///
/// Arc's USDC (0x3600…0000) is backed by native account balance rather than an ERC-20
/// storage mapping, and every transfer goes through two system precompiles:
/// 0x1800…0001 (blocklist check) and 0x1800…0000 (the value move). They live in the node
/// client, not as fetchable bytecode, so Forge (fork tests, and the local run of any script)
/// can't reproduce them and every USDC transfer reverts. On Arc itself they work.
///
/// `stub` etches working stand-ins into the local EVM. It changes nothing on chain: scripts
/// that use it must broadcast with `--skip-simulation`, so Forge doesn't replay the
/// transactions in a fresh, un-stubbed fork before sending them.
library ArcPrecompiles {
    address internal constant BLOCKLIST = 0x1800000000000000000000000000000000000001;
    address internal constant VALUE_MOVER = 0x1800000000000000000000000000000000000000;

    function stub(Vm vm) internal {
        vm.etch(BLOCKLIST, address(new AlwaysFalse()).code);
        vm.etch(VALUE_MOVER, address(new FakeValueMover()).code);
        vm.allowCheatcodes(VALUE_MOVER);
    }
}

/// @dev Stand-in for the value-move precompile: decodes transfer(from, to, amount) and
/// moves native balance with the `deal` cheatcode.
contract FakeValueMover {
    address internal constant VM_ADDRESS = 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D;

    fallback(bytes calldata data) external returns (bytes memory) {
        (address from, address to, uint256 amount) = abi.decode(data[4:], (address, address, uint256));
        uint256 fromBalance = from.balance;
        require(fromBalance >= amount, "FakeValueMover: insufficient balance");

        (bool ok1,) = VM_ADDRESS.call(abi.encodeWithSignature("deal(address,uint256)", from, fromBalance - amount));
        (bool ok2,) = VM_ADDRESS.call(abi.encodeWithSignature("deal(address,uint256)", to, to.balance + amount));
        require(ok1 && ok2, "FakeValueMover: deal failed");
        return abi.encode(true);
    }
}

/// @dev Stand-in for the blocklist precompile: nobody is blocklisted.
contract AlwaysFalse {
    function isBlocklisted(address) external pure returns (bool) {
        return false;
    }

    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 32)
        }
    }
}
