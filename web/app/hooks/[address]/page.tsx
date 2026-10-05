import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress } from "viem";
import { HookReport } from "@/components/HookReport";
import { TokenHooks } from "@/components/hooks/TokenHooks";
import { isAddress, summarizePermissions } from "@/lib/permissions";
import { readerKind, tokenPools } from "@/lib/server/hook-reader";
import { poolPathOfToken } from "@/lib/server/markets";
import { poolCostsWithin } from "@/lib/server/pool-cost";
import { tokenIdentity } from "@/lib/server/token-identity";
import { ZERO } from "@/lib/subgraph";

type Props = PageProps<"/hooks/[address]">;

/** A hook, or (when the index knows the address as a token, not a hook) the pools a token trades in. */
async function kindOf(address: string) {
  // If the index is down, fall back to the hook report: it still decodes the address.
  return readerKind(address).catch(() => "hook" as const);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { address } = await props.params;
  if (!isAddress(address)) return { title: "Hook reader" };
  if ((await kindOf(address)) === "token") {
    const data = await tokenPools(address).catch(() => null);
    if (data?.token) {
      const hooked = data.pools.filter((p) => p.hooks !== ZERO).length;
      return {
        title: `${data.token.symbol}: its pools and hooks`,
        description: `${data.token.symbol} trades in ${data.pools.length} Uniswap v4 ${data.pools.length === 1 ? "pool" : "pools"} on Arc; ${hooked} run a hook.`,
      };
    }
  }
  return { title: `Hook ${address.slice(0, 6)}…${address.slice(-4)}`, description: summarizePermissions(address) };
}

export default async function HookPage(props: Props) {
  const [{ address }, search] = await Promise.all([props.params, props.searchParams]);
  if (!isAddress(address)) notFound();
  const checksummed = getAddress(address.toLowerCase());

  if ((await kindOf(address)) === "token") {
    const data = await tokenPools(address).catch(() => null);
    if (data?.token) {
      const [arcsmithPath, costs, identity] = await Promise.all([
        poolPathOfToken(checksummed).catch(() => null),
        poolCostsWithin(data.pools, ZERO),
        tokenIdentity({ address: checksummed, symbol: data.token.symbol, name: data.token.name }).catch(() => null),
      ]);
      return (
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <TokenHooks address={checksummed} token={data.token} pools={data.pools} capped={data.capped} arcsmithPath={arcsmithPath} costs={costs} identity={identity} />
        </div>
      );
    }
  }

  // ?pool=<id> picks that pool in the swap preview (links from a token's list of pools).
  const pool = typeof search.pool === "string" && /^0x[0-9a-fA-F]{64}$/.test(search.pool) ? search.pool.toLowerCase() : undefined;
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <HookReport address={checksummed} focusPoolId={pool} />
    </div>
  );
}
