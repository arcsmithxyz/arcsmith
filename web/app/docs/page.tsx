import type { Metadata } from "next";
import { DocArticle } from "@/components/docs/DocArticle";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Arcsmith works: building Uniswap v4 hooks from blocks on Arc, launching, fees, safety and contracts.",
};

export default function DocsHome() {
  return <DocArticle slug="" />;
}
