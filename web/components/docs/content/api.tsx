import { SITE_URL } from "@/lib/config";
import { A, C, Callout, CodeBlock, H2, P, Table, UL } from "../Prose";

const BASE = `${SITE_URL}/api/v1`;

export function HookCheckApi() {
  return (
    <>
      <P>
        The same answers the <A href="/hooks">hook reader</A> shows, as JSON for your own app, bot or wallet. It is free, needs
        no key and reads Arc mainnet. Any website may call it from the browser.
      </P>

      <H2 id="hook">One hook</H2>
      <CodeBlock label="GET /api/v1/hooks/{address}" code={`curl ${BASE}/hooks/0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4`} />
      <P>
        What the hook&apos;s address allows it to do. This needs no index, so it keeps answering when the index is down.
      </P>
      <CodeBlock
        label="Shortened answer"
        code={`{
  "address": "0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4",
  "chainId": 5042,
  "canBeHook": true,
  "reach": { "level": "changes_amounts", "label": "Can move your money" },
  "summary": "In short: this hook can take a cut of your trade, change the fee trade by trade, block trades and refuse new liquidity.",
  "abilities": [
    {
      "key": "cut",
      "question": "Can it take a cut of your trade?",
      "audience": "trade",
      "can": true,
      "severity": "bad",
      "answer": "It can keep part of what you receive, or charge you more than the pool's price. ..."
    }
  ],
  "permissions": [{ "key": "beforeSwap", "bit": 7, "label": "Before every swap", "enabled": true, "risk": "notice" }],
  "contract": { "hasCode": true, "codeSize": 11290 },
  "source": { "published": true, "name": "HookKernel", "exact": true },
  "arcsmithKernel": true,
  "links": { "reader": "...", "explorer": "...", "badge": "..." }
}`}
      />
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<C key="k">canBeHook</C>, "False when no permission flag is set. Uniswap v4 only accepts a hook that asks for at least one callback."],
          [<C key="r">reach.level</C>, <>The strongest thing it can do: <C>changes_amounts</C>, <C>can_refuse</C>, <C>informational</C> or <C>none</C>.</>],
          [
            <C key="a">abilities</C>,
            <>
              Seven yes/no questions. Keys: <C>cut</C>, <C>price</C>, <C>fee</C>, <C>blockTrade</C> (audience <C>trade</C>) and{" "}
              <C>lock</C>, <C>lpCut</C>, <C>blockDeposit</C> (audience <C>liquidity</C>). <C>severity</C> says how much a yes should
              worry someone and only matters when <C>can</C> is true.
            </>,
          ],
          [<C key="p">permissions</C>, "The 14 raw flags decoded from the lowest 14 bits of the address."],
          [<C key="c">contract</C>, <>Whether there is code at the address on Arc and how big. <C>null</C> if the RPC didn&apos;t answer.</>],
          [
            <C key="s">source</C>,
            <>
              Whether the source is published on Arc Explorer, and under what name. <C>null</C> means not known yet: the first
              lookup of a hook can take several seconds, so ask again.
            </>,
          ],
        ]}
      />

      <H2 id="token">One token</H2>
      <CodeBlock label="GET /api/v1/tokens/{address}" code={`curl ${BASE}/tokens/0xe8ac3CD26df2BB82D1752057438e51B482496D05`} />
      <P>
        Every Uniswap v4 pool the token trades in on Arc, with the hook each one runs. Each pool carries its liquidity, volume
        and swap count, whether it is <C>thin</C> (under $100 of liquidity), and for hooked pools the hook&apos;s{" "}
        <C>reach</C>, the keys of the abilities it has (<C>canDo</C>) and a link to its full answer. When a token is in more
        pools than fit in one answer, <C>capped</C> is true and the most liquid ones are listed. A <C>404</C> means the index doesn&apos;t know
        the address as a token.
      </P>

      <H2 id="identity">Real token or lookalike</H2>
      <P>
        Anyone can deploy a token called USDC. For the few tokens Arc&apos;s own documentation lists (USDC, EURC, USYC, cirBTC and WETH) the token
        answer carries an <C>identity</C>: <C>canonical</C> when the address is the documented one, <C>lookalike</C> when another token uses its
        symbol or name (then <C>realAddress</C> is the real one, <C>matchedBy</C> says <C>symbol</C> or <C>name</C>, and <C>tokensWithThisSymbol</C> counts the
        copies). For any other token the field is absent: we don&apos;t guess who made it. The list is hand-kept from{" "}
        <A href="https://docs.arc.io/arc/references/contract-addresses">docs.arc.io</A>; a name proves nothing, the address does.
      </P>

      <H2 id="rankings">Rankings without wash trading</H2>
      <CodeBlock label="GET /api/v1/rankings" code={`curl ${BASE}/rankings`} />
      <P>
        The busiest hooks on Arc by volume, with the hooks that have big volume but almost no liquidity left out. The{" "}
        <C>method</C> field states the rule and how many hooks it left out. Cached for five minutes.
      </P>

      <H2 id="cost">What a trade really costs</H2>
      <CodeBlock label="GET /api/v1/pools/{poolId}/cost" code={`curl ${BASE}/pools/0x704947b2d54f1522e294c781240863a3e59ab68d709bec3f3ae167aeba821eac/cost`} />
      <P>
        A buy and a sell of about 5 USDC (or EURC) are run through Uniswap&apos;s Quoter against the live pool and compared with its current price.
        The Quoter runs the hook, so a tax, a dynamic fee or a refusal shows up in the number. <C>cost</C> is the share of the trade&apos;s value
        lost (<C>0.031</C> is 3.1%), <C>poolFee</C> is the pool&apos;s own fee, and a trade the pool would refuse comes back as{" "}
        <C>{"{ ok: false, reason }"}</C>. Pools with neither USDC nor EURC answer <C>422</C>.
      </P>
      <P>
        It is a simulation for one anonymous sender. A hook can treat other senders differently, so a real trade can differ, and
        the probe is small, so a very thin pool can cost more for a bigger trade. The same numbers appear in the &quot;Cost of a $5 trade&quot;
        column on a token&apos;s hook reader page.
      </P>

      <H2 id="scanners">For token scanners</H2>
      <CodeBlock label="GET /api/v1/tokens/{address}?cost=true" code={`curl "${BASE}/tokens/0xe8ac3CD26df2BB82D1752057438e51B482496D05?cost=true"`} />
      <P>
        A test written for plain pools can mistake a Uniswap v4 hook for a trap: a hook may charge on every trade, so the output is lower
        than the price, or it may use its own accounting that a generic simulation doesn&apos;t understand. Both are normal for
        v4. What matters is what the pool does when you trade through it. With <C>cost=true</C> each hooked pool gets a <C>cost</C> from a
        real simulation through the pool and its hook: whether a small buy and a small sell go through (<C>ok</C>), and what share of
        their value they lose. A sell that comes back <C>ok: false</C> is a refusal worth flagging. A sell that works at 3% is a tax, not a trap.
      </P>
      <UL>
        <li>Use <C>reach</C> and <C>canDo</C> for what the hook is allowed to do, and <C>cost</C> for what it does to a small trade right now.</li>
        <li>Costs are for the largest eight hooked pools and cached for a minute. Pools without USDC or EURC have no <C>cost</C>.</li>
        <li>The simulation uses one anonymous sender. A hook that treats senders differently can still behave differently for a real trade, so treat a clean result as evidence, not proof.</li>
      </UL>

      <H2 id="badge">A badge for your page</H2>
      <CodeBlock
        label="GET /api/v1/hooks/{address}/badge.svg"
        code={`[![Arcsmith hook check](${BASE}/hooks/0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4/badge.svg)](${SITE_URL}/hooks/0x099ea6E7c769c8ecBE7E3c601B48dD1d5C2fA8c4)`}
      />
      <P>
        A small image for a README, a listing or a wallet screen: it says what the hook&apos;s address allows, in the same words as
        the answer&apos;s <C>reach.label</C>. It is built from the address alone, so it never waits on the index, and
        it isn&apos;t rate limited. Link it to the hook&apos;s reader page so anyone who clicks sees what the label means.
        The hook reader&apos;s <strong>Copy badge</strong> button gives you this Markdown.
      </P>
      <Table
        head={["Label", "Colour", "Means"]}
        rows={[
          ["Can move your money", "Orange", "It can change what you pay or receive."],
          ["Can refuse trades", "Sand", "It can stop a trade or a deposit, but can't change the amounts."],
          ["Informational only", "Grey", "It is told about trades and deposits but can't change or stop them."],
          ["No callbacks", "Grey", "No permission flag is set."],
        ]}
      />
      <P>
        There is no green badge and no &quot;safe&quot; wording, on purpose: the badge reads the address, not the code, so it can&apos;t
        vouch for a hook. Please don&apos;t present it as an audit or a safety rating.
      </P>
      <P>
        <strong>Share cards.</strong> A link to a <A href="/hooks">hook reader</A> page, for a hook or a token, shows a preview card
        when it is posted on X, Telegram or Discord: for a hook, its name and what it can do; for a token, its pools and the hooks
        they run. The reader pages have a <strong>Share on X</strong> button.
      </P>

      <H2 id="mcp">From your AI assistant (MCP)</H2>
      <P>
        The same checks are a remote MCP server, so assistants like Claude and Cursor can call them while they answer you: ask
        &quot;what can the hook on this pool do?&quot; and it reads the answer from Arcsmith. No key, no install, read-only.
      </P>
      <CodeBlock label="MCP server URL (Streamable HTTP)" code={`${SITE_URL}/mcp`} />
      <P>
        Full setup and examples: <A href="/docs/mcp">AI assistants (MCP)</A>.
      </P>
      <UL>
        <li>
          <strong>Claude:</strong> Settings → Connectors → Add custom connector, and paste the URL. In Claude Code:{" "}
          <C>claude mcp add --transport http arcsmith {SITE_URL}/mcp</C>
        </li>
        <li>
          <strong>Cursor:</strong> add it to <C>.cursor/mcp.json</C> under <C>mcpServers</C> as <C>{`{ "arcsmith": { "url": "${SITE_URL}/mcp" } }`}</C>
        </li>
      </UL>
      <Table
        head={["Tool", "What it answers"]}
        rows={[
          [<C key="h">check_hook</C>, "What a hook can do with a trade, its 14 flags, and whether its source is published"],
          [<C key="t">check_token</C>, "A token's pools on Arc, each pool's hook, lookalike warnings; cost=true adds a small simulated buy and sell"],
          [<C key="c">trade_cost</C>, "What a ~$5 buy and sell cost in one pool, hook included"],
          [<C key="r">top_hooks</C>, "The busiest hooks on Arc, without wash-traded ones"],
        ]}
      />

      <H2 id="errors">Errors and limits</H2>
      <P>
        Every error has one shape, <C>{`{ "error": { "code": "...", "message": "..." } }`}</C>.
      </P>
      <Table
        head={["Status", "Code", "When"]}
        rows={[
          ["400", <C key="1">invalid_address</C>, "The address isn't 42 characters starting with 0x."],
          ["404", <C key="2">token_not_found</C>, "The index doesn't know the address as a token."],
          ["429", <C key="3">rate_limited</C>, "More than 60 requests a minute from one address. Wait a minute."],
          ["502", <C key="4">index_unavailable</C>, "The Arc index didn't answer. Hook answers don't depend on it."],
        ]}
      />
      <UL>
        <li>Answers can be reused for a short time (the hook answer for five minutes, a token for 30 seconds). Cache on your side too.</li>
        <li>Pools, volume and liquidity come from a community index of Uniswap v4 on Arc. Volume is priced from pool ratios and can be inflated for thinly traded tokens.</li>
      </UL>

      <Callout tone="warn" title="Capabilities, not verdicts">
        The API says what a hook&apos;s address allows it to do, never whether it is safe. A hook that can refuse withdrawals may
        never do it, and a harmless-looking one could still charge a lot. A contract&apos;s name is chosen by whoever deployed
        it: it says what the code is called, not who runs it. Show <C>about</C> next to the answer if you display it.
      </Callout>
    </>
  );
}
