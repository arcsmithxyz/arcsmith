import { APP_NAME, X_URL } from "@/lib/config";

/** The X logo, drawn in the current text colour. */
export function XIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Round icon button to the project's X profile. Until `X_URL` is set it renders as a
 * dimmed, non-interactive icon with a "coming soon" label.
 */
export function XLink({ className = "" }: { className?: string }) {
  const base = `grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,opacity,translate] duration-300 ease-spring ${className}`;

  if (!X_URL) {
    return (
      <span role="img" aria-label={`${APP_NAME} on X: coming soon`} title="X account coming soon" className={`${base} cursor-default opacity-45`}>
        <XIcon />
      </span>
    );
  }

  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={`${APP_NAME} on X`}
      className={`${base} opacity-80 hover:-translate-y-px hover:bg-current/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-validator`}
    >
      <XIcon />
    </a>
  );
}
