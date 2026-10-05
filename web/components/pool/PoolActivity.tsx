"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CandleChart, type Candle } from "@/components/charts/CandleChart";
import { Badge, Skeleton, Tabs } from "@/components/ui";
import { arcMainnet } from "@/lib/chains";
import { chain, explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import { formatAmount, formatQuoted, formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import type { PoolHistory } from "@/lib/subgraph";

type Interval = "hour" | "day";

const hourLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Price candles and the latest trades for one pool, from the Arc index through /api/pool-history
 * (mainnet only; refreshed every few minutes to stay inside the index's daily allowance).
 * Prices are shown per one subject token.
 */
export function PoolActivity({
  poolId,
  subjectIsCurrency0,
  symbol,
  quoteSymbol,
  isUsd,
}: {
  poolId: string;
  subjectIsCurrency0: boolean;
  symbol: string;
  quoteSymbol: string;
  isUsd: boolean;
}) {
  const [interval, setCandleSize] = useState<Interval>("hour");
  const now = useNow();
  const indexed = chain.id === arcMainnet.id;

  const history = useQuery({
    queryKey: ["pool-history", poolId, interval],
    queryFn: async (): Promise<PoolHistory> => {
      const response = await fetch(`/api/pool-history/${poolId}?interval=${interval}`);
      if (!response.ok) throw new Error("The Arc index didn't answer.");
      return response.json();
    },
    enabled: indexed,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  if (!indexed) {
    return (
      <section className="card p-6" aria-label="Price and trades">
        <h2 className="text-lg font-medium">Price and trades</h2>
        <p className="mt-2 text-sm text-muted">Price history and trades are tracked on Arc mainnet only.</p>
      </section>
    );
  }

  // The index prices token0 per token1; flip it when the subject is token0.
  const candles: Candle[] = (history.data?.candles ?? []).map((c) =>
    subjectIsCurrency0
      ? { time: c.time, open: inverse(c.open), high: inverse(c.low), low: inverse(c.high), close: inverse(c.close), volumeUSD: c.volumeUSD }
      : c,
  );
  const price = (value: number) => formatQuoted(value, quoteSymbol, isUsd);
  const swaps = history.data?.swaps ?? [];

  return (
    <section className="card p-6" aria-labelledby="price-history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="price-history" className="text-lg font-medium">
          Price
        </h2>
        <Tabs
          label="Candle size"
          value={interval}
          onChange={setCandleSize}
          options={[
            { value: "hour", label: "1 hour" },
            { value: "day", label: "1 day" },
          ]}
        />
      </div>
      <div className={`mt-4 transition-opacity ${history.isFetching && history.isPlaceholderData ? "opacity-60" : ""}`}>
        {history.isLoading ? (
          <Skeleton className="h-[270px]" />
        ) : candles.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">{history.isError ? "The Arc index didn't answer. Retrying…" : "No trades yet."}</p>
        ) : (
          <CandleChart
            candles={candles}
            label={`${symbol} price in ${quoteSymbol}, ${interval === "hour" ? "hourly" : "daily"} candles`}
            formatPrice={price}
            formatTime={(t) => (interval === "hour" ? hourLabel.format(t * 1000) : dayLabel.format(t * 1000))}
          />
        )}
      </div>

      <h3 className="mt-8 text-base font-medium">Latest trades</h3>
      {swaps.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{history.isLoading ? "Loading…" : "No trades yet."}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-subtle">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Time
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Side
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {symbol}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Price
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Trader
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {swaps.map((swap) => {
                // Amounts are from the pool's side: negative means the trader received it.
                const subject = Number(subjectIsCurrency0 ? swap.amount0 : swap.amount1);
                const quote = Number(subjectIsCurrency0 ? swap.amount1 : swap.amount0);
                const buy = subject < 0;
                const tx = explorerTxUrl(swap.transaction.id);
                const trader = explorerAddressUrl(swap.origin);
                return (
                  <tr key={swap.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 text-muted">
                      {tx ? (
                        <a href={tx} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                          {now > 0 ? timeAgo(Number(swap.timestamp), now) : ""}
                        </a>
                      ) : now > 0 ? (
                        timeAgo(Number(swap.timestamp), now)
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-3 py-2">{buy ? <Badge tone="good">Buy</Badge> : <Badge tone="bad">Sell</Badge>}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(Math.abs(subject))}</td>
                    <td className="px-3 py-2 text-right">{isUsd ? formatUsd(Math.abs(quote)) : formatUsd(Number(swap.amountUSD))}</td>
                    <td className="px-3 py-2 text-right">{subject !== 0 ? price(Math.abs(quote / subject)) : "–"}</td>
                    <td className="py-2 pl-3 text-right font-mono text-xs">
                      {trader ? (
                        <a href={trader} target="_blank" rel="noreferrer" className="hover:underline">
                          {shortAddress(swap.origin)}
                        </a>
                      ) : (
                        shortAddress(swap.origin)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function inverse(value: number) {
  return value > 0 ? 1 / value : 0;
}
