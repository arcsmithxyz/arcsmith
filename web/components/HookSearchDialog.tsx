"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { HookSearch } from "./HookSearch";

/**
 * Search icon for the header: opens a small dialog with the Hook Reader's address box, so any
 * hook or token can be read from any page. "/" opens it too, unless you're typing in a field.
 */
export function HookSearchDialog({ className = "" }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const fieldId = useId();

  // Opens the dialog with the cursor already in the address box.
  const openDialog = () => {
    dialog.current?.showModal();
    dialog.current?.querySelector("input")?.focus();
  };

  // Close once the search has navigated somewhere.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (
        event.key === "/" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        openDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Read a hook"
        title="Read a hook ( / )"
        onClick={openDialog}
        className={`grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,translate] duration-300 ease-spring ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${fieldId}-title`}
        // A click on the backdrop lands on the dialog element itself: close.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[min(560px,calc(100%-2rem))] rounded-3xl border border-line bg-bg p-0 text-text shadow-panel backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id={`${fieldId}-title`}
                className="text-xl font-medium text-ink"
              >
                Read any hook on Arc
              </h2>
              <p className="mt-1 font-serif text-muted">
                Paste a hook or token address to see what it can do with your
                trade.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/6 hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-5">
            <HookSearch id={fieldId} />
          </div>
        </div>
      </dialog>
    </>
  );
}
