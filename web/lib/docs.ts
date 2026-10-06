/** The docs' table of contents: groups in sidebar order. The first page is /docs itself. */
export type DocPage = { slug: string; title: string; description: string };

export const DOC_GROUPS: { title: string; pages: DocPage[] }[] = [
  {
    title: "Getting started",
    pages: [
      { slug: "", title: "Introduction", description: "What Arcsmith is and who it's for." },
      { slug: "quick-start", title: "Quick start", description: "Launch a token with your own rules in about two minutes." },
      { slug: "how-it-works", title: "How it works", description: "One kernel hook, many small blocks, rules frozen per pool." },
    ],
  },
  {
    title: "Guides",
    pages: [
      { slug: "launch-a-token", title: "Launch a token", description: "What a launch does, what it costs and how creators earn." },
      { slug: "existing-tokens", title: "Rules for an existing token", description: "Open a hooked market for any token on Arc." },
      { slug: "trading-and-liquidity", title: "Trading and liquidity", description: "Fees, slippage, the launch floor and full-range positions." },
      { slug: "hook-reader", title: "Reading any hook", description: "What the hook reader shows and how to read it." },
      { slug: "api", title: "Hook check API", description: "Ask what any Uniswap v4 hook on Arc can do, from your own app. Free, no key." },
      { slug: "mcp", title: "AI assistants (MCP)", description: "Let Claude, Cursor or any MCP client check hooks on Arc while it answers you." },
    ],
  },
  {
    title: "Blocks",
    pages: [
      { slug: "blocks", title: "Native blocks", description: "Launch guard, dump damper, auto burn and surge fee, setting by setting." },
      { slug: "write-a-block", title: "Write your own block", description: "The block interface, config schema, review and royalties." },
    ],
  },
  {
    title: "Protocol",
    pages: [
      { slug: "safety", title: "Safety guarantees", description: "What the kernel enforces, whatever the blocks do." },
      { slug: "fees", title: "Fees and royalties", description: "Where every trading fee goes." },
      { slug: "trust-model", title: "Who controls what", description: "The owner's powers, and what nobody can do." },
      { slug: "contracts", title: "Contract addresses", description: "Every Arcsmith contract on Arc mainnet and testnet." },
    ],
  },
  {
    title: "Help",
    pages: [
      { slug: "faq", title: "FAQ", description: "Short answers to common questions." },
      { slug: "risks", title: "Risks", description: "What can go wrong, plainly." },
    ],
  },
];

export const DOC_PAGES = DOC_GROUPS.flatMap((group) => group.pages);

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

export function docPage(slug: string) {
  return DOC_PAGES.find((page) => page.slug === slug);
}
