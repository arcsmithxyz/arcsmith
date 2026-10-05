"use client";

import Link from "next/link";
import { useState } from "react";
import { TimeSeriesChart, type SeriesPoint } from "@/components/charts/TimeSeriesChart";
import { Badge, Tabs } from "@/components/ui";
import { formatUsd, shortAddress } from "@/lib/format";
import type { Analytics } from "@/lib/server/analytics";

type Range = "30" | "90" | "all";

const RANGES: { value: Range; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const percent = (share: number) => `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const asOf = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Arc mainnet's Uniswap v4 activity: headline numbers, daily charts, hooks, Arcsmith, and data health. */
export function AnalyticsView({ data }: { data: Analytics }) {
  const [range, setRange] = useState<Range>("30");
  const days = range === "all" ? data.daily : data.daily.slice(-Number(range));
  const series = (pick: (d: Analytics["daily"][number]) => number): SeriesPoint[] =>
    days.map((d) => ({ time: d.date, value: pick(d) }));
  // The newest day is still in progress; "yesterday" is the last full one.
  const yesterday = data.daily.at(-2);

  return (
    <div className="flex flex-col gap-16 pb-8">
      <IndexStatus data={data} />

      <section aria-labelledby="totals">
        <h2 id="totals" className="sr-only">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-line bg-line lg:grid-cols-4">
          <Tile label="Volume, all time" value={formatUsd(data.totals.volumeUSD)} />
          <Tile label="Liquidity now" value={formatUsd(data.totals.liquidityUSD)} />
          <Tile label="Fees earned, all time" value={formatUsd(data.totals.feesUSD)} />
          <Tile label="Transactions" value={compact.format(data.totals.transactions)} />
          <Tile label="Pools" value={compact.format(data.totals.pools)} />
          <Tile label="Pools with a hook" value={compact.format(data.totals.hookedPools)} />
          <Tile label="Hooks with pools" value={data.totals.hooksCapped ? `${whole(data.totals.hooks)}+` : whole(data.totals.hooks)} />
          <Tile label="Volume yesterday" value={yesterday ? formatUsd(yesterday.volumeUSD) : "–"} />
        </dl>
      </section>

      <section aria-labelledby="activity" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="activity" className="headline text-[1.75rem]">
              Activity over time
            </h2>
            <p className="mt-1 font-serif text-muted">Per UTC day. The last day is still in progress.</p>
          </div>
          <Tabs label="Time range" value={range} options={RANGES} onChange={setRange} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Daily volume" subtitle="USD traded through every Uniswap v4 pool on Arc">
            <TimeSeriesChart label="Daily volume in USD" variant="bar" points={series((d) => d.volumeUSD)} format={formatUsd} />
          </ChartCard>
          <ChartCard title="Liquidity" subtitle="USD held in pools at the end of each day">
            <TimeSeriesChart label="Liquidity in USD" variant="area" points={series((d) => d.tvlUSD)} format={formatUsd} />
          </ChartCard>
          <ChartCard title="Daily transactions" subtitle="Swaps and liquidity changes">
            <TimeSeriesChart label="Daily transactions" variant="bar" points={series((d) => d.transactions)} format={(n) => compact.format(n)} />
          </ChartCard>
          <ChartCard title="Daily fees" subtitle="Paid by traders to liquidity providers">
            <TimeSeriesChart label="Daily fees in USD" variant="bar" points={series((d) => d.feesUSD)} format={formatUsd} />
          </ChartCard>
        </div>
      </section>

      <section aria-labelledby="hooks" className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-6">
          <div>
            <h2 id="hooks" className="headline text-[1.75rem]">
              Hooks on Arc
            </h2>
            <p className="mt-1 font-serif text-muted">
              How much of Arc&apos;s trading runs through pools with a hook, leaving out hooks with big volume and no liquidity.
            </p>
          </div>
          <Meter label="Volume through hooked pools" share={data.hookedShare.volume} />
          <Meter label="Liquidity in hooked pools" share={data.hookedShare.liquidity} />
        </div>
        <TopHooks hooks={data.topHooks} hidden={data.hiddenHooks} />
      </section>

      {data.arcsmith && <ArcsmithPanel data={data.arcsmith} />}

      <DataHealth data={data} />
    </div>
  );
}

function IndexStatus({ data }: { data: Analytics }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-sm text-muted">
      <span className="flex items-center gap-2">
        <span aria-hidden className={`size-2 rounded-full ${data.index.hasIndexingErrors ? "bg-warn" : "bg-buy"}`} />
        Data as of {asOf.format(data.generatedAt)} UTC
      </span>
      <span aria-hidden>·</span>
      <span>Block {data.index.block.toLocaleString("en-US")}</span>
      <span aria-hidden>·</span>
      <span>Refreshes every 15 minutes</span>
    </p>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col bg-panel p-6">
      <dt className="order-2 mt-1 font-serif text-sm text-muted">{label}</dt>
      <dd className="order-1 text-3xl font-medium tracking-tight text-ink sm:text-4xl">{value}</dd>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-line bg-panel p-6">
      <h3 className="text-lg font-medium text-ink">{title}</h3>
      <p className="mb-8 font-serif text-sm text-muted">{subtitle}</p>
      {children}
    </div>
  );
}

/** Share of a whole: the filled part in Validator Blue on a lighter step of the same hue. */
function Meter({ label, share }: { label: string; share: number }) {
  const clamped = Math.min(1, Math.max(0, share));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-serif text-muted">{label}</p>
        <p className="text-2xl font-medium text-ink">{percent(clamped)}</p>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-sky/50"
      >
        <div className="h-full rounded-full bg-validator" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}

function TopHooks({ hooks, hidden }: { hooks: Analytics["topHooks"]; hidden: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? hooks : hooks.slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-[28px] border border-line bg-panel">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="px-6 pt-5 pb-2 text-left text-lg font-medium text-ink">Busiest hooks by volume</caption>
        <thead className="text-xs text-subtle">
          <tr className="border-b border-line">
            <th scope="col" className="px-6 py-3 font-medium">
              Hook
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Pools
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Volume
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Liquidity
            </th>
            <th scope="col" className="px-6 py-3 text-right font-medium">
              Fees
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {shown.map((hook, i) => (
            <tr key={hook.id} className="border-b border-line/60 last:border-0 hover:bg-surface/60">
              <td className="px-6 py-3">
                <span className="mr-3 inline-block w-5 text-subtle">{i + 1}</span>
                <Link href={`/hooks/${hook.id}`} className="font-mono text-ink underline-offset-4 hover:underline">
                  {shortAddress(hook.id)}
                </Link>
                {hook.isArcsmith && (
                  <span className="ml-2">
                    <Badge tone="good">Arcsmith</Badge>
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right">{whole(hook.pools)}</td>
              <td className="px-3 py-3 text-right">{formatUsd(hook.volumeUSD)}</td>
              <td className="px-3 py-3 text-right">{formatUsd(hook.liquidityUSD)}</td>
              <td className="px-6 py-3 text-right">{formatUsd(hook.feesUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(hooks.length > 10 || hidden > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3">
          {hooks.length > 10 ? (
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show top 10" : `Show all ${hooks.length}`}
            </button>
          ) : (
            <span />
          )}
          {hidden > 0 && (
            <p className="text-xs text-muted">
              {hidden} {hidden === 1 ? "hook" : "hooks"} with large volume but under $100 of liquidity left out: likely wash trading or
              mispriced tokens.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ArcsmithPanel({ data }: { data: NonNullable<Analytics["arcsmith"]> }) {
  const stats = [
    { label: "Pools", value: whole(data.pools) },
    { label: "Tokens launched", value: whole(data.launches) },
    { label: "Existing-token markets", value: whole(data.markets - data.launches) },
    { label: "Blocks in the catalog", value: whole(data.blocks) },
    { label: "Transactions", value: whole(data.transactions) },
    { label: "Volume", value: formatUsd(data.volumeUSD) },
    { label: "Fees earned", value: formatUsd(data.feesUSD) },
    { label: "Liquidity", value: formatUsd(data.liquidityUSD) },
  ];
  return (
    <section aria-labelledby="arcsmith" className="organic grid gap-10 rounded-[32px] p-8 text-on-ink lg:grid-cols-[1fr_2fr]" data-nav-theme="dark">
      <div>
        <span className="chip text-on-ink/90">Arcsmith</span>
        <h2 id="arcsmith" className="headline mt-6 text-[1.75rem]">
          Pools built here
        </h2>
        <p className="mt-2 font-serif text-on-ink/70">
          Every pool whose hook is the Arcsmith kernel, counted from the chain and the index. Early days: every number is
          real.
        </p>
        <Link href="/discover" className="mt-6 inline-flex font-serif text-on-ink underline underline-offset-4 hover:text-accent">
          Browse Arcsmith pools →
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="order-2 mt-1 font-serif text-sm text-on-ink/70">{s.label}</dt>
            <dd className="order-1 text-3xl font-medium tracking-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DataHealth({ data }: { data: Analytics }) {
  const lagBlocks = data.chainHead !== null ? Math.max(0, data.chainHead - data.index.block) : null;
  const lagSeconds = Math.max(0, Math.round(data.generatedAt / 1000 - data.index.timestamp));
  const rows = [
    { label: "Network", value: "Arc mainnet · chain 5042" },
    { label: "Chain head", value: data.chainHead !== null ? data.chainHead.toLocaleString("en-US") : "No RPC answered" },
    { label: "Indexed through", value: data.index.block.toLocaleString("en-US") },
    { label: "Lag", value: lagBlocks !== null ? `${lagBlocks.toLocaleString("en-US")} blocks (about ${lagSeconds} s)` : `About ${lagSeconds} s` },
    { label: "Indexing errors", value: data.index.hasIndexingErrors ? "Reported" : "None" },
  ];
  return (
    <section aria-labelledby="health" className="grid gap-10 lg:grid-cols-[1fr_2fr]">
      <div>
        <h2 id="health" className="headline text-[1.75rem]">
          Where the data comes from
        </h2>
        <p className="mt-2 font-serif text-muted">
          Pools, swaps and prices come from a community Uniswap v4 index of Arc; Arcsmith&apos;s markets are read from its
          contracts. Volume is what the index reports and can include wash trading.
        </p>
        <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{r.label}</dt>
              <dd className="tabular text-right text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="overflow-x-auto rounded-[28px] border border-line bg-panel">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="px-6 pt-5 pb-2 text-left text-lg font-medium text-ink">Source health</caption>
          <thead className="text-xs text-subtle">
            <tr className="border-b border-line">
              <th scope="col" className="px-6 py-3 font-medium">
                Source
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Response
              </th>
              <th scope="col" className="px-6 py-3 text-right font-medium">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.sources.map((s) => (
              <tr key={s.name} className="border-b border-line/60 last:border-0">
                <td className="px-6 py-3 text-ink">{s.name}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`size-2 rounded-full ${s.ok ? "bg-buy" : "bg-sell"}`} />
                    {s.ok ? "Answering" : "Not answering"}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-muted">{s.latencyMs !== null ? `${s.latencyMs} ms` : "–"}</td>
                <td className="px-6 py-3 text-right text-muted">{s.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
