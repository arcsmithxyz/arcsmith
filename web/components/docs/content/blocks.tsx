import { A, C, Callout, CodeBlock, H2, H3, P, Steps, Table, UL } from "../Prose";

export function NativeBlocks() {
  return (
    <>
      <P>
        Four blocks ship with Arcsmith. They are reviewed like any other block and listed in the{" "}
        <A href="/blocks">catalog</A>, where you can also try each one on a fee chart.
      </P>

      <H2 id="launch-guard">Launch guard</H2>
      <P>
        For the first minutes of a launch, buys pay an extra fee that starts high and falls in a straight line to zero, and
        each buy is capped at a share of the supply. Sniping the open becomes expensive, and that fee goes to the
        pool&apos;s liquidity. While the guard is active, only the launchpad can add liquidity. New tokens only.
      </P>
      <Table
        head={["Setting", "Range", "Default"]}
        rows={[
          ["Extra buy fee at the open", "0% to 49%", "29%"],
          ["Guard length", "1 second to 15 minutes", "3 minutes"],
          ["Max buy per trade, share of supply", "0% (no cap) to 10%", "1%"],
        ]}
      />

      <H2 id="dump-damper">Dump damper</H2>
      <P>
        Sells add to a pool&apos;s &quot;sell pressure&quot; in proportion to their size against pool depth; buys relieve it;
        it fades by about 100% of pool depth per hour. The extra sell fee grows with pressure, up to the maximum. Someone
        trimming a position pays about the base fee; a fast mass exit pays up to the cap.
      </P>
      <Table
        head={["Setting", "Range", "Default"]}
        rows={[
          ["Strength", "1 to 1,000,000", "500,000"],
          ["Max extra sell fee", "0.0001% to 9.9%", "7%"],
        ]}
      />

      <H2 id="auto-burn">Auto burn</H2>
      <P>
        Burns a share of every buy&apos;s output forever by sending it to the dead address. Applies to exact-input buys (the
        normal kind); exact-output buys skip the burn so nobody is charged extra.
      </P>
      <Table head={["Setting", "Range", "Default"]} rows={[["Burned share of each buy", "0.01% to 5%", "1%"]]} />

      <H2 id="surge-fee">Surge fee</H2>
      <P>
        The fee grows with each trade&apos;s size against pool depth, in both directions: extra fee = size impact × strength,
        up to the maximum. Small trades pay the base fee; whales pay more to the liquidity providers who absorb them.
      </P>
      <Table
        head={["Setting", "Range", "Default"]}
        rows={[
          ["Strength", "1 to 1,000,000", "300,000"],
          ["Max extra fee", "0.0001% to 9.9%", "2%"],
        ]}
      />

      <Callout title="Combining blocks">
        Fee additions from all blocks are added together, then capped by the kernel (50% in a pool&apos;s first 15 minutes,
        10% after). Burns are capped at 5% in total. Any block can refuse a trade.
      </Callout>
    </>
  );
}

const INTERFACE = `
interface IRuleBlock {
    /// Bitmask of the hook points a block uses: 1 beforeSwap, 2 afterSwap, 4 beforeAddLiquidity.
    function hookPoints() external pure returns (uint8);

    /// True when \`config\` is valid for this block in a pool of the given lane.
    function validateConfig(bytes calldata config, bool isLaunch) external view returns (bool);

    function beforeSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external view returns (uint24 feeAdd, bool reject, bytes32 newState);

    function afterSwap(SwapContext calldata ctx, bytes calldata config, bytes32 state)
        external view returns (uint16 burnBps, bool reject, bytes32 newState);

    function beforeAddLiquidity(LiquidityContext calldata ctx, bytes calldata config, bytes32 state)
        external view returns (bool reject);
}`;

