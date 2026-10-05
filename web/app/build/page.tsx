import type { Metadata } from "next";
import { BuildView } from "@/components/build/BuildView";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Build" };

export default function BuildPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Builder" title="Compose your hook">
        Pick blocks, tune them, and watch the fee curve change. When it looks right, launch a new token or open a market for
        one that exists — the rules freeze with the pool.
      </PageIntro>
      <BuildView />
    </div>
  );
}
