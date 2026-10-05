"use client";

import { useEffect, useRef } from "react";

// Arc gold, sand and clay, with a little sky blue.
const COLORS = ["#e9a13f", "#ffcc6f", "#fbe3b0", "#c0827a", "#acc6e9"];
const MAX_PARTICLES = 220;

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };

type Props = {
  /** Element the stream pours from; followed every frame, so it can float and move. */
  anchor: React.RefObject<HTMLElement | null>;
  /** Emitter position inside the anchor, as fractions of its width and height. */
  anchorX: number;
  anchorY: number;
  className?: string;
};

/**
 * Live sparkle dust: a steady stream drifts down and to the left from a point on the hero
 * object, and the cursor sheds a few sparks as it moves over the section. Pauses
 * offscreen; draws nothing with reduced motion.
 */
export function SparkleTrail({ anchor, anchorX, anchorY, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (x: number, y: number, spread: number, burst = false) => {
      if (particles.length >= MAX_PARTICLES) return;
      const angle = burst ? Math.random() * Math.PI * 2 : Math.PI * 0.72 + (Math.random() - 0.5) * 0.5;
      const speed = burst ? 0.3 + Math.random() * 0.9 : 0.25 + Math.random() * 0.55;
      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        max: burst ? 40 + Math.random() * 40 : 140 + Math.random() * 160,
        size: 0.6 + Math.random() * (burst ? 1.8 : 1.6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      ctx.clearRect(0, 0, width, height);

      // Steady stream from the anchor.
      const target = anchor.current?.getBoundingClientRect();
      if (target) {
        const own = canvas.getBoundingClientRect();
        const x = target.left - own.left + target.width * anchorX;
        const y = target.top - own.top + target.height * anchorY;
        for (let i = 0; i < 3; i++) spawn(x, y, target.width * 0.06);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.003 * dt; // a hint of gravity
        p.vx *= 0.999;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        // Fade in fast, fade out slowly, with a twinkle.
        const t = p.life / p.max;
        const alpha = Math.min(1, t * 8) * (1 - t) * (0.65 + 0.35 * Math.sin(p.life * 0.3 + p.x));
        ctx.globalAlpha = Math.max(alpha, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      for (let i = 0; i < 3; i++) spawn(x, y, 6, true);
    };

    const start = () => {
      if (frame || !visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
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
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [anchor, anchorX, anchorY]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
