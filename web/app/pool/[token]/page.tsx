import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PoolView } from "@/components/PoolView";
import { resolvePoolPage } from "@/lib/server/markets";
import { getPoolCard } from "@/lib/server/pool-card";

type Props = PageProps<"/pool/[token]">;

async function resolve(props: Props) {
  const [{ token }, search] = await Promise.all([props.params, props.searchParams]);
  const market = typeof search.market === "string" ? search.market : undefined;
  return resolvePoolPage(token, market);
}

// Title and description for shared links; the image comes from opengraph-image.tsx.
export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await resolve(props).catch(() => null);
  const card = page?.kind === "page" ? await getPoolCard(page.id).catch(() => null) : null;
  if (!card) return { title: "Pool" };
  const rules = card.blocks.length > 0 ? card.blocks.join(", ") : "the base fee";
  return {
    title: `${card.symbol} / ${card.quoteSymbol}`,
    description: `${card.name} at ${card.price}, buy fee ${card.buyFee}, sell fee ${card.sellFee}. Rules: ${rules}, frozen at launch.`,
  };
}

export default async function PoolPage(props: Props) {
  const page = await resolve(props);
  if (page.kind === "redirect") permanentRedirect(page.path);
  if (page.kind === "missing") notFound();
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <PoolView id={page.id} others={page.others} />
    </div>
  );
}
