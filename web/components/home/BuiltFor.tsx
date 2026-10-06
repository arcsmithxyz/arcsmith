import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

/** Who Arcsmith is for, one door each, after the live numbers on the home page. */
const DOORS = [
  { who: "Traders", body: "Read any Uniswap v4 hook on Arc before you trade through it: what it can do, in plain words.", href: "/hooks", cta: "Read a hook" },
  { who: "Token creators", body: "Launch in one transaction with rules against snipers and dumps, and earn most of the trading fees.", href: "/build", cta: "Launch a token" },
  { who: "Existing tokens", body: "Open a hooked market for any token on Arc, with your own rules.", href: "/docs/existing-tokens", cta: "How it works" },
  { who: "Liquidity providers", body: "Add full-range liquidity to any Arcsmith pool and earn a share of every trade.", href: "/discover", cta: "Browse pools" },
  { who: "Block authors", body: "Write a block, get it reviewed, and earn a royalty from every launch that uses it.", href: "/docs/write-a-block", cta: "Write a block" },
  { who: "Apps, bots and AI", body: "Get any hook's abilities as JSON, or let Claude and Cursor check hooks on Arc through our MCP server. Free, no key.", href: "/docs/mcp", cta: "Connect your AI" },
];

export function BuiltFor() {
  return (
    <section aria-labelledby="built-for-heading" className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
      <Reveal className="max-w-2xl">
        <span className="chip text-ink">Built for</span>
        <h2 id="built-for-heading" className="headline mt-6 text-4xl text-ink md:text-5xl">
          Whoever you are on Arc, there&apos;s a way in.
        </h2>
      </Reveal>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOORS.map((door, i) => (
          <Reveal as="li" key={door.who} delay={i * 60}>
            <Link
              href={door.href}
              className="group flex h-full flex-col rounded-3xl border border-line bg-panel p-6 transition-[border-color,translate] duration-300 ease-spring hover:-translate-y-0.5 hover:border-ink/30"
            >
              <h3 className="text-xl font-medium text-ink">{door.who}</h3>
              <p className="mt-2 flex-1 font-serif text-lg leading-relaxed text-muted">{door.body}</p>
              <span className="mt-5 text-sm font-medium text-validator">
                {door.cta} <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
