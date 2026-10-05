# Security notes

A plain record of what has and hasn't been checked. **These contracts are unaudited.**
Pools are immutable and launch liquidity is locked by construction, so a bug in a live pool
cannot be patched — only avoided in future deployments.

## What was done

- **87 local tests.**
  - *Launch lane* (28 behaviours, each run twice — token as `currency0` and as `currency1`,
    because the two cases mirror every price and range calculation): locked supply and
    starting FDV, metadata and stack recording, guard fee decay / charge / buy cap /
    liquidity block, damper small-vs-big sells, escalation to the cap, decay, relief by buys,
    auto-burn (exact-input only), surge by trade size, launch floor, fee split between creator,
    block authors and treasury, royalties following the current author, frozen protocol
    share, locked liquidity never removable, creator transfer, router quotes, slippage and
    deadlines.
  - *Kernel* (15): access control on every entry point, one-shot binding, pools only through
    the Launchpad, unreviewed / retired / misconfigured / duplicate / too many blocks
    rejected at registration, base-fee bounds, **caps hold against a greedy block**,
    **fail-open** for reverting, gas-burning and malformed blocks, rejections enforced, and
    **gas starvation never turns a rejection into a skip**.
  - *Catalog* (7): submission, review permissions, royalty bound, resubmission after
    rejection, retirement affects only new pools, author hand-over, pagination.
  - *Open market + LiquidityManager* (9): empty hooked pool, launch guard refused, bad
    params, one market per pair and spacing, pause, LPs earn fees and exit, blocks run on
    third-party liquidity, LP slippage and deadline.
- **Fuzz tests** (512 runs each): a buy-then-sell round trip never returns more USDC than it
  cost; no sequence of sells and waits pushes the sell fee outside its bounds.
- **Arc mainnet fork tests** (2): the kernel deployed exactly as the deploy script does it
  (mined salt through the canonical CREATE2 factory) and a full lifecycle against Arc's real
  Uniswap v4 PoolManager and real USDC (its two system precompiles stubbed; see
  `test/fork/ArcTestBase.sol`).
- The test suite found and fixed one kernel bug: price impact was measured against zero
  liquidity when a fresh launch rests exactly on its position's edge (token sorted as
  `currency1`), making every trade look maximal. It now reads the liquidity starting at that
  tick.
- `forge lint` findings triaged below.

## What was not done

- No third-party audit. Launchpads and hook platforms are a well-known target category.
- No formal verification, no long-running invariant campaign.
- No economic review of block parameters beyond the tests; defaults are judgement.
- Testnet phase: pending a funded deployer.

## Trust model

| Actor | Can | Cannot |
|---|---|---|
| Catalog owner | Approve (with royalty ≤ 20% of the protocol share), reject, retire blocks | Change a live pool's stack or settings; approve a block whose code changed since submission |
| Launchpad owner | Pause *new* pools; set treasury; set protocol share (≤ 50%) for *future* launches | Touch any existing pool, its rules, its liquidity, or fees already accrued |
| Binder (deployer) | Bind the Launchpad to the kernel, once | Anything after that |
| Block author | Submit blocks; hand authorship (and future royalties) to another address | Change an approved block's code or any pool's settings |
| Creator | Claim their fee share; hand creator rights to another address | Change their pool's rules or pull launch liquidity |
| Anyone | Launch; open a market for any token; trade; add/remove full-range liquidity; call `collectFees` | Initialize a pool with the kernel outside the Launchpad |

Kernel callbacks accept calls from the PoolManager only. Pool initialization with the
kernel is rejected unless the Launchpad is the caller *and* registered that exact key first.

### What a block can and can't do

- Blocks are called with `STATICCALL`: no state writes, no transfers, no reentrancy. Their
  per-pool state is a `bytes32` the kernel stores on their behalf.
- Each call gets 100k gas. The kernel checks it holds that budget (plus the 1/64 reserve)
  before calling; otherwise the whole swap reverts with `InsufficientGasForBlocks`. This
  stops a caller from starving a block so it fails and gets skipped.
- A block that reverts, runs out of gas or returns malformed data is **skipped** (event
  `BlockSkipped`) — it can't freeze a pool.
