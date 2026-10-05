"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ContractAddress } from "../ContractAddress";
import { SparkleTrail } from "./SparkleTrail";

/**
 * Parallax for one layer: follows the pointer by `move` px at the edges and drifts with
 * scroll at `scroll` px per px scrolled. Reads --mx / --my / --sy set on the section.
 */
const layer = (move: number, scroll: number) =>
  ({
    translate: `calc(var(--mx, 0) * ${move}px) calc(var(--my, 0) * ${move * 0.6}px + var(--sy, 0) * ${scroll}px)`,
  }) as React.CSSProperties;

/** Illustrated dawn sky: stippled clouds, the floating block stack, live sparkle dust. */
export function HeroSky() {
  const ref = useRef<HTMLElement>(null);
  const objectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = ref.current;
    if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let mx = 0;
    let my = 0;
    // Pointer and scroll only write CSS variables, once per frame.
    const flush = () => {
      frame = 0;
      section.style.setProperty("--mx", mx.toFixed(3));
      section.style.setProperty("--my", my.toFixed(3));
      section.style.setProperty("--sy", String(Math.min(window.scrollY, 1200)));
    };
    const queue = () => {
      frame ||= requestAnimationFrame(flush);
    };
    const onPointer = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
      queue();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", queue);
    };
  }, []);

  return (
    <section ref={ref} className="sky-dawn grain relative isolate flex min-h-[clamp(760px,100svh,1080px)] flex-col overflow-hidden">
      {/* Clouds, far to near. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[38%] -left-[8%] w-[44vw] max-w-[640px] min-w-[280px] opacity-70" style={layer(22, -0.16)}>
          <Image src="/art/cloud-c.webp" alt="" width={2048} height={1152} unoptimized priority className="h-auto w-full" />
        </div>
        <div className="absolute top-[9%] right-[1%] w-[30vw] max-w-[400px] min-w-[180px]" style={layer(28, -0.12)}>
          <Image src="/art/cloud-b.webp" alt="" width={1536} height={1024} unoptimized priority className="h-auto w-full opacity-90" />
        </div>
        <div className="absolute bottom-[4%] -left-[10%] w-[58vw] max-w-[820px] min-w-[340px]" style={layer(16, -0.22)}>
          <Image src="/art/cloud-a.webp" alt="" width={1536} height={1024} unoptimized priority className="h-auto w-full" />
        </div>
        <div className="absolute -right-[6%] -bottom-[8%] w-[48vw] max-w-[680px] min-w-[300px]" style={layer(10, -0.3)}>
          <Image src="/art/cloud-a.webp" alt="" width={1536} height={1024} unoptimized className="h-auto w-full -scale-x-100" />
        </div>
      </div>

      {/* Sparkles pour from the lowest block, wherever the stack sits and floats. */}
      <SparkleTrail anchor={objectRef} anchorX={0.5} anchorY={0.72} className="pointer-events-none absolute inset-0 -z-10 size-full" />

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 pt-[calc(var(--header-space)+3rem)] pb-16 sm:px-6">
        <p className="enter mx-auto">
          <span className="chip text-ink">Uniswap v4 hooks on Arc</span>
        </p>

        {/* Headline split around the floating object, like the reference's plane. */}
        <div className="relative mt-10 flex-1 md:mt-12">
          <h1 className="headline relative z-10 text-6xl text-ink sm:text-7xl lg:text-8xl">
            <span className="enter block md:pl-[12%]" style={{ "--enter-delay": "120ms" } as React.CSSProperties}>
              Hooks
            </span>
            <span
              className="enter mt-56 block text-right md:mt-20 md:pr-[6%] lg:mt-16"
              style={{ "--enter-delay": "240ms" } as React.CSSProperties}
            >
              from blocks
            </span>
          </h1>
          {/* Placement (outer) and parallax (inner) stay on separate elements: both use `translate`. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-6 left-1/2 w-[min(70vw,360px)] -translate-x-1/2 md:top-4 md:left-[21%] md:w-[min(34vw,460px)] md:translate-x-0"
          >
            <div style={layer(12, 0.08)}>
              <div className="enter" style={{ "--enter-delay": "360ms" } as React.CSSProperties}>
                <div ref={objectRef} className="animate-[float_7s_ease-in-out_infinite]">
                  <Image
                    src="/art/hero-blocks.webp"
                    alt=""
                    width={1024}
                    height={1024}
                    unoptimized
                    priority
                    className="h-auto w-full drop-shadow-[0_24px_40px_rgb(27_49_88/0.18)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="enter relative z-10 mt-10 flex flex-col items-start gap-6 md:ml-auto md:max-w-sm"
          style={{ "--enter-delay": "480ms" } as React.CSSProperties}
        >
          <p className="font-serif text-xl leading-relaxed text-ink/85">
            Compose Uniswap v4 hook rules from on-chain blocks, see what every trade will pay, and launch in one transaction.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/build" className="pill pill-ink pill-lg">
              Launch token
            </Link>
            <ContractAddress size="lg" className="bg-panel/60 text-ink backdrop-blur-sm" />
          </div>
        </div>
      </div>
    </section>
  );
}
