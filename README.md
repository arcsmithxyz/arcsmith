# Arcsmith: Uniswap v4 hooks from blocks, on Arc

Arcsmith lets anyone build a Uniswap v4 hook on [Arc](https://arc.io) without writing code. You stack small,
reviewed contracts called **blocks** (launch guard, dump damper, auto burn, surge fee, or community blocks), see
what every trade will pay, then launch a new token or open a market for a token that already exists.

Every pool runs on one shared hook, the **kernel**. On each trade it asks the pool's blocks what to do, then
enforces hard limits of its own. A pool's rules freeze the moment it opens: nobody can change them.

It also ships a **Hook Reader** for any Uniswap v4 hook on Arc, a free JSON **hook check API**, and a **block
catalog** where block authors earn a royalty from every launch that uses their block.

- Live: https://arcsmith.xyz
- Docs: https://arcsmith.xyz/docs
- Contracts on Arc mainnet: [`contracts/deployments/5042.json`](contracts/deployments/5042.json), all verified
  on [Arc Explorer](https://explorer.arc.io/address/0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4?tab=contract)
  as exact matches ([`contracts/verification/`](contracts/verification/))

> **Unaudited.** The contracts are tested (unit, fuzz, Arc mainnet fork and live smoke tests) but not audited.
> Pools are permanent. See [`contracts/SECURITY.md`](contracts/SECURITY.md). Arcsmith is an independent project,
> not affiliated with Arc or Circle.

## Layout

| Path | What |
|---|---|
| `contracts/` | Foundry project: `HookKernel`, `BlockCatalog`, native blocks, `Launchpad`, `LiquidityManager`, `LaunchRouter` |
| `contracts/verification/` | Standard JSON inputs that reproduce the deployed bytecode exactly |
| `web/` | Next.js 16 app, deployed on Cloudflare Workers with OpenNext |

## Contracts

```bash
git submodule update --init --recursive
cd contracts
forge test --no-match-path "test/fork/*"   # local suite
forge test --match-path "test/fork/*"      # Arc mainnet fork (needs network)
```

Two flags matter for any script that moves USDC or swaps on Arc:

- `--skip-simulation`: Arc's USDC runs through system precompiles Forge's EVM doesn't have. Scripts stub them
  for their local run (`script/ArcPrecompiles.sol`).
- `--gas-estimate-multiplier 300`: the kernel needs each block's full gas budget in hand before calling it and
  reverts with `InsufficientGasForBlocks` otherwise. Wallets use `eth_estimateGas` and are unaffected.

The deployed `HookKernel` predates a later fix to `_impactPpm` (see `contracts/verification/README.md`); the
verification inputs publish the code exactly as deployed.

## Web

```bash
cd web
pnpm install
pnpm dev:local       # Anvil + deploy + demo seed + next dev, all local
pnpm dev             # against the network in NEXT_PUBLIC_ARC_NETWORK (default testnet)
pnpm cf:deploy       # Cloudflare Workers (production = mainnet, see web/.env.production)
```

See `web/.env.example`. Arc mainnet pool and hook data comes from a community Uniswap v4 subgraph
(`web/lib/subgraph.ts`); browsers read it through cached server routes (`web/app/api/index`).

**RPC and ad blockers:** EasyPrivacy (Brave Shields, uBlock) blocks requests to arc.io, including Arc's official
RPCs. The app falls back to other public endpoints (`web/lib/rpc.ts`), then a same-origin read-only relay
(`web/app/api/rpc/[network]`). Wallet transactions are unaffected.

## Write a block

Blocks are small read-only contracts implementing `IRuleBlock` (`contracts/src/interfaces/IRuleBlock.sol`).
Anyone can submit one to the catalog; approved blocks earn a royalty from every launch that uses them.
Guide: https://arcsmith.xyz/docs/write-a-block

## License

[MIT](LICENSE)
