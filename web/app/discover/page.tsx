import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscoverView } from "@/components/DiscoverView";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Discover" title="Pools, tokens and hooks">
        Every pool here runs on one kernel hook with its own frozen stack of blocks. Browse them, or look across every v4
        hook deployed on Arc.
      </PageIntro>
      {/* DiscoverView reads ?tab= from the URL. */}
      <Suspense>
        <DiscoverView />
      </Suspense>
    </div>
  );
}
