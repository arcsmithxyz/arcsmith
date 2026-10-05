"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1400;
// Fast start, soft landing (easeOutExpo).
const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * A number that counts up to `value` the first time it scrolls into view, and glides to new
 * values after that. With reduced motion it simply shows the value.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);
  const from = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const next = origin + (value - origin) * ease(t);
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [started, value]);

  return (
    <span ref={ref} className="tabular">
      {format(started ? shown : 0)}
    </span>
  );
}
