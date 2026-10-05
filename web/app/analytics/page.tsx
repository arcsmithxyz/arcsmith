import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { EmptyState, PageIntro } from "@/components/ui";
import { getAnalytics, type Analytics } from "@/lib/server/analytics";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Uniswap v4 on Arc in numbers: volume, liquidity, fees, hooks and Arcsmith pools, straight from the index.",
};

// Rendered per request from a fifteen-minute server cache, so the numbers are never frozen at build time.
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  let data: Analytics | null = null;
  try {
    data = await getAnalytics();
  } catch {
    // Shown as an empty state below.
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Analytics" title="Uniswap v4 on Arc, in numbers">
        Growth and health of every Uniswap v4 pool and hook on Arc mainnet, and of the pools built with Arcsmith, straight
        from the index and the chain.
      </PageIntro>
      {data ? (
        <AnalyticsView data={data} />
      ) : (
        <EmptyState
          title="The Arc index isn't answering"
          body="Analytics come from a public Uniswap v4 index of Arc, which isn't answering right now. Try again later."
          action={{ href: "/discover", label: "Browse pools instead" }}
        />
      )}
    </div>
  );
}
