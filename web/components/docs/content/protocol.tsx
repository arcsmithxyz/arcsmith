import { arcMainnet, arcTestnet } from "@/lib/chains";
import { deployments, type Deployment } from "@/lib/deployments";
import { A, C, Callout, H2, P, Table, UL } from "../Prose";

export function Safety() {
  return (
    <>
      <P>These limits live in the kernel contract. No block, owner or setting can get around them.</P>
      <Table
        head={["Guarantee", "Detail"]}
        rows={[
          ["Fee ceiling", "At most 50% during a pool's first 15 minutes, and 10% after, whatever the blocks ask for."],
          ["Burn ceiling", "At most 5% of any single buy."],
          ["Base fee range", "0.01% to 3%."],
          ["Block count", "At most 5 blocks per pool, no duplicates, each approved in the catalog when the pool opens."],
          ["Read-only blocks", <>Blocks are called with <C key="s">STATICCALL</C>: they can&apos;t move funds or change state.</>],
          ["Fail open", "A block that reverts, runs out of its 100,000 gas or answers nonsense is skipped for that trade; it can't freeze a pool."],
          ["No starving blocks", "The kernel refuses to run unless it has each block's full gas budget, so nobody can make a block fail on purpose to skip it."],
          ["Frozen rules", "A pool's blocks and settings are set once, when it opens."],
          ["Locked launch liquidity", "The launchpad has no function to remove a launch's founding liquidity."],
          ["Launch floor", "A launched token's price can't trade below its launch price."],
          ["Withdrawals always work", "Blocks never see liquidity removals, so none can block you from withdrawing."],
        ]}
      />

      <H2 id="what-blocks-can-do">What a reviewed block can still do</H2>
      <P>
        Within those limits, an approved block can raise fees up to the ceiling and refuse trades or deposits. Review in the
        catalog is the defence against a block that misuses this; the fee chart and pool pages show exactly what each pool
        charges.
      </P>

      <H2 id="testing">How it was tested</H2>
      <UL>
        <li>87 contract tests: every launch behaviour runs twice (the token sorting before and after USDC), plus kernel, catalog and market tests, including a greedy block, reverting and gas-burning blocks, and gas starvation.</li>
        <li>Fuzz tests: a buy then sell never returns more USDC than it cost; the sell fee never leaves its bounds.</li>
        <li>Tests against a copy of Arc mainnet with the real Uniswap v4 pool manager and USDC.</li>
        <li>Live smoke tests on Arc testnet and mainnet: launch, trade, fees, open market, liquidity (11 of 11 transactions each).</li>
      </UL>
      <Callout tone="warn" title="Not audited yet">
        Testing is not an audit. Pools are permanent, so a bug in a live pool can&apos;t be patched, only avoided in future
        deployments.
      </Callout>
    </>
  );
}

export function Fees() {
  return (
    <>
      <H2 id="trading-fee">The trading fee</H2>
      <P>
        Every swap pays the pool&apos;s fee: its base fee plus what its blocks add. Like any Uniswap pool, that fee goes to the
        pool&apos;s liquidity, shared between positions by size. Burns are separate: tokens burned from a buy are destroyed,
        not paid to anyone.
      </P>

      <H2 id="launches">Launches</H2>
      <P>
        In a launch, the locked founding position holds most of the liquidity, so it earns most of the fees. Those fees are
        split when collected:
      </P>
      <Table
        head={["Recipient", "Share"]}
        rows={[
          ["Creator", "90% at the current setting"],
          ["Protocol", "10% at the current setting; block royalties are paid out of this share"],
        ]}
      />
      <P>
        The split is fixed for each launch at the moment it launches; the owner can only change it for future launches, up
        to 50%. Buys pay fees in USDC and sells in the token, so both are paid out in both.
      </P>

      <H2 id="royalties">Block royalties</H2>
      <P>
        Each approved community block has a royalty rate, at most 20% of the protocol&apos;s share, fixed per launch when it
        launches. It is paid to the block&apos;s current author when the launch&apos;s fees are collected. Royalties never come
        out of the creator&apos;s share.
      </P>
      <Callout title="Example">
        A launch trades $1,000 at a 1% fee, so the locked position earns about $10. The creator gets $9 and the protocol $1.
        If the launch uses a community block with a 10% royalty, its author gets $0.10 of that $1 and the treasury $0.90.
      </Callout>

      <H2 id="markets">Existing-token markets</H2>
      <P>All fees go to liquidity providers. There is no protocol share or creator share.</P>

      <H2 id="collecting">Collecting and claiming</H2>
      <UL>
        <li>Anyone can collect a launch&apos;s fees; it only moves them into claimable balances.</li>
        <li>Claims are pull-based: each wallet withdraws its own balance, so one blocked account can&apos;t hold up anyone else.</li>
        <li>Creators and block authors claim from the pool page or their <A href="/portfolio">Portfolio</A>.</li>
      </UL>
    </>
  );
}

