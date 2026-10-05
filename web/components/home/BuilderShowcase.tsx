"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const DWELL_MS = 6500;

const TABS = [
  { title: "Compose", body: "Stack up to five blocks and set each one's numbers. Settings forms come from the block's own on-chain description." },
  { title: "Preview", body: "Watch the fee curve change as you type. The numbers come from the real block contracts, not a simulation of them." },
  { title: "Launch", body: "One transaction mints the token, opens the pool and locks the supply, or opens a market for a token you already hold." },
  { title: "Trade", body: "Every pool page shows live fees, its frozen rules, trading, liquidity and the creator's earnings in one place." },
];

/**
 * A real screenshot of the app in a soft frame, with four tabs that take turns. The active
 * tab fills while it dwells; hovering or focusing the tabs, or scrolling away, pauses it.
 */
export function BuilderShowcase() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div className="sky-dawn grain overflow-hidden rounded-[32px] p-3 sm:p-6 lg:p-10">
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-panel shadow-[0_30px_80px_rgb(27_49_88/0.18)]">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3" aria-hidden>
            <span className="size-2.5 rounded-full bg-clay/60" />
            <span className="size-2.5 rounded-full bg-sand" />
            <span className="size-2.5 rounded-full bg-sky" />
          </div>
          <Image
            src="/art/app-pool.webp"
            alt="A pool page: live fees, the pool's frozen rules, and panels to trade and add liquidity."
            width={1440}
            height={830}
            unoptimized
            className="h-auto w-full"
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="What the builder does"
        className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {TABS.map((tab, i) => {
          const selected = i === active;
          return (
            <button
              key={tab.title}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(i)}
              className={`relative overflow-hidden rounded-2xl p-5 text-left transition-[background-color,opacity] duration-500 ease-spring focus-visible:outline-2 focus-visible:outline-validator ${
                selected ? "bg-panel opacity-100 shadow-panel" : "opacity-60 hover:opacity-90"
              }`}
            >
              {/* Progress line along the top while this tab dwells. */}
              <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink/8">
                {selected && (
                  <span
                    key={active}
                    className="block h-full origin-left bg-ink"
                    style={{ animation: `dwell ${DWELL_MS}ms linear forwards`, animationPlayState: held || !inView ? "paused" : "running" }}
                    onAnimationEnd={() => setActive((active + 1) % TABS.length)}
                  />
                )}
              </span>
              <span className="block font-serif text-sm text-muted">
                {i + 1} of {TABS.length}
              </span>
              <span className="mt-1 block text-xl font-medium text-ink">{tab.title}</span>
              <span className="mt-2 block font-serif leading-relaxed text-muted">{tab.body}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
