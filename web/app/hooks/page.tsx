import type { Metadata } from "next";
import Link from "next/link";
import { HookSearch } from "@/components/HookSearch";
import { HookTable } from "@/components/HookTable";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Hook reader" };

export default function HooksPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Hook reader" title="What can this hook do?">
        Any Uniswap v4 hook on Arc, read from its address: the callbacks it can run, which of them can move your money, and
        the pools that use it. No source code needed. Paste a token instead to see every pool it trades in and the hook
        each one runs.
      </PageIntro>
      <div className="max-w-2xl">
        <HookSearch autoFocus />
        <p className="mt-4 text-sm text-muted">
          Building an app or a bot?{" "}
          <Link href="/docs/api" className="underline underline-offset-2 hover:text-text">
            Get these answers as JSON
          </Link>
          . Free, no key.
        </p>
      </div>
      <section aria-labelledby="all-hooks" className="mt-16">
        <h2 id="all-hooks" className="headline mb-4 text-[1.75rem]">
          Hooks on Arc
        </h2>
        <HookTable />
      </section>
    </div>
  );
}
