"use client";

import { useEffect, useRef } from "react";

const GAP = 22;
const RADIUS = 140; // cursor influence, px

/**
 * A field of dots on the dark band. A slow wave rolls through it, and dots near the cursor
 * swell, warm to Arc gold and lean away. Pauses offscreen; with reduced motion it draws a
 * single still frame.
 */
export function DotField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let pointer = { x: -9999, y: -9999 };
    let visible = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) draw(0);
    };

    function draw(time: number) {
      ctx!.clearRect(0, 0, width, height);
      const t = time / 1000;
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          // Rolling wave, diagonal across the field.
          const wave = 0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.008 - t * 0.9);
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy);
          const near = Math.max(0, 1 - dist / RADIUS);
          const push = near * near * 10;
          const px = x + (dist > 0 ? (dx / dist) * push : 0);
          const py = y + (dist > 0 ? (dy / dist) * push : 0);
          const size = 0.9 + wave * 0.7 + near * 2.4;
          ctx!.globalAlpha = 0.18 + wave * 0.22 + near * 0.6;
          ctx!.fillStyle = near > 0.15 ? "#e9a13f" : "#acc6e9";
          ctx!.beginPath();
          ctx!.arc(px, py, size, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
      ctx!.globalAlpha = 1;
    }

    const tick = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (still || frame || !visible || document.hidden) return;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      pointer = { x: -9999, y: -9999 };
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    canvas.parentElement?.addEventListener("pointermove", onPointer, { passive: true });
    canvas.parentElement?.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      canvas.parentElement?.removeEventListener("pointermove", onPointer);
      canvas.parentElement?.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
