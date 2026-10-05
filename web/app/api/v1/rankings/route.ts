import { apiError, apiJson, apiPreflight, overLimit } from "@/lib/server/api";
import { checkRankings } from "@/lib/server/hook-check";

export const dynamic = "force-dynamic";

/** The busiest hooks on Arc by volume, without the ones that are wash trading. Cached for five minutes. */
export async function GET(request: Request) {
  const limited = await overLimit(request);
  if (limited) return limited;

  try {
    return apiJson(await checkRankings(), 300);
  } catch {
    return apiError(502, "index_unavailable", "The Arc index didn't answer. Try again in a minute.");
  }
}

export const OPTIONS = apiPreflight;
