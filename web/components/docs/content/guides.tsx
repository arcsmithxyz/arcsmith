import { A, C, Callout, H2, P, Table, UL } from "../Prose";

export function LaunchToken() {
  return (
    <>
      <H2 id="what-a-launch-does">What a launch does</H2>
      <P>One transaction, in this order:</P>
      <UL>
        <li>
          Creates your token: 1,000,000,000 supply, 18 decimals, a plain ERC-20 with no owner, no minting and no transfer
          tax.
        </li>
        <li>Opens a Uniswap v4 pool against USDC with the kernel as its hook and your rules registered.</li>
        <li>
          Puts the <strong>whole supply</strong> into the pool as single-sided liquidity starting at a fully diluted value of
          about $5,000. Buying half the supply costs roughly $5,000; buying 90% costs roughly $45,000.
        </li>
        <li>Locks that liquidity. The launchpad has no function to remove it.</li>
      </UL>
      <P>
        Launches also get a <strong>launch floor</strong>: the price can never trade below where it started. A sell bigger
        than the USDC in the pool fails instead of partly filling.
      </P>

      <H2 id="details">Name, ticker, image and links</H2>
      <Table
        head={["Field", "Limit"]}
        rows={[
          ["Name", "1 to 32 characters"],
          ["Ticker", "1 to 12 characters"],
          ["Image", "PNG, JPG, WebP or GIF under 10 MB, optional; cropped to a square"],
          ["Website link", "Up to 256 characters, optional"],
          ["Description", "Up to 500 characters, optional"],
        ]}
      />

      <H2 id="suggested-stacks">Suggested stacks</H2>
      <Table
        head={["Stack", "Blocks", "Good for"]}
        rows={[
          ["Fair launch", "Launch guard (29%, 3 minutes, 1% per buy) + Dump damper (strength 500,000, up to 7%)", "Most launches"],
          ["Deflationary", "Launch guard + Auto burn (1% of each buy)", "Tokens where shrinking supply is the story"],
          ["Whale friendly LPs", "Surge fee (up to 2%) + Dump damper", "Tokens you expect to trade in size"],
          ["Plain", "No blocks, base fee only", "Simple pools"],
        ]}
      />

      <H2 id="earning">How creators earn</H2>
      <P>
        The locked position earns the trading fee on every swap. When fees are collected, the creator receives their share
        (90% of launch fees at the current setting, fixed for your launch at launch time). Buys pay fees in USDC and sells
        pay in your token, so you receive both. Collect and claim from the pool page or your <A href="/portfolio">Portfolio</A>;
        anyone can trigger collection, and claims are pull-based. You can hand creator rights to another wallet with{" "}
        <C>transferCreator</C>.
      </P>

      <Callout title="Tip">Share the pool page, not just the token address. It shows the frozen rules and live fees, which is what makes a launch trustworthy.</Callout>
    </>
  );
}

export function ExistingTokens() {
  return (
    <>
      <P>
        You can put Arcsmith rules on a token that already exists: a community token, a bridged token, or your own. The
        result is a new Uniswap v4 pool with the kernel as its hook, alongside any pools the token already has.
      </P>

      <H2 id="open-a-market">Open a market</H2>
      <UL>
        <li>
          In <A href="/build">Build</A>, choose <strong>Rules for an existing token</strong> and paste its address.
        </li>
        <li>Pick the quote token (USDC by default) and a tick spacing: 10 for steady pairs, 60 standard, 200 for volatile tokens.</li>
        <li>Set the starting price, ideally the token&apos;s current market price.</li>
        <li>Compose blocks as usual. The launch guard is only for new tokens.</li>
      </UL>
      <P>
        There can be one Arcsmith market per token pair and tick spacing. Anyone can open a market for any token, so always
        double-check the token address.
      </P>

      <H2 id="add-liquidity">Add liquidity</H2>
      <P>
        A new market starts empty. Add full-range liquidity from its pool page: you deposit both tokens at the current
        price and earn a share of every trade&apos;s fee.
      </P>
      <Callout tone="warn" title="Check the price before the first deposit">
        While a pool has no liquidity, anyone can move its price for free. The first deposit is made at whatever the price
        is, so compare it with the token&apos;s real price first. The pool page warns you when this applies.
      </Callout>

      <H2 id="fees">Who earns</H2>
      <P>
        In existing-token markets, trading fees go entirely to liquidity providers. There is no protocol share and no
        creator share.
      </P>
    </>
  );
}

