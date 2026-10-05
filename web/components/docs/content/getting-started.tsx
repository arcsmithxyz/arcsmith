import { A, C, Callout, CardLinks, H2, P, Steps, Table, UL } from "../Prose";

export function Introduction() {
  return (
    <>
      <P>
        Arcsmith lets anyone build a Uniswap v4 hook on Arc without writing code. You stack small, reviewed contracts
        called <strong>blocks</strong> (a launch guard, a dump damper, an auto burn, a surge fee, or community blocks),
        see exactly what every trade will pay, then launch a new token or open a market for a token that already exists.
      </P>
      <P>
        Every pool runs on one shared hook, the <strong>kernel</strong>. On each trade it asks that pool&apos;s blocks what
        to do, then enforces hard limits of its own. A pool&apos;s rules freeze the moment it opens: nobody can change them,
        including the platform.
      </P>

      <H2 id="who-its-for">Who it&apos;s for</H2>
      <Table
        head={["You are", "What you do here"]}
        rows={[
          ["A token creator", "Launch in one transaction with rules against snipers and dumps, and earn most of the trading fees."],
          ["A community around an existing token", "Open a hooked market for it with your own rules; liquidity providers earn its fees."],
          ["A liquidity provider", "Add full-range liquidity to any Arcsmith pool and earn a share of every trade."],
          ["A developer", "Write a block, submit it to the catalog, and earn a royalty from every launch that uses it."],
          ["A trader", "Read any v4 hook on Arc before trading, and see each pool's frozen rules in plain words."],
        ]}
      />

      <H2 id="start-here">Start here</H2>
      <CardLinks
        items={[
          { href: "/docs/quick-start", title: "Quick start", body: "Launch a token with your own rules in about two minutes." },
          { href: "/docs/how-it-works", title: "How it works", body: "The kernel, the blocks, and why rules can't change." },
          { href: "/docs/blocks", title: "Native blocks", body: "What each block does and every setting it takes." },
          { href: "/docs/write-a-block", title: "Write a block", body: "Build your own rule and earn royalties." },
        ]}
      />

      <Callout tone="warn" title="Unaudited software">
        The contracts are tested, including against a copy of Arc mainnet and live smoke tests, but they have not been
        audited. Pools are permanent. Use only what you can afford to lose. Arcsmith is an independent project, not
        affiliated with Arc or Circle.
      </Callout>
    </>
  );
}

export function QuickStart() {
  return (
    <>
      <P>
        This walks through a launch: a new token, its whole supply locked in a Uniswap v4 pool against USDC, with rules
        that make sniping and dumping expensive.
      </P>

      <H2 id="before-you-start">Before you start</H2>
      <UL>
        <li>
          A wallet such as Rabby or MetaMask. The app adds the Arc network for you when you connect.
        </li>
        <li>
          A little USDC on Arc. USDC is Arc&apos;s gas token; a launch costs a few cents. You don&apos;t need to provide any
          liquidity: the whole supply goes into the pool.
        </li>
      </UL>

      <H2 id="launch">Launch in eight steps</H2>
      <Steps
        items={[
          { title: "Open the builder", body: <>Go to <A href="/build">Build</A> and choose <strong>Launch a new token</strong>.</> },
          { title: "Set the base fee", body: "Every trade pays at least this. 1% is a common choice; the range is 0.01% to 3%." },
          {
            title: "Add blocks",
            body: (
              <>
                A good default is <strong>Launch guard</strong> plus <strong>Dump damper</strong>. Each block opens a
                small form with its settings and allowed range.
              </>
            ),
          },
          { title: "Check the fee curve", body: "The chart shows what buys and sells of different sizes will pay, computed by the real block contracts." },
          { title: "Name your token", body: "Name (up to 32 characters), ticker (up to 12), and optionally an image, website and description." },
          { title: "Launch", body: "Confirm one transaction in your wallet. It creates the token, opens the pool and locks the supply." },
          { title: "Share the pool page", body: "You're taken straight to it: live fees, the frozen rules, trading and liquidity." },
          { title: "Collect your fees", body: <>As people trade, claim your share from the pool page or your <A href="/portfolio">Portfolio</A>.</> },
        ]}
      />

      <Callout title="What the default stack does">
        For the first three minutes, buys pay an extra fee that starts at 29% and falls to zero, and each buy is capped at
        1% of the supply. After that, sells pay more when many people sell at once, up to 7% extra, fading within about
        an hour.
      </Callout>
    </>
  );
}

export function HowItWorks() {
  return (
    <>
      <H2 id="the-kernel">The kernel</H2>
      <P>
        Uniswap v4 lets a pool name a <strong>hook</strong>: a contract the pool manager calls around every trade. Every
        Arcsmith pool names the same hook, the kernel. The kernel keeps, for each pool, a frozen list of up to five blocks
        with their settings, and asks them what to do on every trade.
      </P>

      <H2 id="blocks">Blocks</H2>
      <P>
        A block is a small contract that answers a question: <em>what should this trade cost?</em> It can add to the fee
        before a swap, burn a share of a buy after it, refuse a trade, or refuse a liquidity deposit. Blocks are pure
        calculators:
      </P>
      <UL>
        <li>
          The kernel calls them read-only (<C>STATICCALL</C>), so they can&apos;t move funds, change anything or call the
          pool.
        </li>
        <li>Each call gets a fixed budget of 100,000 gas. A block that fails or runs out is skipped for that trade.</li>
        <li>
          A block&apos;s memory for a pool (for example, recent sell pressure) is one value the kernel stores and hands back
          on the next trade.
        </li>
      </UL>

      <H2 id="one-trade">What happens on one trade</H2>
      <Steps
        items={[
          { title: "The pool calls the kernel", body: "Before the swap, with its size and direction." },
          { title: "The kernel asks each block", body: "Blocks return a fee addition, a rejection, or nothing." },
          { title: "The kernel applies its limits", body: "Fee = base fee + additions, capped at 50% during a pool's first 15 minutes and 10% after." },
          { title: "The swap runs", body: "At that fee, which goes to the pool's liquidity." },
          { title: "After the swap", body: "Blocks may ask to burn part of a buy (capped at 5%) or reject the trade now that its size is known." },
        ]}
      />

      <H2 id="frozen-rules">Frozen rules</H2>
      <P>
        A pool&apos;s blocks and settings are written once, when the pool opens, and there is no function to change them.
        Retiring a block from the catalog only stops new pools from choosing it; pools already using it keep it.
      </P>

      <H2 id="two-lanes">Two lanes</H2>
      <Table
        head={["", "Launch a new token", "Rules for an existing token"]}
        rows={[
          ["Token", "Created for you: 1,000,000,000 supply, no owner, no minting", "Any ERC-20 on Arc"],
          ["Quote currency", "USDC", "USDC or any token you choose"],
          ["Liquidity", "Whole supply, locked forever", "Starts empty; anyone adds full-range liquidity"],
          ["Who earns fees", "Creator 90%, protocol 10% (block royalties come from that 10%)", "Liquidity providers"],
          ["Launch guard", "Available", "Not available"],
        ]}
      />
    </>
  );
}
