import type { Metadata } from "next";
import { PortfolioView } from "@/components/PortfolioView";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Portfolio" title="What you've earned">
        Your liquidity across every pool, fees from tokens you launched, and royalties from blocks you wrote.
      </PageIntro>
      <PortfolioView />
    </div>
  );
}
