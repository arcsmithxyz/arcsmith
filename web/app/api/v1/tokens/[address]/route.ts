import { getAddress } from "viem";
import { isAddress } from "@/lib/permissions";
import { apiError, apiJson, apiPreflight, overLimit } from "@/lib/server/api";
import { checkToken } from "@/lib/server/hook-check";

export const dynamic = "force-dynamic";

/** Every Uniswap v4 pool a token trades in on Arc, the hook each one runs and what that hook can do. */
export async function GET(request: Request, context: RouteContext<"/api/v1/tokens/[address]">) {
  const limited = await overLimit(request);
  if (limited) return limited;

  const { address } = await context.params;
  if (!isAddress(address)) return apiError(400, "invalid_address", "Give a 42-character address starting with 0x.");

  try {
    const withCost = new URL(request.url).searchParams.get("cost") === "true";
    const result = await checkToken(getAddress(address.toLowerCase()), withCost);
    if (!result) return apiError(404, "token_not_found", "The Arc index doesn't know this address as a token in any Uniswap v4 pool.");
    return apiJson(result, 30);
  } catch {
    return apiError(502, "index_unavailable", "The Arc index didn't answer. Try again in a minute.");
  }
}

export const OPTIONS = apiPreflight;
