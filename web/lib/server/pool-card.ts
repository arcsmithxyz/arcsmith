import { erc20Abi } from "viem";
import { blockCatalogAbi } from "../abi/BlockCatalog";
import { hookKernelAbi } from "../abi/HookKernel";
import { launchpadAbi } from "../abi/Launchpad";
import { parseMetadata } from "../blocks";
import { chain, deployment, isUsdc } from "../config";
import { formatFee, formatQuoted } from "../format";
import { subjectPrice } from "../market";
import { cached } from "./cache";
import { serverClient } from "./chain";

/** What a pool's share card and page metadata show, already formatted. */
export type PoolCard = {
  name: string;
  symbol: string;
  quoteSymbol: string;
  isLaunch: boolean;
  price: string;
  fdv: string;
  buyFee: string;
  sellFee: string;
  blocks: string[];
};

/** One pool's card data, read from the chain the site runs on. Cached a minute; null if missing. */
export function getPoolCard(id: bigint): Promise<PoolCard | null> {
  return cached(`pool-card:${chain.id}:${id}`, 60, () => loadPoolCard(id));
}

async function loadPoolCard(id: bigint): Promise<PoolCard | null> {
  if (!deployment) return null;
  const d = deployment;
  const client = serverClient(chain);
  const count = await client.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: "marketCount" });
  if (id >= count) return null;

  const [[market], state] = await Promise.all([
    client.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: "getMarket", args: [id] }),
    client.readContract({ address: d.launchpad, abi: launchpadAbi, functionName: "marketState", args: [id] }),
  ]);
  const [fees, blocks, name, symbol, decimals, supply, quoteSymbol, quoteDecimals] = await Promise.all([
    client.readContract({ address: d.kernel, abi: hookKernelAbi, functionName: "previewFees", args: [market.poolId] }),
    client.readContract({ address: d.kernel, abi: hookKernelAbi, functionName: "blocksOf", args: [market.poolId] }),
    client.readContract({ address: market.subject, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: market.subject, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: market.subject, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: market.subject, abi: erc20Abi, functionName: "totalSupply" }),
    client.readContract({ address: market.quote, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: market.quote, abi: erc20Abi, functionName: "decimals" }),
  ]);
  const entries = await Promise.all(
    blocks.map((block) => client.readContract({ address: d.catalog, abi: blockCatalogAbi, functionName: "entryOf", args: [block] })),
  );

  const price = subjectPrice(state[0], market.subjectIsCurrency0, decimals, quoteDecimals);
  const usd = isUsdc(market.quote);
  return {
    name,
    symbol,
    quoteSymbol,
    isLaunch: market.isLaunch,
    price: cardPrice(price, quoteSymbol, usd),
    fdv: formatQuoted(price * (Number(supply) / 10 ** decimals), quoteSymbol, usd, "total"),
    buyFee: formatFee(Number(fees[0])),
    sellFee: formatFee(Number(fees[1])),
    blocks: entries.map((entry, i) => parseMetadata(entry.metadataURI)?.name ?? `Block ${i + 1}`),
  };
}

/**
 * Prices for images: the site's subscript notation ($0.0₅4995) needs glyphs the card font may
 * not have, so tiny prices are written out in full instead.
 */
function cardPrice(value: number, quoteSymbol: string, usd: boolean) {
  if (!(value > 0) || value >= 0.001) return formatQuoted(value, quoteSymbol, usd);
  const digits = Math.min(18, Math.ceil(-Math.log10(value)) + 3);
  const text = value.toFixed(digits);
  return usd ? `$${text}` : `${text} ${quoteSymbol}`;
}
