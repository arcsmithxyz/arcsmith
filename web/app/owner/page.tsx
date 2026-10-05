import type { Metadata } from "next";
import { OwnerView } from "@/components/OwnerView";
import { PageIntro } from "@/components/ui";

// Not linked from the site and kept out of search results; the owner opens it directly.
export const metadata: Metadata = { title: "Owner", robots: { index: false, follow: false } };

export default function OwnerPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 sm:px-6">
      <PageIntro eyebrow="Owner" title="Run the platform">
        Accept the catalog, review community blocks, claim protocol fees and pause new pools. Buttons only appear for the
        wallet that holds each role.
      </PageIntro>
      <OwnerView />
    </div>
  );
}
