"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    title: "Pick your blocks",
    body: "Launch guard, dump damper, auto burn, surge fee, or reviewed community blocks. Up to five per pool, each with its own settings.",
    art: "/art/step-pick.webp",
  },
  {
    title: "Preview every fee",
    body: "The builder asks the real block contracts what each trade would pay and draws the curve before anything touches the chain.",
    art: "/art/step-preview.webp",
  },
  {
    title: "Launch, or open a market",
    body: "Mint a new token into a locked pool, or put your rules on a token that already exists. The rules freeze the moment it opens.",
    art: "/art/step-launch.webp",
  },
];

/**
 * The reference's pinned story: on wide screens the section is three screens tall, the
 * content stays pinned, and each screen of scrolling advances one step. Narrow screens get
 * the steps stacked instead.
 */
export function StoryScroll() {
  const [active, setActive] = useState(0);
  const triggers = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // A step is active while its screen-tall trigger crosses the middle of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    triggers.current.forEach((t) => t && observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-labelledby="story-heading">
      {/* Wide screens: pinned. */}
      <div className="relative hidden md:block" style={{ height: `${STEPS.length * 100}vh` }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              triggers.current[i] = el;
            }}
            data-step={i}
            aria-hidden
            className="absolute inset-x-0 h-screen"
            style={{ top: `${i * 100}vh` }}
          />
        ))}
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[1fr_1fr] items-center gap-16 px-6">
            <div>
              <span className="chip text-ink">How it works</span>
              <h2 id="story-heading" className="headline mt-8 text-5xl text-ink lg:text-6xl">
                Every pool is a set of rules you can see
              </h2>
              <ol className="mt-12 flex flex-col gap-2">
                {STEPS.map((step, i) => {
                  const on = i === active;
                  return (
                    <li
                      key={step.title}
                      aria-current={on ? "step" : undefined}
                      className={`grid grid-cols-[2.5rem_1fr] gap-x-4 rounded-2xl p-4 transition-[background-color,opacity] duration-700 ease-spring ${
                        on ? "bg-panel/80 opacity-100 shadow-panel" : "opacity-45"
                      }`}
                    >
                      <span
                        className={`tabular grid size-10 place-items-center rounded-full border font-serif text-lg transition-colors duration-700 ${
                          on ? "border-ink bg-ink text-on-ink" : "border-ink/30 text-ink"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span>
                        <span className="block text-xl font-medium text-ink">{step.title}</span>
                        <span
                          className={`grid transition-[grid-template-rows] duration-700 ease-spring ${
                            on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <span className="overflow-hidden">
                            <span className="block pt-2 font-serif text-lg leading-relaxed text-muted">{step.body}</span>
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="relative aspect-square">
              {STEPS.map((step, i) => (
                <Image
                  key={step.art}
                  src={step.art}
                  alt=""
                  width={1024}
                  height={1024}
                  unoptimized
                  className={`absolute inset-0 size-full object-contain transition-[opacity,scale,filter] duration-1000 ease-spring ${
                    i === active ? "scale-100 opacity-100 blur-0" : "scale-90 opacity-0 blur-md"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Narrow screens: stacked. */}
      <div className="mx-auto max-w-[1200px] px-4 py-24 md:hidden">
        <span className="chip text-ink">How it works</span>
        <h2 className="headline mt-6 text-4xl text-ink">Every pool is a set of rules you can see</h2>
        <ol className="mt-10 flex flex-col gap-12">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Image src={step.art} alt="" width={1024} height={1024} unoptimized className="mx-auto h-auto w-3/4" />
              <p className="mt-4 text-xl font-medium text-ink">
                <span className="mr-3 font-serif text-muted">{i + 1}</span>
                {step.title}
              </p>
              <p className="mt-2 font-serif text-lg leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
