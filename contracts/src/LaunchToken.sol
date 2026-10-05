// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply ERC-20 created for every launch. No owner, no mint, no burn
/// function, no transfer tax, no blocklist: the entire supply is minted once to the
/// launchpad, which puts it into the pool in the same transaction.
contract LaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply, address recipient) ERC20(name_, symbol_) {
        _mint(recipient, supply);
    }
}
