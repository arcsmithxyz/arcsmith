// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Launchpad} from "../src/Launchpad.sol";
import {SurgeBlock} from "../src/blocks/SurgeBlock.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {MockToken} from "../test/mocks/MockToken.sol";
import {DeployBase} from "./DeployBase.sol";
import {BlockMetadata} from "./BlockMetadata.sol";

/// @notice Local development only. On a fresh Anvil chain: deploys a Uniswap v4 PoolManager,
/// a mock 6-decimal USDC and the whole platform (same sequence as Deploy.s.sol), funds
/// Anvil's ten test accounts with 100,000 mock USDC each, then seeds a realistic picture:
/// launches with different block stacks and real trades, a third-party block with a
/// royalty, a block still pending review, and an open market for an "existing" token with
/// outside liquidity.
///
/// Used by `pnpm dev:local` in web/. Anvil's test keys are public; never use them elsewhere.
contract DeployLocal is DeployBase {
    string internal constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
    int24 internal constant LAUNCH_TICK = -398_400;

    Platform internal p;
    MockUSDC internal usdc;
    SurgeBlock internal whaleTax;
    uint256[10] internal keys;

    function run() external {
        require(block.chainid == 31337, "DeployLocal: local Anvil chain only");
        for (uint256 i; i < keys.length; i++) {
            keys[i] = vm.deriveKey(ANVIL_MNEMONIC, uint32(i));
        }
        address deployer = vm.addr(keys[0]);

        vm.startBroadcast(keys[0]);
        PoolManager manager = new PoolManager(deployer);
        usdc = new MockUSDC();
        p = deployPlatform(IPoolManager(address(manager)), address(usdc), deployer, LAUNCH_TICK, deployer, 2_000, deployer);
        for (uint256 i; i < keys.length; i++) {
            usdc.mint(vm.addr(keys[i]), 100_000e6);
        }
        vm.stopBroadcast();
        uint256 deployedAtBlock = block.number;

        for (uint256 i = 1; i < keys.length; i++) {
            vm.startBroadcast(keys[i]);
            usdc.approve(address(p.router), type(uint256).max);
            usdc.approve(address(p.liquidity), type(uint256).max);
            vm.stopBroadcast();
        }

        _communityBlocks();
        _seedLaunches();
        _seedOpenMarket();

        writeDeployment(p, address(manager), address(usdc), "deployments/31337.json");
        console2.log("Launchpad", address(p.launchpad));
        console2.log("Seeded markets", p.launchpad.marketCount());
        console2.log("Deployed at block", deployedAtBlock);
    }

    /// Account 9 plays a third-party block author: one approved block with a 10% royalty,
    /// one submission still waiting for review.
    function _communityBlocks() internal {
        vm.startBroadcast(keys[9]);
        whaleTax = new SurgeBlock();
        p.catalog.submit(
            address(whaleTax),
            string.concat(
                BlockMetadata.PREFIX,
                '{"name":"Whale Tax","summary":"Community block: a steeper surge that only bites on very large trades.","lanes":"any","config":[',
                '{"key":"slope","type":"uint32","label":"Strength","unit":"number","min":1,"max":1000000,"default":150000},',
                '{"key":"maxSurcharge","type":"uint24","label":"Max extra fee","unit":"pips","min":1,"max":99000,"default":40000}]}'
            )
        );
        SurgeBlock pending = new SurgeBlock();
        p.catalog.submit(
            address(pending),
            string.concat(
                BlockMetadata.PREFIX,
                '{"name":"Cooldown","summary":"Community block, in review: rate-limits repeat buys in quick succession.","lanes":"any","config":[]}'
            )
        );
        vm.stopBroadcast();

        vm.broadcast(keys[0]);
        p.catalog.approve(address(whaleTax), 1_000);
    }

    /// Oldest first; the web app lists newest first, so the guarded launches show on top.
    function _seedLaunches() internal {
        uint256 hcat = _launch(
            1, "Harbor Cat", "HCAT", "The cat that lives on the pier and judges every boat.",
            _stack3(address(p.damper), abi.encode(uint32(500_000), uint24(70_000)), address(p.burn), abi.encode(uint16(50)), address(whaleTax), abi.encode(uint32(150_000), uint24(40_000)))
        );
        _buy(4, hcat, 2_500);
        _buy(5, hcat, 1_200);
        _buy(6, hcat, 600);
        _sell(4, hcat, 40); // a big exit: the damper reacts

        uint256 sloth = _launch(2, "Stable Sloth", "SLOTH", "Moves slowly, settles in under a second. No blocks, just a 1% pool.", _none());
        _buy(5, sloth, 4_000);
        _buy(7, sloth, 1_500);
        _buy(8, sloth, 800);
        _sell(7, sloth, 30);

        uint256 toast = _launch(
            3, "Burnt Toast", "TOAST", "Two percent of every buy goes up in smoke.",
            _stack2(address(p.damper), abi.encode(uint32(500_000), uint24(70_000)), address(p.burn), abi.encode(uint16(200)))
        );
        _buy(6, toast, 900);
        _buy(8, toast, 400);

        // Standard: 3-minute guard, so these buys pay the decaying launch fee and stay under the 1% cap.
        uint256 frog = _launch(
            1, "Relay Frog", "FROG", "Hops across chains, lands on Arc.",
            _stack2(address(p.guard), abi.encode(uint24(290_000), uint32(180), uint16(100)), address(p.damper), abi.encode(uint32(500_000), uint24(70_000)))
        );
        _buy(4, frog, 20);
        _buy(5, frog, 35);
        _buy(6, frog, 25);

        // Fortress: 5-minute guard, 0.5% cap, stronger damper, 1% burn.
        uint256 quiet = _launch(
            2, "Quiet Harbor", "QUIET", "Fortress rules: long guard, tight cap, burn on buys.",
            _stack3(address(p.guard), abi.encode(uint24(390_000), uint32(300), uint16(50)), address(p.damper), abi.encode(uint32(800_000), uint24(90_000)), address(p.burn), abi.encode(uint16(100)))
        );
        _buy(7, quiet, 15);
        _buy(8, quiet, 10);

        _launch(
            3, "Night Market", "NIGHT", "Fresh launch, no trades yet.",
            _stack2(address(p.guard), abi.encode(uint24(290_000), uint32(180), uint16(100)), address(p.damper), abi.encode(uint32(500_000), uint24(70_000)))
        );
    }

    /// An "existing" token (as if bridged in) gets a hooked market: damper + surge on a 0.3%
    /// base, $2 per token, two outside LPs, then some trading.
    function _seedOpenMarket() internal {
        vm.startBroadcast(keys[2]);
        MockToken gold = new MockToken("Arc Gold", "AGLD");
        vm.stopBroadcast();
        for (uint256 i = 4; i <= 8; i++) {
            vm.startBroadcast(keys[2]);
            gold.mint(vm.addr(keys[i]), 50_000e18);
            vm.stopBroadcast();
            vm.startBroadcast(keys[i]);
            gold.approve(address(p.router), type(uint256).max);
            gold.approve(address(p.liquidity), type(uint256).max);
            vm.stopBroadcast();
        }

        bool goldIs0 = address(gold) < address(usdc);
        // Pool price is currency1 per currency0 in raw units. $2 per AGLD (18 dec) in USDC (6 dec):
        // AGLD as currency0 → 2e-12 (tick ≈ −269,400); as currency1 → 5e11 (tick ≈ +269,400).
        int24 tick = goldIs0 ? int24(-269_400) : int24(269_400);
        Launchpad.Rules memory rules = _stack2(
            address(p.damper), abi.encode(uint32(500_000), uint24(40_000)), address(p.surge), abi.encode(uint32(300_000), uint24(20_000))
        );
        rules.baseFee = 3_000;

        vm.broadcast(keys[2]);
        uint256 id = p.launchpad.openMarket(
            Launchpad.OpenParams({
                subject: address(gold),
                quote: address(usdc),
                tickSpacing: 60,
                sqrtPriceX96: TickMath.getSqrtPriceAtTick(tick),
                rules: rules
            })
        );
        PoolKey memory key = p.launchpad.poolKeyOf(id);
        (uint256 goldMax, uint256 usdcMax) = (uint256(10_000e18), uint256(20_000e6));
        for (uint256 i = 4; i <= 5; i++) {
            vm.broadcast(keys[i]);
            p.liquidity.addLiquidity(key, goldIs0 ? goldMax : usdcMax, goldIs0 ? usdcMax : goldMax, block.timestamp + 1 hours);
        }
        _buy(6, id, 3_000);
        _buy(7, id, 1_000);
        _sell(8, id, 20);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function _none() internal pure returns (Launchpad.Rules memory r) {
        r.baseFee = 10_000;
    }

    function _stack2(address a, bytes memory ca, address b, bytes memory cb) internal pure returns (Launchpad.Rules memory r) {
        r.baseFee = 10_000;
        r.blocks = new address[](2);
        r.configs = new bytes[](2);
        (r.blocks[0], r.configs[0], r.blocks[1], r.configs[1]) = (a, ca, b, cb);
    }

    function _stack3(address a, bytes memory ca, address b, bytes memory cb, address c, bytes memory cc)
        internal
        pure
        returns (Launchpad.Rules memory r)
    {
        r.baseFee = 10_000;
        r.blocks = new address[](3);
        r.configs = new bytes[](3);
        (r.blocks[0], r.configs[0], r.blocks[1], r.configs[1], r.blocks[2], r.configs[2]) = (a, ca, b, cb, c, cc);
    }

    function _launch(uint256 creator, string memory name, string memory symbol, string memory description, Launchpad.Rules memory rules)
        internal
        returns (uint256 id)
    {
        vm.broadcast(keys[creator]);
        (id,) = p.launchpad.launch(
            Launchpad.LaunchParams({name: name, symbol: symbol, imageURI: "", description: description, website: "", rules: rules})
        );
    }

    function _buy(uint256 trader, uint256 id, uint256 usd) internal {
        PoolKey memory key = p.launchpad.poolKeyOf(id);
        (Launchpad.Market memory m,) = p.launchpad.getMarket(id);
        address to = vm.addr(keys[trader]);
        vm.broadcast(keys[trader]);
        p.router.swapExactIn(key, !m.subjectIsCurrency0, usd * 1e6, 0, 0, to, block.timestamp + 1 hours);
    }

    function _sell(uint256 trader, uint256 id, uint256 percent) internal {
        PoolKey memory key = p.launchpad.poolKeyOf(id);
        (Launchpad.Market memory m,) = p.launchpad.getMarket(id);
        address from = vm.addr(keys[trader]);
        uint256 amount = IERC20(m.subject).balanceOf(from) * percent / 100;
        vm.startBroadcast(keys[trader]);
        IERC20(m.subject).approve(address(p.router), amount);
        p.router.swapExactIn(key, m.subjectIsCurrency0, amount, 0, 0, from, block.timestamp + 1 hours);
        vm.stopBroadcast();
    }
}