- Whatever blocks ask: fee ≤ 50% during a pool's first 15 minutes, ≤ 10% after; burn ≤ 5%.
- A block *can* refuse trades (`reject`) and refuse liquidity adds. A reviewed block that
  refuses everything would freeze trading in pools that chose it — review is the defence;
  the kernel never lets a block refuse liquidity **removal**.

## `forge lint` triage

| Finding | Where | Verdict |
|---|---|---|
| `unsafe-typecast` | fee/pressure/impact casts in kernel and blocks, delta casts in router/launchpad/LM | Reviewed; each is bounded by a preceding check or by construction (fees ≤ caps ≤ 1e6, pressure ≤ `MAX_PRESSURE`, deltas sign-checked before casting, burn ≤ bought ≤ int128). |
| `arbitrary-send-erc20` | `LaunchRouter` and `LiquidityManager` unlock callbacks | False positive. The `from` is `msg.sender` of the public entry point, encoded by the contract itself; callbacks only accept the PoolManager, which only calls back the contract that called `unlock`. |
| `reentrancy-no-eth` / `reentrancy-events` | Launchpad launch/open/collect/claim, LM, kernel burn event | Every Launchpad and LM entry point with external calls is `nonReentrant`; external calls go to the PoolManager, our own token, the catalog, or ERC-20s the user chose. Event order carries no risk. |
| `calls-loop` / `require-revert-in-loop` | Kernel registration checks and block calls; Launchpad royalty reads | Intended. Loops are bounded by `MAX_BLOCKS` (5); block calls are static and gas-capped; a failed check must reject the whole registration or trade. |
| `boolean-cst` | Blocks returning `reject = false` | Intended; that's the "don't refuse" answer. |
| `uninitialized-local` | Accumulators (`burnBps`, `royalties`) | Intended; they start at zero. |
| `divide-before-multiply` | `Launchpad._split`: protocol share, then royalty of it | Intended: royalties are a share *of the protocol share*. Rounding favours the treasury by at most a few wei; royalties (≤ 5 × 20%) can never exceed the protocol amount. |
| `block-timestamp` | guard window, pressure decay, opening window, deadlines | Intended. Arc's validators are a permissioned BFT set; a few seconds of skew barely moves a decaying fee. |
| `unused-return` | `initialize`, `modifyLiquidity`, `unlock`, `swap` second return values | Intended; the unused values (tick, fees-accrued split) aren't needed. |

## Known limitations

- **Gas headroom.** Swaps through the kernel need more gas *limit* than they *use* (see the
  gas budget above). Wallets using `eth_estimateGas` are fine; tools that set limit = used ×
  1.3 (Forge scripts by default) fail with `InsufficientGasForBlocks`. Scripts that swap
  pass `--gas-estimate-multiplier 300`. Verified live: the Arc testnet smoke test (launch,
  guarded buy, sell, fee claim, open market, add/remove liquidity) passed 11/11.
- **Open markets start empty.** Until someone adds liquidity, anyone can move the price for
  free, and the first LP deposits at whatever it is. The web app warns before that deposit.
  Anyone can open a market for any token (one per pair and tick spacing).
- **The damper can be outrun by patience.** Pressure decays at ~100% of pool depth per hour,
  so a dump split across wallets *and* hours pays close to the base fee.
- **Scanners may call it a sell tax.** Sell-side fees are LP fees, capped and visible
  on-chain (`HookKernel.previewFees`); some honeypot scanners flag any sell-side fee.
- **The guard cap is per swap, not per wallet.** The decaying launch fee is what makes early
  buying expensive either way.
- **Sells can't cross the launch floor.** A sell larger than the USDC in a launch pool
  reverts (`BelowLaunchFloor`) instead of partially filling.
- **Auto-burn applies to exact-input buys only.** On exact-output buys the delta would land
  on the input side, so it is skipped by design.
- **Royalties follow the current author.** Authorship can be handed over; royalties accrue
  to whoever is the author when a launch's fees are collected.
- **Arc USDC is blocklistable by Circle.** Balances are pull-based, so one blocklisted
  account can't block anyone else's claim.
