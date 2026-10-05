# Contracts

| Contract | Role |
|---|---|
| `src/HookKernel.sol` | The Uniswap v4 hook for every pool: runs each pool's frozen block stack with a gas budget, caps fees and burns, skips failing blocks, enforces the launch floor |
| `src/BlockCatalog.sol` | Block submissions, review, code-hash pinning, author royalties, on-chain metadata |
| `src/interfaces/IRuleBlock.sol` | The block interface and the swap/liquidity contexts the kernel passes in |
| `src/blocks/` | Native blocks: `GuardBlock`, `DamperBlock`, `BurnBlock`, `SurgeBlock` (on `BaseBlock`) |
| `src/Launchpad.sol` | Launch lane (token + locked pool) and open-market lane; fee collection and split incl. royalties |
| `src/LiquidityManager.sol` | Full-range LP positions per wallet |
| `src/LaunchRouter.sol` | Exact-input swaps with slippage and deadline, plus an eth_call quote |
| `src/LaunchToken.sol` | Fixed-supply ERC-20, no owner |

```bash
forge test --no-match-path "test/fork/*"   # local: both token orderings
forge test --match-path "test/fork/*"      # Arc mainnet fork
```

Writing a block: implement `IRuleBlock` (start from `BaseBlock`), keep it `view`, decode your
config in `validateConfig`, and describe the config in the catalog metadata JSON (see
`script/BlockMetadata.sol`) so the Builder can render its settings.

Deploying and the smoke test: see the root README. Security notes: [`SECURITY.md`](SECURITY.md).
