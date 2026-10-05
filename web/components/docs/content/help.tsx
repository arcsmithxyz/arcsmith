import { FAQ } from "@/lib/faq";
import { A, Callout, H2, P, UL } from "../Prose";

const MORE_FAQ = [
  {
    question: "What does it cost to launch?",
    answer: "Only gas, a few cents of USDC on Arc. You don't need to provide liquidity: the whole supply goes into the pool.",
  },
  {
    question: "Why do sells pay fees in my token?",
    answer: "Uniswap charges the fee in whatever the trader pays with. Buyers pay USDC, sellers pay your token, so creators earn both.",
  },
  {
    question: "Why doesn't the app load in Brave?",
    answer:
      "Ad blockers block arc.io, including Arc's official network address. Arcsmith falls back to other public Arc endpoints automatically; if data still doesn't load, turn Shields off for this site.",
  },
  {
    question: "Can I trade Arcsmith pools elsewhere?",
    answer: "They're standard Uniswap v4 pools, so routers that support v4 hooks can trade them. Aggregators may need the kernel on their allowed list first.",
  },
];

export function FaqDoc() {
  return (
    <>
      {[...FAQ, ...MORE_FAQ].map((item, i) => (
        <section key={item.question}>
          <H2 id={`q${i + 1}`}>{item.question}</H2>
          <P>{item.answer}</P>
        </section>
      ))}
    </>
  );
}

export function Risks() {
  return (
    <>
      <Callout tone="warn" title="Read this before putting money in">
        Arcsmith is new, unaudited software on a new chain. Everything below can cost you money.
      </Callout>

      <H2 id="smart-contracts">Smart contract risk</H2>
      <P>
        The contracts are tested but not audited. Pools, their rules and launch liquidity are permanent by design, so a bug
        in a live pool can&apos;t be fixed.
      </P>

      <H2 id="tokens">Token risk</H2>
      <UL>
        <li>Anyone can launch a token. A launch being on Arcsmith says nothing about whether the token has value.</li>
        <li>Anyone can open a market for any token address. Always check you have the right token.</li>
        <li>Most new tokens lose most of their value.</li>
      </UL>

      <H2 id="rules">Rule risk</H2>
      <UL>
        <li>Blocks can raise fees up to 50% during a pool&apos;s first 15 minutes and 10% after, and can refuse trades. Read a pool&apos;s rules before trading.</li>
        <li>The dump damper slows fast exits but can be outrun by selling slowly across many wallets.</li>
        <li>Some token scanners label any sell-side fee as a &quot;sell tax&quot;.</li>
      </UL>

      <H2 id="liquidity">Liquidity risk</H2>
      <UL>
        <li>New existing-token markets start empty; their price can be moved for free until someone deposits.</li>
        <li>Full-range liquidity is exposed to price moves (impermanent loss), like any Uniswap position.</li>
        <li>Large sells on a launch can fail at the launch floor instead of partly filling.</li>
      </UL>

      <H2 id="external">External risk</H2>
      <UL>
        <li>USDC is issued by Circle and can be frozen for specific addresses.</li>
        <li>Stats on this site come from a community index of Arc and can be delayed or wrong; reported volume can be inflated by wash trading.</li>
        <li>Arcsmith is an independent project, not affiliated with Arc or Circle.</li>
      </UL>
      <P>
        Questions about how something works? Start with <A href="/docs/how-it-works">How it works</A> and{" "}
        <A href="/docs/safety">Safety guarantees</A>.
      </P>
    </>
  );
}