export function TrustModel() {
  return (
    <>
      <Table
        head={["Who", "Can", "Cannot"]}
        rows={[
          ["Platform owner", "Pause new pools; set the treasury; set the protocol share for future launches (up to 50%)", "Touch any existing pool, its rules, its liquidity, or fees already earned"],
          ["Catalog owner", "Approve community blocks and set their royalty (up to 20% of the protocol share); reject or retire blocks", "Change a live pool's blocks or settings; approve a block whose code changed after submission"],
          ["Creator", "Claim their fee share; hand creator rights to another wallet", "Change their pool's rules or pull launch liquidity"],
          ["Block author", "Submit blocks; hand authorship and future royalties to another wallet", "Change an approved block's code or any pool's settings"],
          ["Anyone", "Launch; open a market for any token; trade; add and remove liquidity; collect fees", "Create a pool with the kernel outside the launchpad"],
        ]}
      />
      <P>
        Pausing only stops new launches and markets. Existing pools keep trading, and liquidity providers can always
        withdraw. Retiring a block only stops new pools from choosing it.
      </P>
      <Callout title="Where to check">
        The owner of each contract is public on chain. See <A href="/docs/contracts">Contract addresses</A>.
      </Callout>
    </>
  );
}

function ContractTable({ d, explorer }: { d: Deployment; explorer: string }) {
  // [label, address, ours]: Uniswap's pool manager and USDC aren't Arcsmith contracts.
  const rows: [string, string, boolean][] = [
    ["Hook kernel", d.kernel, true],
    ["Launchpad", d.launchpad, true],
    ["Block catalog", d.catalog, true],
    ["Router", d.router, true],
    ["Liquidity manager", d.liquidityManager, true],
    ["Launch guard block", d.guardBlock, true],
    ["Dump damper block", d.damperBlock, true],
    ["Auto burn block", d.burnBlock, true],
    ["Surge fee block", d.surgeBlock, true],
    ["Uniswap v4 pool manager", d.poolManager, false],
    ["USDC", d.usdc, false],
  ];
  return (
    <Table
      head={["Contract", "Address"]}
      rows={rows.map(([label, address, ours]) => [
        d.sourceVerified && ours ? (
          <span key={label} className="flex flex-col gap-1">
            {label}
            <span className="flex items-center gap-1.5 font-sans text-sm">
              <CheckIcon />
              <A href={`${explorer}/address/${address}?tab=contract`}>Verified source</A>
            </span>
          </span>
        ) : (
          label
        ),
        <A key={address} href={`${explorer}/address/${address}`}>
          <span className="font-mono text-sm break-all">{address}</span>
        </A>,
      ])}
    />
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0 text-buy" fill="currentColor">
      <circle cx="8" cy="8" r="7.5" />
      <path d="m4.9 8.2 2 2 4.2-4.4" fill="none" stroke="var(--panel)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Contracts() {
  const mainnet = deployments[arcMainnet.id];
  const testnet = deployments[arcTestnet.id];
  return (
    <>
      <H2 id="mainnet">Arc mainnet</H2>
      {mainnet?.sourceVerified && (
        <P>
          Every Arcsmith contract on mainnet is verified on Arc Explorer as an exact match: its published source compiles
          to exactly the code on chain. Follow a contract&apos;s <strong>Verified source</strong> link to read it.
        </P>
      )}
      {mainnet ? (
        <ContractTable d={mainnet} explorer={arcMainnet.blockExplorers.default.url} />
      ) : (
        <P>Not deployed yet.</P>
      )}
      <H2 id="testnet">Arc testnet</H2>
      {testnet ? (
        <ContractTable d={testnet} explorer={arcTestnet.blockExplorers.default.url} />
      ) : (
        <P>Not deployed yet.</P>
      )}
      <Callout title="Same Uniswap everywhere">
        Uniswap v4 is at the same addresses on Arc mainnet and testnet, and every Arcsmith pool is a standard v4 pool:
        routers that support v4 hooks can trade in it.
      </Callout>
    </>
  );
}
