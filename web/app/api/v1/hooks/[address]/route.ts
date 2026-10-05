import { getAddress } from "viem";
import { isAddress } from "@/lib/permissions";
import { apiError, apiJson, apiPreflight, overLimit } from "@/lib/server/api";
import { checkHook } from "@/lib/server/hook-check";

export const dynamic = "force-dynamic";

/**
 * What a hook can do, from its address: plain yes/no abilities, the 14 permission flags,
 * whether its source is published. Needs no index, so it keeps answering when the index is down.
 */
export async function GET(request: Request, context: RouteContext<"/api/v1/hooks/[address]">) {
  const limited = await overLimit(request);
  if (limited) return limited;

  const { address } = await context.params;
  if (!isAddress(address)) return apiError(400, "invalid_address", "Give a 42-character address starting with 0x.");
  return apiJson(await checkHook(getAddress(address.toLowerCase())), 300);
}

export const OPTIONS = apiPreflight;
