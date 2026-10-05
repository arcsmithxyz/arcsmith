import Link from "next/link";
import { APP_NAME, chain, deployment, explorerAddressUrl } from "@/lib/config";
import { ContractAddress } from "./ContractAddress";
import { XLink } from "./XLink";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/build", label: "Launch token" },
      { href: "/discover", label: "Discover" },
      { href: "/portfolio", label: "Portfolio" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/hooks", label: "Hook reader" },
      { href: "/docs/api", label: "Hook check API" },
      { href: "/analytics", label: "Analytics" },
      { href: "/blocks", label: "Block catalog" },
      { href: "/blocks/submit", label: "Submit a block" },
      { href: "/docs", label: "Docs" },
    ],
  },
];

// Links slide right a touch and pick up the navy on hover.
const LINK =
  "inline-flex py-1 font-serif text-lg text-muted transition-[color,translate] duration-500 ease-spring hover:translate-x-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-validator";

/** Closes every page: link columns, contracts, and the name set very large. */
export function SiteFooter() {
  const contracts = deployment
    ? [
        { href: explorerAddressUrl(deployment.kernel), label: "Hook kernel" },
        { href: explorerAddressUrl(deployment.launchpad), label: "Launchpad" },
        { href: explorerAddressUrl(deployment.catalog), label: "Block catalog" },
      ].filter((c): c is { href: string; label: string } => Boolean(c.href))
    : [];

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-bg">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 pt-16 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="flex max-w-xs flex-col gap-6">
          <p className="font-serif text-lg leading-relaxed text-muted">
            Uniswap v4 hooks built from blocks, on Arc. Unaudited software: use only what you can afford to lose.
            An independent project, not affiliated with Arc or Circle.
          </p>
          <div className="flex items-center gap-2 text-ink">
            <ContractAddress />
            <XLink className="border border-current/20" />
          </div>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="mb-3 text-sm font-medium text-ink">{column.title}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label="Contracts">
          <p className="mb-3 text-sm font-medium text-ink">Contracts on {chain.name}</p>
          {contracts.length > 0 ? (
            <ul>
              {contracts.map((c) => (
                <li key={c.label}>
                  <a href={c.href} target="_blank" rel="noreferrer" className={LINK}>
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-serif text-lg text-muted">{deployment ? "No explorer on this network." : "Not deployed yet."}</p>
          )}
        </nav>
      </div>

      {/* The wordmark, sized to the page width and cropped at the bottom edge. */}
      <p
        aria-hidden
        className="headline mt-16 -mb-[0.22em] text-center text-[22vw] leading-none text-ink/90 select-none"
      >
        {APP_NAME}
      </p>
    </footer>
  );
}
