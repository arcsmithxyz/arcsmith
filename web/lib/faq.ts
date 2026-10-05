/** Frequently asked questions, shared by the home page and the docs. */
export type FaqItem = { question: string; answer: string };

export const FAQ: FaqItem[] = [
  {
    question: "What is a hook?",
    answer:
      "A Uniswap v4 hook is a contract a pool calls on every trade. It can change the fee, refuse a trade or take a cut. Here one kernel hook runs every pool and asks that pool's blocks what to do.",
  },
  {
    question: "Do I need to write code?",
    answer:
      "No. Pick blocks, set their numbers, and the builder draws the fee curve before you launch. Developers can write new blocks and submit them to the catalog.",
  },
  {
    question: "What happens to liquidity when I launch?",
    answer:
      "The whole supply goes into a Uniswap v4 pool against USDC and stays locked there. Nobody can pull it out: not you, not the platform.",
  },
  {
    question: "Can the rules change after launch?",
    answer:
      "No. A pool's blocks and settings freeze when it opens. Retiring a block from the catalog only stops new pools from choosing it.",
  },
  {
    question: "What stops a bad block from hurting a pool?",
    answer:
      "Blocks are read only and run on a fixed gas budget. If one fails it is skipped. Whatever blocks ask for, the kernel caps fees at 50% for the first 15 minutes and 10% after.",
  },
  {
    question: "Can I add rules to a token that already exists?",
    answer:
      "Yes. Open a market for any Arc token at a starting price you choose; liquidity providers earn its fees. The launch guard is for new tokens only.",
  },
  {
    question: "How do block authors get paid?",
    answer:
      "An approved block earns a royalty: a share of the protocol's fee from every launch that uses it. It never comes out of the creator's share.",
  },
  {
    question: "Is it audited?",
    answer:
      "Not yet. The contracts are tested, including on a copy of Arc mainnet, but they are unaudited. Use only what you can afford to lose.",
  },
];
