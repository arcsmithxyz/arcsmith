"use client";

import { useEffect, useRef } from "react";

// One observer for every revealed element on the page. Elements are shown once, when a
// tenth of them is inside the viewport, and then left alone.
let observer: IntersectionObserver | undefined;

function observe(element: Element) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-visible", "");
        observer?.unobserve(entry.target);
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
  );
  observer.observe(element);
  return () => observer?.unobserve(element);
}

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger siblings by giving each a later start, in milliseconds. */
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "p" | "h2";
  id?: string;
};

/**
 * Content that rises out of a blur as it scrolls into view. The hidden state lives in
 * globals.css behind `(scripting: enabled)` and reduced-motion checks, so without
 * JavaScript or with reduced motion everything is simply visible.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div", id }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return observe(ref.current);
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      id={id}
      data-reveal=""
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
