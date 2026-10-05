import type { Metadata } from "next";
import { SubmitBlockForm } from "@/components/blocks/SubmitBlockForm";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Submit a block" };

export default function SubmitBlockPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Block catalog" title="Submit a block">
        Deploy your IRuleBlock contract, describe its settings here, and submit it for review. Once approved, anyone can add
        it to a pool from the builder.
      </PageIntro>
      <SubmitBlockForm />
    </div>
  );
}