const CONTEXT = `
struct SwapContext {
    PoolId poolId;
    bool isBuy;            // true when the swapper receives the pool's token
    bool exactInput;
    uint256 amount;        // |amountSpecified|
    uint256 impactPpm;     // trade size against pool depth, in millionths
    uint256 subjectAmount; // tokens bought or sold (0 in beforeSwap)
    uint40 openedAt;       // when the pool opened
    uint40 timestamp;
    uint256 subjectSupply; // token supply when the pool opened
    bool isLaunch;
}`;

const METADATA = `
{
  "name": "Weekend fee",
  "summary": "One or two plain sentences a token creator can understand.",
  "lanes": "any",
  "config": [
    { "key": "extraFee", "type": "uint24", "label": "Extra fee on weekends",
      "unit": "pips", "min": 0, "max": 20000, "default": 5000 }
  ]
}`;

export function WriteABlock() {
  return (
    <>
      <P>
        Anyone can write a block, submit it to the catalog, and, once approved, earn a royalty from every launch that uses
        it. Blocks are small Solidity contracts; the native ones in <C>contracts/src/blocks</C> are good starting points.
      </P>

      <H2 id="interface">The interface</H2>
      <CodeBlock label="IRuleBlock.sol" code={INTERFACE} />
      <P>What a block sees about a trade:</P>
      <CodeBlock label="SwapContext" code={CONTEXT} />

      <H2 id="rules">Rules every block lives by</H2>
      <UL>
        <li>
          Everything is <C>view</C> or <C>pure</C>. The kernel calls with <C>STATICCALL</C>: no state writes, no transfers,
          no calls into the pool.
        </li>
        <li>100,000 gas per call. A block that reverts, runs out of gas or returns malformed data is skipped for that call.</li>
        <li>
          Per-pool memory is one <C>bytes32</C> the kernel stores for you: read <C>state</C>, return <C>newState</C>.
        </li>
        <li>
          <C>validateConfig</C> must reject settings you can&apos;t handle, and the lane you don&apos;t support. Registration
          fails if it returns false.
        </li>
        <li>Fees are in pips (10,000 = 1%), burns in basis points (100 = 1%). The kernel caps the totals.</li>
      </UL>

      <H2 id="settings">Describing your settings</H2>
      <P>
        Settings are ABI-encoded in order and described by a small JSON document stored on chain with your submission. The
        builder renders a form from it, so your block needs no changes to the app.
      </P>
      <CodeBlock label="metadata.json" code={METADATA} />
      <Table
        head={["Field", "Values"]}
        rows={[
          [<C key="t">type</C>, "uint16, uint24 or uint32"],
          [<C key="u">unit</C>, "pips (10,000 = 1%), bps (100 = 1%), seconds, or number"],
          [<C key="l">lanes</C>, '"any", or "launch" for new tokens only'],
        ]}
      />

      <H2 id="submit">Submit and get paid</H2>
      <Steps
        items={[
          { title: "Write and test", body: "Use Foundry; test against the kernel's caps and both lanes." },
          { title: "Deploy on Arc", body: "Deploy your block contract to Arc mainnet." },
          {
            title: "Submit",
            body: (
              <>
                On <A href="/blocks/submit">Submit a block</A>, paste the address and describe its settings. The form checks
                that it implements the interface and accepts its default settings, and previews its fee curve.
              </>
            ),
          },
          { title: "Review", body: "The catalog owner reviews the code and approves it with a royalty rate (at most 20% of the protocol's share). Approval pins the contract's code hash." },
          { title: "Earn", body: "Each launch that uses your block pays you its royalty rate, frozen at launch, whenever that launch's fees are collected. Claim in your Portfolio." },
        ]}
      />

      <H3>Tips</H3>
      <UL>
        <li>Keep it cheap and deterministic; use <C>ctx.timestamp</C> rather than assumptions about time.</li>
        <li>Prefer raising fees over refusing trades: a block that refuses everything freezes trading in pools that chose it.</li>
        <li>Write the summary for token creators, not developers.</li>
      </UL>
    </>
  );
}
