"use client";

import { useState } from "react";

import type { FaqItem } from "@/lib/faq";

/** Hairline-divided accordion: each answer slides open under its question. */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="border-t border-ink/15">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <li key={item.question} className="border-b border-ink/15">
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={expanded}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(expanded ? null : i)}
                className="group flex w-full items-center justify-between gap-6 py-6 text-left text-xl font-medium text-ink transition-colors duration-300 ease-spring hover:text-validator focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-validator"
              >
                {item.question}
                {/* Plus that folds into a minus. */}
                <span aria-hidden className="relative grid size-8 shrink-0 place-items-center rounded-full border border-ink/20 transition-colors duration-300 group-hover:border-ink/50">
                  <span className="absolute h-px w-3 bg-current" />
                  <span
                    className={`absolute h-3 w-px bg-current transition-transform duration-500 ease-spring ${expanded ? "scale-y-0" : ""}`}
                  />
                </span>
              </button>
            </h3>
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              className={`grid transition-[grid-template-rows] duration-500 ease-spring ${
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-6 font-serif text-lg leading-relaxed text-muted">{item.answer}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
