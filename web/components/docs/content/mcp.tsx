import { SITE_URL } from "@/lib/config";
import { A, C, Callout, CodeBlock, H2, P, Steps, Table, UL } from "../Prose";

const CURSOR = `{
  "mcpServers": {
    "arcsmith": { "url": "${SITE_URL}/mcp" }
  }
}`;

const EXAMPLE = `You: What can the hook on this token's pool do?
    0xe8ac3CD26df2BB82D1752057438e51B482496D05

Assistant (calls check_token): It trades in one hooked pool, USDC/SMITH.
Its hook can take a cut of your trade and set the price itself, and a
simulated $5 buy and sell each cost about 3%...`;

export function McpDoc() {
  return (
    <>
      <P>
        Arcsmith is also a remote MCP server (Model Context Protocol). Add it to Claude, Cursor or any assistant that supports MCP,
        and it can check Uniswap v4 hooks and tokens on Arc while it answers you, with the same answers as the{" "}
        <A href="/docs/api">hook check API</A>. No key, no install, read-only: it never touches a wallet.
      </P>
      <CodeBlock label="Server URL (Streamable HTTP)" code={`${SITE_URL}/mcp`} />

      <H2 id="setup">Set it up</H2>
      <Steps
        items={[
          { title: "Claude (web and desktop)", body: <>Settings → Connectors → Add custom connector, name it Arcsmith, and paste the URL above.</> },
          { title: "Claude Code", body: <C>claude mcp add --transport http arcsmith {SITE_URL}/mcp</C> },
          { title: "Cursor", body: <>Add the server to <C>.cursor/mcp.json</C> (example below), then enable it in Cursor&apos;s MCP settings.</> },
          { title: "Anything else", body: "Any MCP client that speaks Streamable HTTP: point it at the URL. There's no session and no sign-in." },
        ]}
      />
      <CodeBlock label=".cursor/mcp.json" code={CURSOR} />

      <H2 id="tools">Tools</H2>
      <Table
        head={["Tool", "What it answers"]}
        rows={[
          [<C key="h">check_hook</C>, "What a hook's address lets it do with a trade, its 14 permission flags, and whether its source is published"],
          [<C key="t">check_token</C>, "A token's pools on Arc, each pool's hook, lookalike warnings; cost=true adds a small simulated buy and sell"],
          [<C key="c">trade_cost</C>, "What a ~$5 buy and sell cost in one pool, hook included"],
          [<C key="p">pre_trade_check</C>, "Your rules, our data: proceed, stop or unknown for a token, given a cost limit and whether to refuse lookalikes. Unknown is never a go"],
          [<C key="r">top_hooks</C>, "The busiest hooks on Arc, without wash-traded ones"],
        ]}
      />

      <H2 id="example">What it looks like</H2>
      <CodeBlock label="In a chat" code={EXAMPLE} />
      <UL>
        <li>Ask in plain words: &quot;is this hook safe to trade through?&quot;, &quot;what does this pool really charge?&quot;, &quot;which hooks are busiest on Arc?&quot;.</li>
        <li>Answers carry links to the Hook Reader page, so you can check the details yourself.</li>
        <li>The limit is 60 requests a minute per address, shared with the API.</li>
      </UL>

      <Callout tone="warn" title="Capabilities, not verdicts">
        The tools say what a hook&apos;s address allows it to do, never whether it is safe. Assistants are told to keep that
        distinction, but read the answer the same way: a hook that can refuse a trade may never do it, and a hook can still
        charge a lot within what it&apos;s allowed.
      </Callout>
    </>
  );
}