export function TradingAndLiquidity() {
  return (
    <>
      <H2 id="fees-you-pay">The fee you pay</H2>
      <P>
        Every pool page shows the fee a small buy and a small sell pay right now, read live from the kernel. The fee is the
        pool&apos;s base fee plus whatever its blocks add, and it can rise with trade size (for example with a surge fee or
        dump damper). The kernel caps it at 50% during a pool&apos;s first 15 minutes and 10% after.
      </P>

      <H2 id="placing-a-trade">Placing a trade</H2>
      <UL>
        <li>The trade panel quotes what you&apos;ll receive and a minimum after your slippage setting (0.5%, 1% or 3%).</li>
        <li>Approvals are for the exact trade amount; the router never gets a standing allowance.</li>
        <li>Trades expire after five minutes if not mined.</li>
      </UL>

      <H2 id="why-a-trade-can-fail">Why a trade can be refused</H2>
      <Table
        head={["Message", "Why"]}
        rows={[
          ["One of this pool's rules refused the trade", "A block refused it, for example a buy above the launch guard's per-trade cap."],
          ["The pool doesn't hold enough USDC", "A sell on a launch would push the price below its launch floor. Try a smaller amount."],
          ["The price moved past your slippage limit", "The price changed while your transaction was pending."],
          ["Not enough gas for this pool's rules", "Your wallet set too little gas. Let it estimate gas."],
        ]}
      />

      <H2 id="liquidity">Providing liquidity</H2>
      <UL>
        <li>Positions are full range and belong to your wallet. Add, withdraw a share, or collect fees at any time.</li>
        <li>You deposit an amount of the quote token; the matching amount of the other token is worked out at today&apos;s price.</li>
        <li>
          During a launch&apos;s guard window, outside liquidity is refused. No block can ever refuse a withdrawal: the kernel
          doesn&apos;t let blocks see removals at all.
        </li>
      </UL>
    </>
  );
}

export function HookReaderDoc() {
  return (
    <>
      <P>
        The <A href="/hooks">hook reader</A> explains any Uniswap v4 hook on Arc mainnet from its address alone. Use it before
        trading in a pool you don&apos;t know.
      </P>

      <H2 id="permissions">Permissions</H2>
      <P>
        A v4 hook&apos;s permissions are written into its address: 14 flags that say where it can step in. The reader decodes
        them and groups them by risk:
      </P>
      <Table
        head={["Level", "Meaning"]}
        rows={[
          ["Informational", "Runs at a point but can't change your outcome (for example after a pool is created)."],
          ["Can refuse", "Can block trades or liquidity changes, and on dynamic-fee pools set the fee per trade."],
          ["Moves money", "Can change the amounts people actually pay or receive. Look closely at these hooks."],
        ]}
      />
      <Callout tone="warn" title="Flags aren't behaviour">
        Permissions say where a hook can act, not what it does there. A hook that can refuse withdrawals may never do it,
        and a harmless-looking one could still charge a lot. Read the verified source before trusting a hook with funds.
      </Callout>

      <H2 id="usage">Usage</H2>
      <P>
        Pools, swaps, volume and liquidity come from a community index of Uniswap v4 on Arc. Volume is priced from pool
        ratios and can be inflated for thinly traded tokens; liquidity and swap counts are more reliable. The{" "}
        <A href="/discover">Popular on Arc</A> tab flags pools with large volume but no liquidity left.
      </P>

      <H2 id="in-your-app">In your own app</H2>
      <P>
        Building a wallet, bot or explorer? The same answers are available as JSON, free and without a key. See the{" "}
        <A href="/docs/api">hook check API</A>.
      </P>
    </>
  );
}
