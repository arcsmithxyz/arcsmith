import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress } from "viem";
import { BlockDetail } from "@/components/blocks/BlockDetail";
import { isAddress } from "@/lib/permissions";

export const metadata: Metadata = { title: "Block" };

export default async function BlockPage(props: PageProps<"/blocks/[address]">) {
  const { address } = await props.params;
  if (!isAddress(address)) notFound();
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <BlockDetail address={getAddress(address.toLowerCase())} />
    </div>
  );
}
