import Link from "next/link";
import { BlockIcon } from "@/components/BlockIcon";
import { Reveal } from "@/components/motion/Reveal";
import { PRESETS } from "@/lib/presets";

const NAMES = { guard: "Launch guard", damper: "Dump damper", burn: "Auto burn", surge: "Surge fee" } as const;

/** What creators want, in their words, each opening the builder with the blocks that do it. */
export function SayIt() {
  return (
    <section aria-labelledby="say-it-heading" className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
      <Reveal className="max-w-2xl">
        <span className="chip text-ink">Start from a sentence</span>
        <h2 id="say-it-heading" className="headline mt-6 text-4xl text-ink md:text-5xl">
          If you can say it, your pool can do it.
        </h2>
        <p className="mt-4 font-serif text-xl leading-relaxed text-muted">
          Pick what you want. The builder opens with reviewed blocks already set up, and you can change every setting before you
          launch.
        </p>
      </Reveal>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.map((preset, i) => (
          <Reveal as="li" key={preset.id} delay={i * 60}>
            <Link
              href={`/build?preset=${preset.id}`}
              className="group flex h-full flex-col rounded-3xl border border-line bg-panel p-6 transition-[border-color,translate] duration-300 ease-spring hover:-translate-y-0.5 hover:border-ink/30"
            >
              <p className="flex-1 font-serif text-xl leading-snug text-ink">&ldquo;{preset.says}&rdquo;</p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {preset.blocks.length === 0 ? (
                  <span className="rounded-full bg-ink/6 px-3 py-1 text-sm text-muted">Base fee {preset.baseFee}%, no blocks</span>
                ) : (
                  preset.blocks.map((b) => (
                    <span key={b.kind} className="flex items-center gap-1.5 rounded-full bg-ink/6 py-1 pr-3 pl-1 text-sm text-ink">
                      <BlockIcon kind={b.kind} size="sm" />
                      {NAMES[b.kind]}
                    </span>
                  ))
                )}
              </div>
              <span className="mt-5 text-sm font-medium text-validator">
                Open in the builder{" "}
                <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
