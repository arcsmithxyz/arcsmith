import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon } from "@/components/BlockIcon";
import { AuthorLeaderboard } from "@/components/blocks/AuthorLeaderboard";
import { BlocksView } from "@/components/blocks/BlocksView";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Blocks" };

const GUARANTEES = [
  "Blocks are read-only: the kernel calls them with a static call, so they can't move funds or change state.",
  "Each block gets a fixed gas budget. One that reverts or runs out is skipped — it can never freeze a pool.",
  "Whatever blocks ask for, fees are capped at 50% in a pool's first 15 minutes and 10% after; burns at 5%.",
  "Approval pins a block's code hash. A pool's stack and settings freeze when it opens.",
];

export default function BlocksPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PageIntro eyebrow="Block catalog" title="The pieces every hook is built from">
        Each block is a small contract that answers one question on every trade: what should this cost? Native blocks come
        with the platform; community blocks are reviewed before anyone can use them.
        <span className="mt-5 flex flex-wrap gap-3">
          <Link href="/build" className="pill pill-ink">
            Use them in the builder
          </Link>
          <Link href="/blocks/submit" className="pill pill-ghost">
            Submit a block
          </Link>
        </span>
      </PageIntro>

      <BlocksView />

      <section aria-labelledby="authors" className="mt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="authors" className="headline text-[1.75rem]">
              Block authors
            </h2>
            <p className="mt-1 max-w-2xl font-serif text-muted">
              Authors earn a royalty every time a launch that uses their block pays fees. Ranked by what they&apos;ve earned.
            </p>
          </div>
          <Link href="/docs/write-a-block" className="pill pill-ghost pill-sm">
            Write a block
          </Link>
        </div>
        <AuthorLeaderboard />
      </section>

      <section aria-labelledby="guarantees" className="card mt-10 flex flex-col gap-5 p-6 sm:flex-row">
        <LockIcon />
        <div>
          <h2 id="guarantees" className="font-medium">
            What the kernel guarantees, whatever the blocks do
          </h2>
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-muted sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
