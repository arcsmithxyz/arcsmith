import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { CreatorView } from "@/components/creator/CreatorView";

export async function generateMetadata(props: PageProps<"/creators/[address]">): Promise<Metadata> {
  const { address } = await props.params;
  return { title: isAddress(address) ? `Creator ${address.slice(0, 6)}…${address.slice(-4)}` : "Creator" };
}

export default async function CreatorPage(props: PageProps<"/creators/[address]">) {
  const { address } = await props.params;
  if (!isAddress(address)) notFound();
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <CreatorView address={getAddress(address.toLowerCase())} />
    </div>
  );
}
