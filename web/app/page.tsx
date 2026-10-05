import Image from "next/image";
import Link from "next/link";
import { ActivityFeed } from "@/components/ActivityFeed";
import { BuilderShowcase } from "@/components/home/BuilderShowcase";
import { BuiltFor } from "@/components/home/BuiltFor";
import { DotField } from "@/components/home/DotField";
import { Faq } from "@/components/home/Faq";
import { HeroSky } from "@/components/home/HeroSky";
import { PlatformStats } from "@/components/home/PlatformStats";
import { PoolMarquee } from "@/components/home/PoolMarquee";
import { StoryScroll } from "@/components/home/StoryScroll";
import { Reveal } from "@/components/motion/Reveal";
import { deployment } from "@/lib/config";
import { FAQ } from "@/lib/faq";

const TRUST = [
  {
    art: "/art/trust-capped.webp",
    title: "Fees have a ceiling",
    body: "Whatever blocks ask for, no trade pays more than 50% in a pool's first 15 minutes, or 10% after.",
  },
  {
    art: "/art/trust-frozen.webp",
    title: "Frozen at launch",
    body: "A pool's blocks and settings lock the moment it opens. Nobody can change them, including us.",
  },
  {
    art: "/art/trust-readable.webp",
    title: "Every rule is readable",
    body: "Blocks are open contracts with their settings on chain, and the hook reader explains any hook on Arc.",
  },
];

const GUARANTEES = [
  { value: "50%", label: "Fee ceiling in a pool's first 15 minutes" },
  { value: "10%", label: "Fee ceiling after that" },
  { value: "5%", label: "Most a block can burn from one buy" },
  { value: "100k", label: "Gas per block. A failing block is skipped" },
];

export default function HomePage() {
  return (
    // The hero slides up under the fixed header; the closing image meets the footer.
    <div className="-mt-(--header-space) -mb-24">
      <HeroSky />

      {/* Proof: real numbers, then the pools that exist right now. */}
      <section aria-labelledby="live-heading" className="py-24">
        <Reveal as="h2" className="headline mb-10 px-4 text-center text-4xl font-normal text-validator" id="live-heading">
          Already live on Arc
        </Reveal>
        <Reveal delay={80}>
          <PlatformStats />
        </Reveal>
        <Reveal delay={160} className="mt-10">
          <PoolMarquee />
        </Reveal>
        <Reveal delay={200} className="mx-auto mt-10 max-w-[1200px] px-4 sm:px-6">
          <ActivityFeed limit={8} />
        </Reveal>
      </section>

      <BuiltFor />

      <StoryScroll />

      {/* The product itself. */}
      <section aria-labelledby="builder-heading" className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 md:py-32">
        <Reveal className="grid gap-8 md:grid-cols-2 md:items-end md:gap-16">
          <div>
            <span className="chip text-ink">The builder</span>
            <h2 id="builder-heading" className="headline mt-6 text-4xl text-ink md:text-5xl">
              A workbench for your hook.
            </h2>
          </div>
          <p className="font-serif text-xl leading-relaxed text-muted">
            Compose, preview, launch and trade from one place. Every number on screen comes straight from the chain.
          </p>
        </Reveal>
        <Reveal className="mt-12">
          <BuilderShowcase />
        </Reveal>
      </section>

      {/* Trust. */}
      <section aria-labelledby="trust-heading" className="bg-panel/60 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <span className="chip text-ink">Designed for trust</span>
            <h2 id="trust-heading" className="headline mt-6 text-4xl text-ink md:text-5xl">
              Your rules, enforced by code. Not by us.
            </h2>
          </Reveal>
          <ul className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
            {TRUST.map((item, i) => (
              <Reveal as="li" key={item.title} delay={i * 120} className="group">
                <div className="overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#e3e6f3_0%,#f6e6da_100%)]">
                  <Image
                    src={item.art}
                    alt=""
                    width={1024}
                    height={1024}
                    unoptimized
                    className="h-auto w-full transition-[scale] duration-1000 ease-spring group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-6 text-2xl font-medium text-ink">{item.title}</h3>
                <p className="mt-2 font-serif text-lg leading-relaxed text-muted">{item.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* The kernel's guarantees on navy, over a field of dots that reacts to the cursor. */}
      <section aria-labelledby="kernel-heading" className="relative isolate overflow-hidden bg-ink py-24 text-on-ink md:py-32" data-nav-theme="dark">
        <DotField className="absolute inset-0 -z-10 size-full" />
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <Reveal className="max-w-3xl">
            <span className="chip text-on-ink/80">The kernel</span>
            <h2 id="kernel-heading" className="headline mt-6 text-4xl md:text-6xl">
              One hook runs every pool, and it keeps every block in check.
            </h2>
          </Reveal>
          <dl className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map((g, i) => (
              <Reveal key={g.value} delay={i * 100} className="flex flex-col gap-10 bg-ink/80 p-6 backdrop-blur-sm">
                <dt className="order-2 font-serif text-lg leading-snug text-on-ink/75">{g.label}</dt>
                <dd className="tabular order-1 text-6xl font-medium tracking-tight text-accent">{g.value}</dd>
              </Reveal>
            ))}
          </dl>
          {deployment && (
            <Reveal className="mt-10">
              <Link
                href={`/hooks/${deployment.kernel}`}
                className="font-serif text-lg text-on-ink/80 underline underline-offset-4 transition-colors duration-300 hover:text-accent"
              >
                Read the kernel in the hook reader
              </Link>
            </Reveal>
          )}
        </div>
      </section>

      {/* Questions. */}
      <section aria-labelledby="faq-heading" className="mx-auto grid max-w-[1200px] gap-10 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <Reveal className="lg:sticky lg:top-32 lg:self-start">
          <span className="chip text-ink">Questions</span>
          <h2 id="faq-heading" className="headline mt-6 text-4xl text-ink md:text-5xl">
            Answers before you build.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <Faq items={FAQ} />
        </Reveal>
      </section>

      {/* Closing: the same promise over a sunset cloudscape. */}
      <section aria-labelledby="cta-heading" className="relative isolate overflow-hidden">
        <Image
          src="/art/sunset.webp"
          alt=""
          width={2048}
          height={1152}
          unoptimized
          className="absolute inset-0 -z-10 size-full object-cover object-bottom"
        />
        <div className="mx-auto flex min-h-[640px] max-w-[1200px] flex-col items-center px-4 pt-32 pb-48 text-center sm:px-6">
          <Reveal as="h2" id="cta-heading" className="headline text-5xl text-ink md:text-7xl">
            Start building.
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-md font-serif text-xl leading-relaxed text-ink/80">
              Compose your rules, watch the fee curve, and launch in one transaction.
            </p>
          </Reveal>
          <Reveal delay={200} className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/build" className="pill pill-ink pill-lg">
              Launch token
            </Link>
            <Link href="/hooks" className="pill pill-soft pill-lg">
              Read a hook
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
